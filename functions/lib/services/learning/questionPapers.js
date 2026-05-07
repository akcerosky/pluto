import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../../lib/firebaseAdmin.js';
import { PLAN_DEFINITIONS } from '../../config/plans.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { estimateAiInputTokens } from '../tokenUsage.js';
import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';
import { searchExamFormatSources } from './searchAdapter.js';
const userRoot = (uid) => adminDb.collection('users').doc(uid);
const questionPaperCollection = (uid) => userRoot(uid).collection('questionPapers');
const MAX_PDF_SOURCE_TEXT_CHARS = 16000;
const INFER_SUBJECT_TEXT_CHARS = 6000;
const FORMAT_RESEARCH_TIMEOUT_MS = 60_000;
const QUESTION_PAPER_GENERATION_TIMEOUT_MS = 90_000;
const questionPaperFormatSectionSchema = z.object({
    name: z.string().trim().min(1).max(160),
    instructions: z.string().trim().min(1).max(2000),
    questionType: z.string().trim().min(1).max(160),
    questions: z.number().int().min(1),
    marksPerQuestion: z.number().int().min(1),
});
const questionPaperQuestionSchema = z.object({
    id: z.string().trim().min(1).max(200),
    sectionName: z.string().trim().min(1).max(160),
    questionNumber: z.number().int().min(1),
    text: z.string().trim().min(1).max(6000),
    type: z.enum(['mcq', 'short_answer', 'long_answer', 'fill_blank', 'assertion_reason']),
    marks: z.number().int().min(1),
    options: z.array(z.string().trim().min(1).max(1000)).max(8).optional(),
    subParts: z.array(z.string().trim().min(1).max(2000)).max(8).optional(),
});
const questionPaperDocSchema = z.object({
    id: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    subject: z.string().trim().min(1).max(120),
    educationLevel: z.string().trim().min(1).max(80),
    examBoard: z.string().trim().min(1).max(120),
    topic: z.string().trim().min(1).max(200).optional(),
    sourceType: z.enum(['topic', 'pdf']),
    sourcePdfNames: z.array(z.string().trim().min(1).max(260)).max(8).optional(),
    sourcePdfTextLength: z.number().int().min(0).optional(),
    format: z.object({
        totalMarks: z.number().int().min(1),
        duration: z.string().trim().min(1).max(120),
        sections: z.array(questionPaperFormatSectionSchema).min(1),
    }),
    questions: z.array(questionPaperQuestionSchema).min(1),
    generatedAt: z.string().datetime(),
    status: z.literal('ready'),
    pdfUrl: z.string().trim().min(1).optional(),
    webSearchSources: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    failureMessage: z.string().trim().min(1).optional(),
});
const questionPaperFailureUpdateSchema = z.object({
    status: z.literal('failed'),
    failureMessage: z.string().trim().min(1).max(1000),
});
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const toStringList = (value, maxItems) => Array.isArray(value)
    ? value
        .filter(isNonEmptyString)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
