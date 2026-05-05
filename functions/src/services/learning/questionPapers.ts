import { adminDb } from '../../lib/firebaseAdmin.js';
import type { SubscriptionPlan } from '../../config/plans.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';
import { searchExamFormatSources } from './searchAdapter.js';
import type { QuestionPaperDoc, QuestionPaperFormatSection, QuestionPaperQuestion } from '../../types/index.js';

const userRoot = (uid: string) => adminDb.collection('users').doc(uid);

const questionPaperCollection = (uid: string) => userRoot(uid).collection('questionPapers');

type PdfSourceDigest = {
  subject: string;
  primaryTopic: string;
  coveredConcepts: string[];
  keyFacts: string[];
  questionBoundaries: string[];
};

const MAX_PDF_SOURCE_TEXT_CHARS = 16000;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toStringList = (value: unknown, maxItems: number) =>
  Array.isArray(value)
    ? value
        .filter(isNonEmptyString)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const humanizeLabel = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const extractJsonCandidate = (value: string) => {
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

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(extractJsonCandidate(value)) as T;
  } catch {
    return null;
  }
};

const normalizeFormatFallback = ({
  subject,
  educationLevel,
  examBoard,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
}) => ({
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
  ] satisfies QuestionPaperFormatSection[],
});

const truncateSourceText = (value: string) => value.slice(0, MAX_PDF_SOURCE_TEXT_CHARS);

const buildPdfSourceDigestPrompt = ({
  extractedText,
  educationLevel,
  examBoard,
}: {
  extractedText: string;
  educationLevel: string;
  examBoard: string;
}) => `
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

const buildPdfSourceContext = (digest: PdfSourceDigest) => `
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

export const normalizePdfSourceDigest = (parsed: unknown): PdfSourceDigest | null => {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as {
    subject?: unknown;
    primaryTopic?: unknown;
    coveredConcepts?: unknown;
    keyFacts?: unknown;
    questionBoundaries?: unknown;
  };

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

const buildQuestionPaperPrompt = ({
  subject,
  educationLevel,
  examBoard,
  topic,
  format,
  sourceContext,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
  topic?: string;
  format: { totalMarks: number; duration: string; sections: QuestionPaperFormatSection[] };
  sourceContext?: string;
}) => `
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

const buildFormatResearchPrompt = ({
  query,
  results,
}: {
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
}) => `
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

const validateQuestions = (questions: QuestionPaperQuestion[]) =>
  Array.isArray(questions) &&
  questions.length > 0 &&
  questions.every((question) => Boolean(question.id && question.sectionName && question.text));

const inferQuestionType = (value: unknown): QuestionPaperQuestion['type'] => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('mcq') || normalized.includes('multiple')) return 'mcq';
  if (normalized.includes('fill')) return 'fill_blank';
  if (normalized.includes('assertion')) return 'assertion_reason';
  if (normalized.includes('long')) return 'long_answer';
  return 'short_answer';
};

const toQuestionText = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fromText = typeof record.text === 'string' ? record.text.trim() : '';
    if (fromText) return fromText;
    const fromQuestion = typeof record.question === 'string' ? record.question.trim() : '';
    if (fromQuestion) return fromQuestion;
  }
  return '';
};

const toQuestionList = (
  rawQuestions: unknown,
  fallbackSectionName: string,
  fallbackQuestionType?: string
): QuestionPaperQuestion[] => {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .map((rawQuestion, index) => {
      const record =
        rawQuestion && typeof rawQuestion === 'object'
          ? (rawQuestion as Record<string, unknown>)
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
        sectionName:
          typeof record?.sectionName === 'string' && record.sectionName.trim()
            ? record.sectionName
            : fallbackSectionName,
        questionNumber:
          typeof record?.questionNumber === 'number'
            ? record.questionNumber
            : typeof record?.number === 'number'
              ? record.number
              : index + 1,
        text,
        type: inferQuestionType(record?.type ?? fallbackQuestionType),
        marks:
          typeof record?.marks === 'number'
            ? record.marks
            : typeof record?.mark === 'number'
              ? record.mark
              : 1,
        ...(options?.length ? { options } : {}),
        ...(subParts?.length ? { subParts } : {}),
      } satisfies QuestionPaperQuestion;
    })
    .filter((question): question is QuestionPaperQuestion => Boolean(question));
};

