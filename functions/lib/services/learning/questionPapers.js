import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../../lib/firebaseAdmin.js';
import { PLAN_DEFINITIONS } from '../../config/plans.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { estimateAiInputTokens } from '../tokenUsage.js';
import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';
import { sanitizePdfRenderableText, sanitizeQuestionPaperText, } from './questionPaperSanitizer.js';
import { searchExamFormatSources } from './searchAdapter.js';
const userRoot = (uid) => adminDb.collection('users').doc(uid);
const questionPaperCollection = (uid) => userRoot(uid).collection('questionPapers');
class QuestionPaperJsonParseError extends Error {
    parseErrorMessage;
    rawResponse;
    rawPreview;
    constructor({ message, parseErrorMessage, rawResponse, }) {
        super(message);
        this.name = 'QuestionPaperJsonParseError';
        this.parseErrorMessage = parseErrorMessage;
        this.rawResponse = rawResponse;
        this.rawPreview = rawResponse.slice(0, 500);
    }
}
const MAX_PDF_SOURCE_TEXT_CHARS = 16000;
const INFER_SUBJECT_TEXT_CHARS = 6000;
const FORMAT_RESEARCH_TIMEOUT_MS = 60_000;
const QUESTION_PAPER_GENERATION_TIMEOUT_MS = 90_000;
const QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS = 4096;
const INCOMPLETE_QUESTION_OUTPUT_MIN_LENGTH = 500;
const INCOMPLETE_QUESTION_OUTPUT_RETRY_NOTE = 'Previous attempt returned incomplete output. Please generate a complete, detailed response.';
const questionPaperFormatSectionSchema = z.object({
    name: z.string().trim().min(1).max(160),
    displayName: z.string().trim().min(1).max(200).optional(),
    instructions: z.string().trim().min(1).max(2000),
    questionType: z.string().trim().min(1).max(160),
    questionTypeDisplay: z.string().trim().min(1).max(200).optional(),
    questions: z.number().int().min(1),
    marksPerQuestion: z.number().int().min(1),
    totalMarks: z.number().int().min(1).optional(),
});
const questionPaperQuestionSchema = z.object({
    id: z.string().trim().min(1).max(200),
    sectionName: z.string().trim().min(1).max(160),
    questionNumber: z.number().int().min(1),
    text: z.string().trim().min(1).max(6000),
    type: z.enum(['mcq', 'short_answer', 'long_answer', 'essay', 'fill_blank', 'assertion_reason']),
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
    headerBoardName: z.string().trim().min(1).max(160).optional(),
    examinationTitle: z.string().trim().min(1).max(200).optional(),
    sessionLabel: z.string().trim().min(1).max(120).optional(),
    subjectCode: z.string().trim().min(1).max(80).optional(),
    generalInstructions: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
    matchedFormatFamily: z.string().trim().min(1).max(120).optional(),
    formatSource: z.enum(['official', 'family_fallback']).optional(),
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
const toTitleCase = (value) => sanitizeQuestionPaperText(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
const inferFormatFamily = (examBoard) => {
    const normalized = examBoard.toLowerCase();
    if (/cbse|icse|igcse|ib|cambridge|state board/.test(normalized)) {
        return 'school_board';
    }
    if (/university|semester|college|anna university|mumbai university|aiims internal|autonomous/.test(normalized)) {
        return 'university_exam';
    }
    if (/upsc|ssc|ibps|rbi|sebi|isro|drdo|psc|nta|jee|neet|cat|clat|gate|cuet|ielts|gmat|gre|sat/.test(normalized)) {
        return 'competitive_exam';
    }
    if (/icai|icsi|icmai|nmc|bar council|aicte|ca|cs|cma|mbbs|law/.test(normalized)) {
        return 'professional_exam';
    }
    return 'general_exam';
};
const buildFallbackGeneralInstructions = (examBoard, formatFamily) => {
    if (/cbse/i.test(examBoard)) {
        return [
            'All questions are compulsory.',
            'Read the questions carefully before answering.',
            'Use neat and clear presentation throughout the paper.',
        ];
    }
    if (/neet/i.test(examBoard)) {
        return [
            'All questions are compulsory.',
            'Each correct answer carries 4 marks and each incorrect answer attracts a deduction as per the official scheme.',
            'Use rough work space only where permitted.',
        ];
    }
    if (/icai|ca/i.test(examBoard)) {
        return [
            'The figures in the margin on the right side indicate full marks.',
            'Answers should be supported by proper working notes wherever necessary.',
            'Working notes should form part of the answer.',
        ];
    }
    if (formatFamily === 'university_exam') {
        return [
            'Answer the questions in the prescribed section order unless stated otherwise.',
            'Show the necessary steps, formulae, and workings wherever relevant.',
            'All questions carry the marks indicated against them.',
        ];
    }
    return [
        'All questions are compulsory unless otherwise stated.',
        'Figures in the right margin indicate full marks for each question.',
        'Write clearly and support your answers with steps wherever relevant.',
    ];
};
export const buildFormatResearchQuery = ({ examBoard, educationLevel, subject, }) => `${examBoard} ${educationLevel} ${subject} sample question paper marking scheme official`;
const extractJsonCandidate = (value) => {
    let candidate = value.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidate = candidate.slice(firstBrace, lastBrace + 1).trim();
    }
    candidate = candidate.replace(/,\s*([}\]])/g, '$1');
    return candidate;
};
const buildIncompleteQuestionRetryPrompt = (prompt) => `${INCOMPLETE_QUESTION_OUTPUT_RETRY_NOTE}\n\n${prompt}`;
const safeJsonParse = (value) => {
    try {
        return JSON.parse(extractJsonCandidate(value));
    }
    catch {
        return null;
    }
};
const parseErrorPosition = (message) => {
    const match = message.match(/position (\d+)/i);
    return match ? Number(match[1]) : null;
};
const tryEndTruncationRepair = (rawResponse, parseErrorMessage) => {
    if (rawResponse.length <= 500) {
        return null;
    }
    const position = parseErrorPosition(parseErrorMessage);
    if (position === null || position <= rawResponse.length * 0.8) {
        return null;
    }
    const candidate = extractJsonCandidate(rawResponse);
    for (const suffix of ['"]}]}', ']}', '}]}', '"}]}', '"}]']) {
        try {
            return JSON.parse(`${candidate}${suffix}`);
        }
        catch {
            continue;
        }
    }
    return null;
};
const parseJsonWithRepair = ({ rawResponse, requestId, subject, examBoard, educationLevel, isRetry, }) => {
    if (rawResponse.length < 200) {
        logger.warn('paper_generation_response_too_short', {
            eventType: 'paper_generation_response_too_short',
            requestId,
            subject,
            examBoard,
            educationLevel,
            isRetry,
            rawResponseLength: rawResponse.length,
            rawResponsePreview: rawResponse.slice(0, 500),
        });
        throw new QuestionPaperJsonParseError({
            message: isRetry
                ? `Question paper generation returned invalid JSON after retry. Raw response length: ${rawResponse.length}`
                : `Question paper generation response was too short to parse. Raw response length: ${rawResponse.length}`,
            parseErrorMessage: 'Response too short',
            rawResponse,
        });
    }
    const candidate = extractJsonCandidate(rawResponse);
    try {
        return JSON.parse(candidate);
    }
    catch (error) {
        const parseErrorMessage = error instanceof Error ? error.message : String(error);
        const repaired = tryEndTruncationRepair(rawResponse, parseErrorMessage);
        if (repaired !== null) {
            logger.warn('paper_generation_truncation_repaired', {
                eventType: 'paper_generation_truncation_repaired',
                requestId,
                subject,
                examBoard,
                educationLevel,
                isRetry,
                parseErrorMessage,
                rawResponseLength: rawResponse.length,
            });
            return repaired;
        }
        logger.warn('paper_generation_json_parse_failed', {
            eventType: 'paper_generation_json_parse_failed',
            requestId,
            subject,
            examBoard,
            educationLevel,
            isRetry,
            parseErrorMessage,
            rawResponseLength: rawResponse.length,
            rawResponsePreview: rawResponse.slice(0, 500),
        });
        throw new QuestionPaperJsonParseError({
            message: isRetry
                ? `Question paper generation returned invalid JSON after retry. Raw response length: ${rawResponse.length}`
                : `Question paper generation returned invalid JSON. Parse error: ${parseErrorMessage}`,
            parseErrorMessage,
            rawResponse,
        });
    }
};
const normalizeFormatFallback = ({ subject, educationLevel, examBoard, }) => {
    const matchedFormatFamily = inferFormatFamily(examBoard);
    if (matchedFormatFamily === 'competitive_exam') {
        return {
            totalMarks: 80,
            duration: '3 hours',
            headerBoardName: examBoard,
            examinationTitle: `${educationLevel} Examination`,
            sessionLabel: String(new Date().getFullYear()),
            generalInstructions: buildFallbackGeneralInstructions(examBoard, matchedFormatFamily),
            matchedFormatFamily,
            formatSource: 'family_fallback',
            sections: [
                {
                    name: 'SECTION A',
                    displayName: 'SECTION A',
                    instructions: `Answer all multiple choice questions in ${subject}.`,
                    questionType: 'Multiple Choice Questions',
                    questionTypeDisplay: 'Multiple Choice Questions',
                    questions: 20,
                    marksPerQuestion: 1,
                    totalMarks: 20,
                },
                {
                    name: 'SECTION B',
                    displayName: 'SECTION B',
                    instructions: 'Answer all short answer questions.',
                    questionType: 'Short Answer Questions',
                    questionTypeDisplay: 'Short Answer Questions',
                    questions: 10,
                    marksPerQuestion: 2,
                    totalMarks: 20,
                },
                {
                    name: 'SECTION C',
                    displayName: 'SECTION C',
                    instructions: 'Answer all long answer questions.',
                    questionType: 'Long Answer Questions',
                    questionTypeDisplay: 'Long Answer Questions',
                    questions: 6,
                    marksPerQuestion: 5,
                    totalMarks: 30,
                },
                {
                    name: 'SECTION D',
                    displayName: 'SECTION D',
                    instructions: 'Answer the descriptive question.',
                    questionType: 'Essay / Descriptive',
                    questionTypeDisplay: 'Essay / Descriptive',
                    questions: 1,
                    marksPerQuestion: 10,
                    totalMarks: 10,
                },
            ],
        };
    }
    return {
        totalMarks: 80,
        duration: '3 hours',
        headerBoardName: examBoard,
        examinationTitle: `${educationLevel} Examination`,
        sessionLabel: String(new Date().getFullYear()),
        generalInstructions: buildFallbackGeneralInstructions(examBoard, matchedFormatFamily),
        matchedFormatFamily,
        formatSource: 'family_fallback',
        sections: [
            {
                name: 'SECTION A',
                displayName: 'SECTION A',
                instructions: `Answer all short answer questions for ${examBoard} ${educationLevel} ${subject}.`,
                questionType: 'Short Answer Questions',
                questionTypeDisplay: 'Short Answer Questions',
                questions: 10,
                marksPerQuestion: 2,
                totalMarks: 20,
            },
            {
                name: 'SECTION B',
                displayName: 'SECTION B',
                instructions: 'Answer all long answer questions.',
                questionType: 'Long Answer Questions',
                questionTypeDisplay: 'Long Answer Questions',
                questions: 6,
                marksPerQuestion: 5,
                totalMarks: 30,
            },
            {
                name: 'SECTION C',
                displayName: 'SECTION C',
                instructions: 'Answer the essay or descriptive questions.',
                questionType: 'Essay / Descriptive',
                questionTypeDisplay: 'Essay / Descriptive',
                questions: 3,
                marksPerQuestion: 10,
                totalMarks: 30,
            },
        ],
    };
};
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
        reserveForTextCall({ plan, maxOutputTokens: 1600 }) +
        reserveForTextCall({ plan, maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS }),
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
            reserveForTextCall({ plan, maxOutputTokens: 1600 }) +
            reserveForTextCall({ plan, maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS }),
    };
};
const buildQuestionPaperStructurePrompt = ({ subject, educationLevel, examBoard, topic, format, sourceContext, }) => `
You are an official question paper setter for ${examBoard} ${educationLevel} ${subject} examinations.

Generate the official paper header, instructions, and section structure only.

Requirements:
1. EXACTLY matches the official ${examBoard} format including section names, question types, mark distribution, and general instructions
2. Uses correct mark allocation: MCQ = 1 mark, Short Answer = 2-3 marks, Long Answer = 5-6 marks, Essay = 8-10 marks
3. Total marks must equal exactly ${format.totalMarks}
4. Includes board-specific general instructions verbatim where standard
5. For professional exams (CA, CS, MBBS): follow the exact pattern of that body's official papers

Do not generate any questions in this call.

Official format to follow strictly:
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

Generate the paper structure for ${topic || subject}.
Return ONLY valid JSON matching:
{
  "title": string,
  "headerBoardName"?: string,
  "examinationTitle"?: string,
  "sessionLabel"?: string,
  "subjectCode"?: string,
  "generalInstructions"?: string[],
  "format": { "totalMarks": number, "duration": string, "sections": [...] }
}`.trim();
const buildQuestionPaperQuestionsPrompt = ({ subject, educationLevel, examBoard, topic, format, sourceContext, }) => `
You are an official question paper setter for ${examBoard} ${educationLevel} ${subject} examinations.

Generate only the questions for the already-decided official paper structure below.

Requirements:
1. EXACTLY match the provided sections, question counts, and marks
2. MCQ = 1 mark, Short Answer = 2-3 marks, Long Answer = 5-6 marks, Essay = 8-10 marks
3. The total of all question marks must equal exactly ${format.totalMarks}
4. Questions must be complete sentences and must not be truncated
5. Use proper ${examBoard} terminology
6. Questions must cover recall, understanding, application, and analysis where appropriate

Paper structure:
${JSON.stringify(format.sections)}

${sourceContext ? `IMPORTANT: Generate questions ONLY from the following source coverage.\n${sourceContext}\n` : ''}
${sourceContext ? `Hard constraints:
- Every question must be answerable from the source coverage above.
- Do not ask about any broader chapter content unless it appears in the source coverage.
- If the source is focused on one subtopic, keep the whole paper focused on that subtopic.
- Do not introduce outside facts, formulas, or chapter names that are not supported by the source coverage.
` : ''}

Generate questions for ${topic || subject}.
Return ONLY valid JSON matching:
{
  "questions": [
    {
      "id": string,
      "sectionName": string,
      "questionNumber": number,
      "text": string,
      "type": "mcq" | "short_answer" | "long_answer" | "essay" | "fill_blank" | "assertion_reason",
      "marks": number,
      "options"?: string[],
      "subParts"?: string[]
    }
  ]
}`.trim();
const buildSectionQuestionPrompt = ({ subject, educationLevel, examBoard, topic, format, section, questionNumberStart, sourceContext, }) => `
You are an official question paper setter for ${examBoard} ${educationLevel} ${subject} examinations.

Generate only the questions for the single section described below.

Requirements:
1. Generate EXACTLY ${section.questions} question objects for this section
2. Every question must use the section name "${section.name}"
3. Every question must carry exactly ${section.marksPerQuestion} marks
4. The total marks for this section must equal exactly ${section.totalMarks ?? section.questions * section.marksPerQuestion}
5. Question numbers must start at ${questionNumberStart} and continue sequentially
6. Questions must be complete sentences and must not be truncated
7. If the source material is narrow, create varied questions from the same covered concepts instead of reducing question count or marks

Overall paper structure for context:
${JSON.stringify(format.sections)}

Target section to generate strictly:
${JSON.stringify(section)}

${sourceContext ? `IMPORTANT: Generate questions ONLY from the following source coverage.\n${sourceContext}\n` : ''}
${sourceContext ? `Hard constraints:
- Every question must be answerable from the source coverage above.
- Do not ask about any broader chapter content unless it appears in the source coverage.
- If the source is focused on one subtopic, keep every question inside that subtopic.
- Reuse the supported concepts in varied ways if needed to reach the full required marks.
- Do not introduce outside facts, formulas, or chapter names that are not supported by the source coverage.
` : ''}

Generate questions for ${topic || subject}.
Return ONLY valid JSON matching:
{
  "questions": [
    {
      "id": string,
      "sectionName": string,
      "questionNumber": number,
      "text": string,
      "type": "mcq" | "short_answer" | "long_answer" | "essay" | "fill_blank" | "assertion_reason",
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
  "headerBoardName"?: string,
  "examinationTitle"?: string,
  "sessionLabel"?: string,
  "subjectCode"?: string,
  "generalInstructions": string[],
  "sections": [
    {
      "name": string,
      "displayName"?: string,
      "instructions": string,
      "questionType": string,
      "questionTypeDisplay"?: string,
      "questions": number,
      "marksPerQuestion": number,
      "totalMarks"?: number
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
    if (normalized.includes('essay') || normalized.includes('descriptive'))
        return 'essay';
    if (normalized.includes('long'))
        return 'long_answer';
    return 'short_answer';
};
const toQuestionText = (value) => {
    if (typeof value === 'string')
        return sanitizeQuestionPaperText(value);
    if (value && typeof value === 'object') {
        const record = value;
        const fromText = typeof record.text === 'string' ? sanitizeQuestionPaperText(record.text) : '';
        if (fromText)
            return fromText;
        const fromQuestion = typeof record.question === 'string' ? sanitizeQuestionPaperText(record.question) : '';
        if (fromQuestion)
            return fromQuestion;
    }
    return '';
};
const getQuestionMarksRange = (type) => {
    switch (type) {
        case 'mcq':
            return { min: 1, max: 1 };
        case 'short_answer':
            return { min: 2, max: 3 };
        case 'long_answer':
            return { min: 5, max: 8 };
        case 'essay':
            return { min: 10, max: 15 };
        case 'assertion_reason':
        case 'fill_blank':
            return { min: 1, max: 2 };
        default:
            return { min: 1, max: 15 };
    }
};
export const validateQuestionPaperStructure = ({ totalMarks, sections, questions, }) => {
    const exactTotal = questions.reduce((sum, question) => sum + question.marks, 0);
    if (exactTotal !== totalMarks) {
        throw new Error(`Question marks total ${exactTotal} does not match required total ${totalMarks}.`);
    }
    for (const question of questions) {
        const range = getQuestionMarksRange(question.type);
        if (question.marks < range.min || question.marks > range.max) {
            throw new Error(`Invalid marks for ${question.type}: ${question.marks}.`);
        }
    }
    for (const section of sections) {
        const sectionQuestions = questions.filter((question) => question.sectionName === section.name);
        if (sectionQuestions.length === 0) {
            throw new Error(`Section ${section.name} has no questions.`);
        }
    }
};
const renumberQuestionsSequentially = (questions) => questions.map((question, index) => ({
    ...question,
    questionNumber: index + 1,
}));
const validateSectionBatch = ({ section, questions, }) => {
    if (questions.length !== section.questions) {
        throw new Error(`Section ${section.name} returned ${questions.length} questions but requires ${section.questions}.`);
    }
    const marksTotal = questions.reduce((sum, question) => sum + question.marks, 0);
    const requiredMarks = section.totalMarks ?? section.questions * section.marksPerQuestion;
    if (marksTotal !== requiredMarks) {
        throw new Error(`Section ${section.name} marks total ${marksTotal} does not match required section total ${requiredMarks}.`);
    }
    for (const question of questions) {
        if (question.sectionName !== section.name) {
            throw new Error(`Section ${section.name} returned a question for ${question.sectionName}.`);
        }
        if (question.marks !== section.marksPerQuestion) {
            throw new Error(`Section ${section.name} returned ${question.marks} marks for a question that requires ${section.marksPerQuestion}.`);
        }
    }
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
            ? record?.options.map((option) => sanitizeQuestionPaperText(String(option))).filter(Boolean)
            : undefined;
        const subParts = Array.isArray(record?.subParts)
            ? record?.subParts.map((part) => sanitizeQuestionPaperText(String(part))).filter(Boolean)
            : Array.isArray(record?.parts)
                ? record?.parts.map((part) => sanitizeQuestionPaperText(String(part))).filter(Boolean)
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
        headerBoardName: typeof record.headerBoardName === 'string' && record.headerBoardName.trim()
            ? sanitizeQuestionPaperText(record.headerBoardName)
            : undefined,
        examinationTitle: typeof record.examinationTitle === 'string' && record.examinationTitle.trim()
            ? sanitizeQuestionPaperText(record.examinationTitle)
            : undefined,
        sessionLabel: typeof record.sessionLabel === 'string' && record.sessionLabel.trim()
            ? sanitizeQuestionPaperText(record.sessionLabel)
            : undefined,
        subjectCode: typeof record.subjectCode === 'string' && record.subjectCode.trim()
            ? sanitizeQuestionPaperText(record.subjectCode)
            : undefined,
        generalInstructions: toStringList(record.generalInstructions, 20).map(sanitizeQuestionPaperText),
        format,
        questions,
    };
};
const normalizeGeneratedStructureResponse = (parsed) => {
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
    return {
        title: typeof record.title === 'string' && record.title.trim()
            ? record.title
            : '',
        headerBoardName: typeof record.headerBoardName === 'string' && record.headerBoardName.trim()
            ? sanitizeQuestionPaperText(record.headerBoardName)
            : undefined,
        examinationTitle: typeof record.examinationTitle === 'string' && record.examinationTitle.trim()
            ? sanitizeQuestionPaperText(record.examinationTitle)
            : undefined,
        sessionLabel: typeof record.sessionLabel === 'string' && record.sessionLabel.trim()
            ? sanitizeQuestionPaperText(record.sessionLabel)
            : undefined,
        subjectCode: typeof record.subjectCode === 'string' && record.subjectCode.trim()
            ? sanitizeQuestionPaperText(record.subjectCode)
            : undefined,
        generalInstructions: toStringList(record.generalInstructions, 20).map(sanitizeQuestionPaperText),
        format,
    };
};
const normalizeGeneratedQuestionsResponse = (parsed, format) => {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const record = parsed;
    const fallbackSectionName = format.sections[0]?.name || 'Section A';
    const fallbackQuestionType = format.sections[0]?.questionType;
    const questions = toQuestionList(record.questions, fallbackSectionName, fallbackQuestionType);
    if (!validateQuestions(questions)) {
        return null;
    }
    return { questions };
};
const executeQuestionGenerationRequest = async ({ prompt, educationLevel, objective, plan, uid, requestId, subject, examBoard, sourceType, }) => {
    const response = await executeHybridAiRequest({
        prompt,
        educationLevel,
        mode: 'ExamPrep',
        objective,
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS,
        totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
    });
    if (response.text.length >= INCOMPLETE_QUESTION_OUTPUT_MIN_LENGTH) {
        return {
            response,
            retryUsage: null,
            usedIncompleteRetry: false,
        };
    }
    logger.warn('paper_generation_incomplete_question_output', {
        eventType: 'paper_generation_incomplete_question_output',
        requestId,
        uid,
        subject,
        examBoard,
        sourceType,
        objective,
        rawResponseLength: response.text.length,
        rawResponsePreview: response.text.slice(0, 500),
        isRetry: false,
    });
    const retryResponse = await executeHybridAiRequest({
        prompt: buildIncompleteQuestionRetryPrompt(prompt),
        educationLevel,
        mode: 'ExamPrep',
        objective,
        plan,
        uid,
        requestId,
        history: [],
        summaryCandidates: [],
        attachments: [],
        maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS,
        temperature: 0.8,
        totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
    });
    return {
        response: retryResponse,
        retryUsage: retryResponse.usage,
        usedIncompleteRetry: true,
    };
};
const generateQuestionsBySection = async ({ uid, plan, requestId, subject, educationLevel, examBoard, topic, format, sourceContext, }) => {
    const parseQuestionsResponse = (rawResponse, isRetry, sectionFormat) => normalizeGeneratedQuestionsResponse(parseJsonWithRepair({
        rawResponse,
        requestId,
        subject,
        examBoard,
        educationLevel,
        isRetry,
    }), sectionFormat);
    const allQuestions = [];
    let combinedUsage = null;
    let questionNumberStart = 1;
    for (const section of format.sections) {
        const sectionOnlyFormat = {
            ...format,
            sections: [section],
        };
        const prompt = buildSectionQuestionPrompt({
            subject,
            educationLevel,
            examBoard,
            topic,
            format,
            section,
            questionNumberStart,
            sourceContext,
        });
        const objective = `Generate ${examBoard} ${section.name} questions`;
        const responseResult = await executeQuestionGenerationRequest({
            prompt,
            educationLevel,
            objective,
            plan,
            uid,
            requestId,
            subject,
            examBoard,
            sourceType: sourceContext ? 'pdf' : 'topic',
        });
        const response = responseResult.response;
        let parsedSectionError = null;
        let parsedSection = (() => {
            try {
                return parseQuestionsResponse(response.text, responseResult.usedIncompleteRetry, sectionOnlyFormat);
            }
            catch (error) {
                if (!(error instanceof QuestionPaperJsonParseError)) {
                    throw error;
                }
                parsedSectionError = error;
                return null;
            }
        })();
        let retryUsage = responseResult.retryUsage;
        if (parsedSection === null && responseResult.usedIncompleteRetry) {
            throw parsedSectionError ?? new Error(`Question paper generation returned invalid JSON for ${section.name}.`);
        }
        if (parsedSection === null) {
            const retryResponse = await executeHybridAiRequest({
                prompt,
                educationLevel,
                mode: 'ExamPrep',
                objective,
                plan,
                uid,
                requestId,
                history: [],
                summaryCandidates: [],
                attachments: [],
                maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS,
                totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
            });
            retryUsage = retryResponse.usage;
            parsedSection = parseQuestionsResponse(retryResponse.text, true, sectionOnlyFormat);
        }
        if (!parsedSection?.questions || !validateQuestions(parsedSection.questions)) {
            throw new Error(`Question paper generation returned invalid JSON for ${section.name}.`);
        }
        validateSectionBatch({
            section,
            questions: parsedSection.questions,
        });
        allQuestions.push(...parsedSection.questions);
        combinedUsage = addUsages(combinedUsage, response.usage, retryUsage);
        questionNumberStart += section.questions;
    }
    return {
        questions: renumberQuestionsSequentially(allQuestions),
        usage: combinedUsage ?? zeroUsage(),
    };
};
export const normalizeQuestionPaperPayload = ({ fallbackTitle, format, questions, }) => ({
    title: toTitleCase(fallbackTitle),
    format: {
        totalMarks: format.totalMarks,
        duration: sanitizeQuestionPaperText(String(format.duration || '')) || '3 hours',
        sections: format.sections.map((section) => ({
            ...section,
            name: humanizeLabel(section.name),
            displayName: sanitizeQuestionPaperText(section.displayName || humanizeLabel(section.name)),
            questionType: humanizeLabel(section.questionType),
            questionTypeDisplay: sanitizeQuestionPaperText(section.questionTypeDisplay || humanizeLabel(section.questionType)),
            instructions: sanitizeQuestionPaperText(String(section.instructions || '')),
            totalMarks: section.totalMarks ?? section.questions * section.marksPerQuestion,
        })),
    },
    questions: questions.map((question, index) => ({
        ...(() => {
            const options = question.options?.map((option) => sanitizePdfRenderableText(String(option))).filter(Boolean);
            const subParts = question.subParts?.map((part) => sanitizePdfRenderableText(String(part))).filter(Boolean);
            return {
                ...question,
                id: question.id || `q-${index + 1}`,
                questionNumber: Number(question.questionNumber) || index + 1,
                sectionName: humanizeLabel(question.sectionName),
                text: sanitizePdfRenderableText(String(question.text || '')),
                type: question.type || 'short_answer',
                marks: Number(question.marks) || 1,
                ...(options?.length ? { options } : {}),
                ...(subParts?.length ? { subParts } : {}),
            };
        })(),
    })),
});
export const researchQuestionPaperFormat = async ({ subject, educationLevel, examBoard, plan, uid, requestId, }) => {
    const query = buildFormatResearchQuery({ examBoard, educationLevel, subject });
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
    const matchedFormatFamily = inferFormatFamily(examBoard);
    return {
        format: parsed?.totalMarks && Array.isArray(parsed.sections) && parsed.sections.length > 0
            ? {
                ...parsed,
                matchedFormatFamily,
                formatSource: 'official',
                generalInstructions: toStringList(parsed.generalInstructions, 20).map(sanitizeQuestionPaperText).length > 0
                    ? toStringList(parsed.generalInstructions, 20).map(sanitizeQuestionPaperText)
                    : buildFallbackGeneralInstructions(examBoard, matchedFormatFamily),
            }
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
    let rawGenerationResponsePreview;
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
        const structurePrompt = buildQuestionPaperStructurePrompt({
            subject,
            educationLevel,
            examBoard,
            topic,
            format: research.format,
            sourceContext,
        });
        const structureResponse = await executeHybridAiRequest({
            prompt: structurePrompt,
            educationLevel,
            mode: 'ExamPrep',
            objective: `Generate ${examBoard} question paper`,
            plan,
            uid,
            requestId,
            history: [],
            summaryCandidates: [],
            attachments: [],
            maxOutputTokens: 1600,
            totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
        });
        rawGenerationResponsePreview = structureResponse.text.slice(0, 500);
        const parseStructureResponse = (rawResponse, isRetry) => normalizeGeneratedStructureResponse(parseJsonWithRepair({
            rawResponse,
            requestId,
            subject,
            examBoard,
            educationLevel,
            isRetry,
        }));
        const parseQuestionsResponse = (rawResponse, isRetry, format) => normalizeGeneratedQuestionsResponse(parseJsonWithRepair({
            rawResponse,
            requestId,
            subject,
            examBoard,
            educationLevel,
            isRetry,
        }), format);
        let parsedStructure = (() => {
            try {
                return parseStructureResponse(structureResponse.text, false);
            }
            catch (error) {
                if (!(error instanceof QuestionPaperJsonParseError)) {
                    throw error;
                }
                return null;
            }
        })();
        let structureUsage = null;
        if (parsedStructure === null) {
            const retryStructureResponse = await executeHybridAiRequest({
                prompt: structurePrompt,
                educationLevel,
                mode: 'ExamPrep',
                objective: `Generate ${examBoard} question paper`,
                plan,
                uid,
                requestId,
                history: [],
                summaryCandidates: [],
                attachments: [],
                maxOutputTokens: 1600,
                totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
            });
            rawGenerationResponsePreview = retryStructureResponse.text.slice(0, 500);
            structureUsage = retryStructureResponse.usage;
            parsedStructure = parseStructureResponse(retryStructureResponse.text, true);
        }
        if (!parsedStructure?.format) {
            throw new Error('Question paper generation returned invalid JSON.');
        }
        const mergedFormat = {
            ...research.format,
            ...parsedStructure.format,
            sections: parsedStructure.format.sections,
        };
        const questionsPrompt = buildQuestionPaperQuestionsPrompt({
            subject,
            educationLevel,
            examBoard,
            topic,
            format: mergedFormat,
            sourceContext,
        });
        const questionsResponseResult = await executeQuestionGenerationRequest({
            prompt: questionsPrompt,
            educationLevel,
            objective: `Generate ${examBoard} question paper`,
            plan,
            uid,
            requestId,
            subject,
            examBoard,
            sourceType,
        });
        const questionsResponse = questionsResponseResult.response;
        rawGenerationResponsePreview = questionsResponse.text.slice(0, 500);
        let parsedQuestionsError = null;
        let parsedQuestions = (() => {
            try {
                return parseQuestionsResponse(questionsResponse.text, questionsResponseResult.usedIncompleteRetry, mergedFormat);
            }
            catch (error) {
                if (!(error instanceof QuestionPaperJsonParseError)) {
                    throw error;
                }
                parsedQuestionsError = error;
                return null;
            }
        })();
        let questionsUsage = questionsResponseResult.retryUsage;
        if (parsedQuestions === null && questionsResponseResult.usedIncompleteRetry) {
            throw parsedQuestionsError ?? new Error('Question paper generation returned invalid JSON after retry.');
        }
        if (parsedQuestions === null) {
            const retryQuestionsResponse = await executeHybridAiRequest({
                prompt: questionsPrompt,
                educationLevel,
                mode: 'ExamPrep',
                objective: `Generate ${examBoard} question paper`,
                plan,
                uid,
                requestId,
                history: [],
                summaryCandidates: [],
                attachments: [],
                maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS,
                totalTimeoutMs: QUESTION_PAPER_GENERATION_TIMEOUT_MS,
            });
            rawGenerationResponsePreview = retryQuestionsResponse.text.slice(0, 500);
            questionsUsage = retryQuestionsResponse.usage;
            parsedQuestions = parseQuestionsResponse(retryQuestionsResponse.text, true, mergedFormat);
        }
        if (!parsedStructure?.format || !parsedQuestions?.questions || !validateQuestions(parsedQuestions.questions)) {
            throw new Error('Question paper generation returned invalid JSON.');
        }
        let candidateQuestions = parsedQuestions.questions;
        let sectionRecoveryUsage = null;
        const buildNormalizedPaper = (questions) => normalizeQuestionPaperPayload({
            fallbackTitle: parsedStructure.title || `${educationLevel} ${examBoard} ${subject} Exam`,
            format: mergedFormat,
            questions,
        });
        let normalized = buildNormalizedPaper(candidateQuestions);
        try {
            validateQuestionPaperStructure({
                totalMarks: normalized.format.totalMarks,
                sections: normalized.format.sections,
                questions: normalized.questions,
            });
        }
        catch (error) {
            logger.warn('paper_generation_section_recovery_started', {
                eventType: 'paper_generation_section_recovery_started',
                requestId,
                uid,
                subject,
                examBoard,
                educationLevel,
                sourceType,
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            const recovered = await generateQuestionsBySection({
                uid,
                plan,
                requestId,
                subject,
                educationLevel,
                examBoard,
                topic,
                format: mergedFormat,
                sourceContext,
            });
            candidateQuestions = recovered.questions;
            sectionRecoveryUsage = recovered.usage;
            normalized = buildNormalizedPaper(candidateQuestions);
            validateQuestionPaperStructure({
                totalMarks: normalized.format.totalMarks,
                sections: normalized.format.sections,
                questions: normalized.questions,
            });
        }
        const paper = questionPaperDocSchema.parse({
            id: paperRef.id,
            title: normalized.title,
            subject,
            educationLevel,
            examBoard,
            sourceType,
            headerBoardName: parsedStructure.headerBoardName || research.format.headerBoardName || sanitizeQuestionPaperText(examBoard),
            examinationTitle: parsedStructure.examinationTitle ||
                research.format.examinationTitle ||
                sanitizeQuestionPaperText(`${educationLevel} Examination`),
            sessionLabel: parsedStructure.sessionLabel ||
                research.format.sessionLabel ||
                String(new Date(generatedAt).getFullYear()),
            subjectCode: parsedStructure.subjectCode || research.format.subjectCode,
            generalInstructions: parsedStructure.generalInstructions?.length
                ? parsedStructure.generalInstructions
                : research.format.generalInstructions,
            matchedFormatFamily: research.format.matchedFormatFamily,
            formatSource: research.format.formatSource,
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
        return {
            paper,
            usage: addUsages(research.usage, structureResponse.usage, structureUsage, questionsResponse.usage, questionsUsage, sectionRecoveryUsage),
        };
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
            rawResponsePreview: error instanceof QuestionPaperJsonParseError
                ? error.rawPreview
                : rawGenerationResponsePreview,
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