const humanizeLabel = (value) => value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
const extractJsonCandidate = (value) => {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }
    const firstBrace = value.indexOf('{');
    const lastBrace = value.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return value.slice(firstBrace, lastBrace + 1).trim();
    }
    return value.trim();
};
const safeJsonParse = (value) => {
    try {
        return JSON.parse(extractJsonCandidate(value));
    }
    catch {
        return null;
    }
};
const normalizeFormatFallback = ({ subject, educationLevel, examBoard, }) => ({
    totalMarks: 80,
    duration: '3 hours',
    sections: [
        {
            name: 'Section A',
            instructions: `Answer all questions for ${examBoard} ${educationLevel} ${subject}.`,
            questionType: 'Short Answer',
            questions: 10,
            marksPerQuestion: 2,
        },
        {
            name: 'Section B',
            instructions: 'Answer any 6 questions.',
            questionType: 'Long Answer',
            questions: 6,
            marksPerQuestion: 10,
        },
    ],
});
const truncateSourceText = (value) => value.slice(0, MAX_PDF_SOURCE_TEXT_CHARS);
const buildPdfSourceDigestPrompt = ({ extractedText, educationLevel, examBoard, }) => `
You are preparing a source-grounded exam paper for ${examBoard} ${educationLevel}.

Read the extracted study material below and return ONLY valid JSON:
{
  "subject": string,
  "primaryTopic": string,
  "coveredConcepts": string[],
  "keyFacts": string[],
  "questionBoundaries": string[]
}

Rules:
- Use ONLY concepts explicitly supported by the source material.
- Do not broaden to the full subject syllabus.
- If the material is narrow, keep the topic narrow.
- "coveredConcepts" should be 4 to 10 concise concept labels.
- "keyFacts" should be 6 to 18 short factual statements drawn from the source.
- "questionBoundaries" should list specific things the final question paper must avoid if they are not clearly covered.
- If the source is clearly about Electricity inside Physics, say that directly instead of just "Physics".

Source material:
${truncateSourceText(extractedText)}
`.trim();
const buildPdfSourceContext = (digest) => `
SOURCE COVERAGE
Subject: ${digest.subject}
Primary topic: ${digest.primaryTopic}

Covered concepts:
${digest.coveredConcepts.map((concept) => `- ${concept}`).join('\n')}

Key facts from the source:
${digest.keyFacts.map((fact) => `- ${fact}`).join('\n')}

Question boundaries:
${digest.questionBoundaries.map((boundary) => `- ${boundary}`).join('\n')}
`.trim();
const zeroUsage = () => ({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usageSource: 'provider',
});
const addUsages = (...usages) => usages.reduce((acc, usage) => ({
    inputTokens: acc.inputTokens + (usage?.inputTokens ?? 0),
    outputTokens: acc.outputTokens + (usage?.outputTokens ?? 0),
    totalTokens: acc.totalTokens + (usage?.totalTokens ?? 0),
    usageSource: acc.usageSource === 'estimated' || usage?.usageSource === 'estimated'
        ? 'estimated'
        : 'provider',
}), zeroUsage());
const reserveForTextCall = ({ plan, maxOutputTokens, }) => PLAN_DEFINITIONS[plan].maxInputTokensPerRequest + maxOutputTokens;
const estimatePdfAttachmentTokens = (pdfAttachments) => pdfAttachments.reduce((sum, attachment) => sum + Math.ceil(attachment.sizeBytes / 128), 0);
export const normalizePdfSourceDigest = (parsed) => {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const candidate = parsed;
    if (!isNonEmptyString(candidate.subject) || !isNonEmptyString(candidate.primaryTopic)) {
        return null;
    }
    const coveredConcepts = toStringList(candidate.coveredConcepts, 10).map(humanizeLabel);
    const keyFacts = toStringList(candidate.keyFacts, 18);
    const questionBoundaries = toStringList(candidate.questionBoundaries, 10);
    if (coveredConcepts.length === 0 || keyFacts.length === 0) {
        return null;
    }
    return {
        subject: humanizeLabel(candidate.subject),
        primaryTopic: humanizeLabel(candidate.primaryTopic),
        coveredConcepts,
        keyFacts,
        questionBoundaries,
    };
};
export const buildQuestionPaperMeteringPlan = ({ plan, }) => ({
    meteringContext: {
        prompt: 'question-paper-generation',
        educationLevel: 'General',
        mode: 'ExamPrep',
        objective: 'Generate question paper',
        history: [],
        contextSummaryText: undefined,
    },
    reservedTokens: reserveForTextCall({ plan, maxOutputTokens: 1200 }) +
        reserveForTextCall({ plan, maxOutputTokens: 2500 }),
});
export const buildPdfQuestionPaperMeteringPlan = ({ plan, educationLevel, examBoard, pdfAttachments, }) => {
    const prompt = `Extract all text content from these ${examBoard} ${educationLevel} documents. Preserve structure and do not summarize.`;
    const extractionInputTokens = estimateAiInputTokens({
        prompt,
        educationLevel,
        mode: 'ExamPrep',
        objective: 'Extract document text',
        history: [],
    }) + estimatePdfAttachmentTokens(pdfAttachments);
    return {
        meteringContext: {
            prompt: 'pdf-question-paper-generation',
            educationLevel,
            mode: 'ExamPrep',
            objective: 'Generate paper from PDFs',
            history: [],
            contextSummaryText: undefined,
        },
        reservedTokens: extractionInputTokens + 4000 +
            reserveForTextCall({ plan, maxOutputTokens: 1200 }) +
            reserveForTextCall({ plan, maxOutputTokens: 50 }) +
            reserveForTextCall({ plan, maxOutputTokens: 1200 }) +
            reserveForTextCall({ plan, maxOutputTokens: 2500 }),
    };
};
const buildQuestionPaperPrompt = ({ subject, educationLevel, examBoard, topic, format, sourceContext, }) => `
You are an expert examiner for ${examBoard} ${educationLevel} examinations.

Based on this official-style format:
- Total marks: ${format.totalMarks}
- Duration: ${format.duration}
- Sections: ${JSON.stringify(format.sections)}

${sourceContext ? `IMPORTANT: Generate questions ONLY from the following source coverage.\n${sourceContext}\n` : ''}

${sourceContext ? `Hard constraints:
- Every question must be answerable from the source coverage above.
- Do not ask about any broader chapter content unless it appears in the source coverage.
- If the source is focused on one subtopic, keep the whole paper focused on that subtopic.
- Prefer rephrasing, applications, definitions, numericals, and short explanations that stay inside the source boundaries.
- Do not introduce outside facts, formulas, or chapter names that are not supported by the source coverage.
` : ''}

Generate a complete question paper for ${topic || subject}.
Return ONLY valid JSON matching:
{
  "title": string,
  "format": { "totalMarks": number, "duration": string, "sections": [...] },
  "questions": [
    {
      "id": string,
      "sectionName": string,
      "questionNumber": number,
      "text": string,
      "type": "mcq" | "short_answer" | "long_answer" | "fill_blank" | "assertion_reason",
      "marks": number,
      "options"?: string[],
      "subParts"?: string[]
    }
  ]
}`.trim();
const buildFormatResearchPrompt = ({ query, results, }) => `
Research query: ${query}
Sources:
${results.map((result, index) => `${index + 1}. ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}`).join('\n\n')}

Infer the most likely exam paper structure and return ONLY valid JSON:
{
  "totalMarks": number,
  "duration": string,
  "sections": [
    {
      "name": string,
      "instructions": string,
      "questionType": string,
      "questions": number,
      "marksPerQuestion": number
    }
  ]
}`.trim();
const validateQuestions = (questions) => Array.isArray(questions) &&
    questions.length > 0 &&
    questions.every((question) => Boolean(question.id && question.sectionName && question.text));