const normalizeGeneratedPaperResponse = (parsed: unknown) => {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const format =
    record.format && typeof record.format === 'object'
      ? (record.format as QuestionPaperDoc['format'])
      : null;

  if (!format || !Array.isArray(format.sections) || format.sections.length === 0) {
    return null;
  }

  let questions = toQuestionList(record.questions, format.sections[0]?.name || 'Section A');

  if (questions.length === 0) {
    questions = format.sections.flatMap((section, sectionIndex) => {
      const matchingSection =
        Array.isArray(record.sections) && record.sections[sectionIndex] && typeof record.sections[sectionIndex] === 'object'
          ? (record.sections[sectionIndex] as Record<string, unknown>)
          : null;

      return toQuestionList(
        matchingSection?.questions,
        section.name,
        section.questionType
      );
    });
  }

  if (!validateQuestions(questions)) {
    return null;
  }

  return {
    title:
      typeof record.title === 'string' && record.title.trim()
        ? record.title
        : '',
    format,
    questions,
  };
};

const normalizeQuestionPaperPayload = ({
  fallbackTitle,
  format,
  questions,
}: {
  fallbackTitle: string;
  format: QuestionPaperDoc['format'];
  questions: QuestionPaperQuestion[];
}) => ({
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

export const researchQuestionPaperFormat = async ({
  subject,
  educationLevel,
  examBoard,
  plan,
  uid,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
  plan: SubscriptionPlan;
  uid: string;
}) => {
  const query = `${examBoard} ${educationLevel} ${subject} question paper format marking scheme`;
  let results: Awaited<ReturnType<typeof searchExamFormatSources>> = [];
  try {
    results = await searchExamFormatSources(query);
  } catch {
    results = [];
  }

  if (results.length === 0) {
    return {
      format: normalizeFormatFallback({ subject, educationLevel, examBoard }),
      sources: [],
    };
  }

  const response = await executeHybridAiRequest({
    prompt: buildFormatResearchPrompt({ query, results }),
    educationLevel,
    mode: 'ExamPrep',
    objective: `Research ${examBoard} exam structure`,
    plan,
    uid,
    history: [],
    summaryCandidates: [],
    attachments: [],
    maxOutputTokens: 1200,
  });
  const parsed = safeJsonParse<{
    totalMarks: number;
    duration: string;
    sections: QuestionPaperFormatSection[];
  }>(response.text);

  return {
    format:
      parsed?.totalMarks && Array.isArray(parsed.sections) && parsed.sections.length > 0
        ? parsed
        : normalizeFormatFallback({ subject, educationLevel, examBoard }),
    sources: results.map((result) => result.url),
  };
};

export const generateQuestionPaperForUser = async ({
  uid,
  subject,
  educationLevel,
  examBoard,
  topic,
  plan,
  sourceType,
  sourcePdfNames,
  sourcePdfTextLength,
  sourceContext,
}: {
  uid: string;
  subject: string;
  educationLevel: string;
  examBoard: string;
  topic?: string;
  plan: SubscriptionPlan;
  sourceType: 'topic' | 'pdf';
  sourcePdfNames?: string[];
  sourcePdfTextLength?: number;
  sourceContext?: string;
}) => {
  const paperRef = questionPaperCollection(uid).doc();
  const generatedAt = new Date().toISOString();

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
    });

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
      history: [],
      summaryCandidates: [],
      attachments: [],
      maxOutputTokens: 2500,
    });

    const parsed = normalizeGeneratedPaperResponse(
      safeJsonParse<{
        title: string;
        format: QuestionPaperDoc['format'];
        questions: QuestionPaperQuestion[];
        sections?: Array<{ questions?: unknown[] }>;
      }>(response.text)
    );

    if (!parsed?.format || !validateQuestions(parsed.questions)) {
      throw new Error('Question paper generation returned invalid JSON.');
    }

    const normalized = normalizeQuestionPaperPayload({
      fallbackTitle: parsed.title || `${educationLevel} ${examBoard} ${subject} Exam`,
      format: parsed.format,
      questions: parsed.questions,
    });

    const paper: QuestionPaperDoc = {
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
    };

    await paperRef.set(paper);
    return paper;
  } catch (error) {
    await paperRef.set(
      {
        status: 'failed',
        failureMessage: error instanceof Error ? error.message : String(error),
      },
      { merge: true }
    );
    throw error;
  }
};