const inferQuestionType = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('mcq') || normalized.includes('multiple'))
        return 'mcq';
    if (normalized.includes('fill'))
        return 'fill_blank';
    if (normalized.includes('assertion'))
        return 'assertion_reason';
    if (normalized.includes('long'))
        return 'long_answer';
    return 'short_answer';
};
const toQuestionText = (value) => {
    if (typeof value === 'string')
        return value.trim();
    if (value && typeof value === 'object') {
        const record = value;
        const fromText = typeof record.text === 'string' ? record.text.trim() : '';
        if (fromText)
            return fromText;
        const fromQuestion = typeof record.question === 'string' ? record.question.trim() : '';
        if (fromQuestion)
            return fromQuestion;
    }
    return '';
};
const toQuestionList = (rawQuestions, fallbackSectionName, fallbackQuestionType) => {
    if (!Array.isArray(rawQuestions)) {
        return [];
    }
    return rawQuestions
        .map((rawQuestion, index) => {
        const record = rawQuestion && typeof rawQuestion === 'object'
            ? rawQuestion
            : null;
        const text = toQuestionText(rawQuestion);
        if (!text) {
            return null;
        }
        const options = Array.isArray(record?.options)
            ? record?.options.map((option) => String(option).trim()).filter(Boolean)
            : undefined;
        const subParts = Array.isArray(record?.subParts)
            ? record?.subParts.map((part) => String(part).trim()).filter(Boolean)
            : Array.isArray(record?.parts)
                ? record?.parts.map((part) => String(part).trim()).filter(Boolean)
                : undefined;
        return {
            id: typeof record?.id === 'string' ? record.id : `q-${index + 1}`,
            sectionName: typeof record?.sectionName === 'string' && record.sectionName.trim()
                ? record.sectionName
                : fallbackSectionName,
            questionNumber: typeof record?.questionNumber === 'number'
                ? record.questionNumber
                : typeof record?.number === 'number'
                    ? record.number
                    : index + 1,
            text,
            type: inferQuestionType(record?.type ?? fallbackQuestionType),
            marks: typeof record?.marks === 'number'
                ? record.marks
                : typeof record?.mark === 'number'
                    ? record.mark
                    : 1,
            ...(options?.length ? { options } : {}),
            ...(subParts?.length ? { subParts } : {}),
        };
    })
        .filter((question) => Boolean(question));
};
const normalizeGeneratedPaperResponse = (parsed) => {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const record = parsed;
    const format = record.format && typeof record.format === 'object'
        ? record.format
        : null;
    if (!format || !Array.isArray(format.sections) || format.sections.length === 0) {
        return null;
    }
    let questions = toQuestionList(record.questions, format.sections[0]?.name || 'Section A');
    if (questions.length === 0) {
        questions = format.sections.flatMap((section, sectionIndex) => {
            const matchingSection = Array.isArray(record.sections) && record.sections[sectionIndex] && typeof record.sections[sectionIndex] === 'object'
                ? record.sections[sectionIndex]
                : null;
            return toQuestionList(matchingSection?.questions, section.name, section.questionType);
        });
    }
    if (!validateQuestions(questions)) {
        return null;
    }
    return {
        title: typeof record.title === 'string' && record.title.trim()
            ? record.title
            : '',
        format,
        questions,
    };
};
const normalizeQuestionPaperPayload = ({ fallbackTitle, format, questions, }) => ({
    title: humanizeLabel(fallbackTitle),
    format: {
        ...format,
        duration: String(format.duration || '').trim() || '3 hours',
        sections: format.sections.map((section) => ({
            ...section,
            name: humanizeLabel(section.name),
            questionType: humanizeLabel(section.questionType),
            instructions: String(section.instructions || '').trim(),
        })),
    },
    questions: questions.map((question, index) => ({
        ...(() => {
            const options = question.options?.map((option) => String(option).trim()).filter(Boolean);
            const subParts = question.subParts?.map((part) => String(part).trim()).filter(Boolean);
            return {
                ...question,
                id: question.id || `q-${index + 1}`,
                questionNumber: Number(question.questionNumber) || index + 1,
                sectionName: humanizeLabel(question.sectionName),
                text: String(question.text || '').trim(),
                type: question.type || 'short_answer',
                marks: Number(question.marks) || 1,
                ...(options?.length ? { options } : {}),
                ...(subParts?.length ? { subParts } : {}),
            };
        })(),
    })),
});
export const researchQuestionPaperFormat = async ({ subject, educationLevel, examBoard, plan, uid, requestId, }) => {
    const query = `${examBoard} ${educationLevel} ${subject} question paper format marking scheme`;
    let results = [];
    try {
        results = await searchExamFormatSources(query);
    }
    catch {
        results = [];
    }
    if (results.length === 0) {
        return {
            format: normalizeFormatFallback({ subject, educationLevel, examBoard }),
            sources: [],
            usage: zeroUsage(),
        };
    }
    const response = await executeHybridAiRequest({
        prompt: buildFormatResearchPrompt({ query, results }),
        educationLevel,
        mode: 'ExamPrep',
        objective: `Research ${examBoard} exam structure`,
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 1200,
        totalTimeoutMs: FORMAT_RESEARCH_TIMEOUT_MS,
    });
    const parsed = safeJsonParse(response.text);
    return {
        format: parsed?.totalMarks && Array.isArray(parsed.sections) && parsed.sections.length > 0
            ? parsed
            : normalizeFormatFallback({ subject, educationLevel, examBoard }),
        sources: results.map((result) => result.url),
        usage: response.usage,
    };
};
export const generateQuestionPaperForUser = async ({ uid, subject, educationLevel, examBoard, topic, plan, sourceType, sourcePdfNames, sourcePdfTextLength, sourceContext, requestId, }) => {
    const paperRef = questionPaperCollection(uid).doc();
    const generatedAt = new Date().toISOString();
    const startedAt = Date.now();
    let failedStep = 'format_research';
    logger.info('paper_generation_started', {
        eventType: 'paper_generation_started',
        requestId,
        uid,
        subject,
        examBoard,
        educationLevel,
        sourceType,
    });
    await paperRef.set({
        id: paperRef.id,
        title: `${educationLevel} ${examBoard} ${subject}`,
        subject,
        educationLevel,
        examBoard,
        topic: topic ?? null,
        sourceType,
        sourcePdfNames: sourcePdfNames ?? null,
        sourcePdfTextLength: sourcePdfTextLength ?? null,
        format: null,
        questions: [],
        generatedAt,
        status: 'generating',
        webSearchSources: [],
    });
    try {
        const research = await researchQuestionPaperFormat({
            subject,
            educationLevel,
            examBoard,
            plan,
            uid,
            requestId,
        });
        failedStep = 'generation';
        const response = await executeHybridAiRequest({
            prompt: buildQuestionPaperPrompt({
                subject,
                educationLevel,
                examBoard,
                topic,
                format: research.format,
                sourceContext,
            }),
            educationLevel,
            mode: 'ExamPrep',
            objective: `Generate ${examBoard} question paper`,
            plan,
            uid,
            requestId,
            history: [],
            summaryCandidates: [],
            attachments: [],
            maxOutputTokens: 2500,
            totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
        });
        const parsed = normalizeGeneratedPaperResponse(safeJsonParse(response.text));
        if (!parsed?.format || !validateQuestions(parsed.questions)) {
            throw new Error('Question paper generation returned invalid JSON.');
        }
        const normalized = normalizeQuestionPaperPayload({
            fallbackTitle: parsed.title || `${educationLevel} ${examBoard} ${subject} Exam`,
            format: parsed.format,
            questions: parsed.questions,
        });
        const paper = questionPaperDocSchema.parse({
            id: paperRef.id,
            title: normalized.title,
            subject,
            educationLevel,
            examBoard,
            sourceType,
            format: normalized.format,
            questions: normalized.questions,
            generatedAt,
            status: 'ready',
            webSearchSources: research.sources,
            ...(topic ? { topic } : {}),
            ...(sourcePdfNames?.length ? { sourcePdfNames } : {}),
            ...(typeof sourcePdfTextLength === 'number' ? { sourcePdfTextLength } : {}),
        });
        await paperRef.set(paper);
        logger.info('paper_generation_completed', {
            eventType: 'paper_generation_completed',
            requestId,
            uid,
            subject,
            examBoard,
            educationLevel,
            sourceType,
            questionCount: paper.questions.length,
            sectionCount: paper.format.sections.length,
            latencyMs: Date.now() - startedAt,
        });
        return { paper, usage: addUsages(research.usage, response.usage) };
    }
    catch (error) {
        logger.warn('paper_generation_failed', {
            eventType: 'paper_generation_failed',
            requestId,
            uid,
            subject,
            examBoard,
            educationLevel,
            sourceType,
            step: failedStep,
            errorMessage: error instanceof Error ? error.message : String(error),
            latencyMs: Date.now() - startedAt,
        });
        await paperRef.set(questionPaperFailureUpdateSchema.parse({
            status: 'failed',
            failureMessage: error instanceof Error ? error.message : String(error),
        }), { merge: true });
        throw error;
    }
};
export const listQuestionPapers = async (uid) => {
    const snapshot = await questionPaperCollection(uid).orderBy('generatedAt', 'desc').get();
    const papers = snapshot.docs.map((doc) => doc.data());
    const grouped = papers.reduce((acc, paper) => {
        const key = paper.subject || 'General';
        acc[key] = [...(acc[key] ?? []), paper];
        return acc;
    }, {});
    return { papers, grouped };
};
export const deleteQuestionPaperForUser = async (uid, paperId) => {
    await questionPaperCollection(uid).doc(paperId).delete();
    return { ok: true };
};
export const getQuestionPaper = async (uid, paperId) => {
    const snapshot = await questionPaperCollection(uid).doc(paperId).get();
    if (!snapshot.exists) {
        throw new Error('Question paper not found.');
    }
    return snapshot.data();
};
export const generateQuestionPaperPdfForUser = async ({ uid, paperId, requestId, }) => {
    const paper = await getQuestionPaper(uid, paperId);
    try {
        return {
            base64Pdf: generateQuestionPaperPdfBase64(paper),
            filename: `${paper.title.replace(/[^\w.-]+/g, '_')}.pdf`,
        };
    }
    catch (error) {
        logger.warn('paper_generation_failed', {
            eventType: 'paper_generation_failed',
            requestId,
            uid,
            subject: paper.subject,
            examBoard: paper.examBoard,
            educationLevel: paper.educationLevel,
            sourceType: paper.sourceType,
            step: 'pdf',
            errorMessage: error instanceof Error ? error.message : String(error),
            latencyMs: 0,
        });
        throw error;
    }
};
export const extractPdfTextWithNovaLite = async ({ uid, plan, educationLevel, examBoard, pdfAttachments, requestId, }) => {
    const response = await executeHybridAiRequest({
        prompt: `Extract all text content from these ${examBoard} ${educationLevel} documents. Preserve structure and do not summarize.`,
        educationLevel,
        mode: 'ExamPrep',
        objective: 'Extract document text',
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: pdfAttachments,
        maxOutputTokens: 4000,
        totalTimeoutMs: 140_000,
    });
    return { text: response.text, usage: response.usage };
};
export const inferSubjectFromText = async ({ uid, plan, educationLevel, extractedText, requestId, }) => {
    const response = await executeHybridAiRequest({
        prompt: `What subject is this document about? Return one short subject label only.\n\n${extractedText.slice(0, INFER_SUBJECT_TEXT_CHARS)}`,
        educationLevel,
        mode: 'Conversational',
        objective: 'Infer subject',
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 50,
    });
    return {
        subject: response.text.replace(/["'\n]/g, '').trim() || 'General Studies',
        usage: response.usage,
    };
};
export const summarizePdfSourceMaterial = async ({ uid, plan, educationLevel, examBoard, extractedText, requestId, }) => {
    const response = await executeHybridAiRequest({
        prompt: buildPdfSourceDigestPrompt({
            extractedText,
            educationLevel,
            examBoard,
        }),
        educationLevel,
        mode: 'Conversational',
        objective: 'Summarize PDF source coverage',
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: 1200,
    });
    return {
        digest: normalizePdfSourceDigest(safeJsonParse(response.text)),
        usage: response.usage,
    };
};
export const buildFallbackPdfSourceContext = (extractedText) => `Source excerpt:\n${truncateSourceText(extractedText)}`;
export const buildPdfTopicFromDigest = (digest) => digest?.primaryTopic && digest.primaryTopic.toLowerCase() !== digest.subject.toLowerCase()
    ? digest.primaryTopic
    : undefined;
export const buildSubjectFromDigest = (digest) => digest?.subject || '';
export const buildSourceContextFromDigest = (digest, extractedText) => digest ? buildPdfSourceContext(digest) : buildFallbackPdfSourceContext(extractedText);