export const listQuestionPapers = async (uid: string) => {
  const snapshot = await questionPaperCollection(uid).orderBy('generatedAt', 'desc').get();
  const papers = snapshot.docs.map((doc) => doc.data() as QuestionPaperDoc);
  const grouped = papers.reduce<Record<string, QuestionPaperDoc[]>>((acc, paper) => {
    const key = paper.subject || 'General';
    acc[key] = [...(acc[key] ?? []), paper];
    return acc;
  }, {});
  return { papers, grouped };
};

export const deleteQuestionPaperForUser = async (uid: string, paperId: string) => {
  await questionPaperCollection(uid).doc(paperId).delete();
  return { ok: true };
};

export const getQuestionPaper = async (uid: string, paperId: string) => {
  const snapshot = await questionPaperCollection(uid).doc(paperId).get();
  if (!snapshot.exists) {
    throw new Error('Question paper not found.');
  }
  return snapshot.data() as QuestionPaperDoc;
};

export const generateQuestionPaperPdfForUser = async (uid: string, paperId: string) => {
  const paper = await getQuestionPaper(uid, paperId);
  return {
    base64Pdf: generateQuestionPaperPdfBase64(paper),
    filename: `${paper.title.replace(/[^\w.-]+/g, '_')}.pdf`,
  };
};

export const extractPdfTextWithNovaLite = async ({
  uid,
  plan,
  educationLevel,
  examBoard,
  pdfAttachments,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  examBoard: string;
  pdfAttachments: Array<{ name: string; mimeType: 'application/pdf'; sizeBytes: number; base64Data: string }>;
}) => {
  const response = await executeHybridAiRequest({
    prompt: `Extract all text content from these ${examBoard} ${educationLevel} documents. Preserve structure and do not summarize.`,
    educationLevel,
    mode: 'ExamPrep',
    objective: 'Extract document text',
    plan,
    uid,
    history: [],
    summaryCandidates: [],
    attachments: pdfAttachments,
    maxOutputTokens: 4000,
    totalTimeoutMs: 140_000,
  });
  return response.text;
};

export const inferSubjectFromText = async ({
  uid,
  plan,
  educationLevel,
  extractedText,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  extractedText: string;
}) => {
  const response = await executeHybridAiRequest({
    prompt: `What subject is this document about? Return one short subject label only.\n\n${extractedText.slice(0, 6000)}`,
    educationLevel,
    mode: 'Conversational',
    objective: 'Infer subject',
    plan,
    uid,
    history: [],
    summaryCandidates: [],
    attachments: [],
    maxOutputTokens: 50,
  });
  return response.text.replace(/["'\n]/g, '').trim() || 'General Studies';
};

export const summarizePdfSourceMaterial = async ({
  uid,
  plan,
  educationLevel,
  examBoard,
  extractedText,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  examBoard: string;
  extractedText: string;
}) => {
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
    history: [],
    summaryCandidates: [],
    attachments: [],
    maxOutputTokens: 1200,
  });

  return normalizePdfSourceDigest(safeJsonParse<PdfSourceDigest>(response.text));
};

export const buildFallbackPdfSourceContext = (extractedText: string) =>
  `Source excerpt:\n${truncateSourceText(extractedText)}`;

export const buildPdfTopicFromDigest = (digest: PdfSourceDigest | null) =>
  digest?.primaryTopic && digest.primaryTopic.toLowerCase() !== digest.subject.toLowerCase()
    ? digest.primaryTopic
    : undefined;

export const buildSubjectFromDigest = (digest: PdfSourceDigest | null) => digest?.subject || '';

export const buildSourceContextFromDigest = (digest: PdfSourceDigest | null, extractedText: string) =>
  digest ? buildPdfSourceContext(digest) : buildFallbackPdfSourceContext(extractedText);
