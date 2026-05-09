import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../../lib/firebaseAdmin.js';
import { PLAN_DEFINITIONS, type SubscriptionPlan } from '../../config/plans.js';
import type {
  ParsedPaper,
  QuestionPaperDoc,
  QuestionPaperFormatSection,
  QuestionPaperQuestion,
  TokenUsage,
} from '../../types/index.js';
import { executeHybridAiRequest } from '../ai/orchestrator.js';
import { estimateAiInputTokens } from '../tokenUsage.js';
import { parseMarkdownPaper } from './markdownPaperParser.js';
import { generateQuestionPaperPdfBase64 } from './pdfGenerator.js';
import {
  sanitizePdfRenderableText,
  sanitizeQuestionPaperText,
} from './questionPaperSanitizer.js';
import { searchExamFormatSources } from './searchAdapter.js';

const userRoot = (uid: string) => adminDb.collection('users').doc(uid);
const questionPaperCollection = (uid: string) => userRoot(uid).collection('questionPapers');

type PdfSourceDigest = {
  subject: string;
  primaryTopic: string;
  coveredConcepts: string[];
  keyFacts: string[];
  questionBoundaries: string[];
};

type QuestionPaperFormatPayload = {
  totalMarks: number;
  duration: string;
  headerBoardName?: string;
  examinationTitle?: string;
  sessionLabel?: string;
  subjectCode?: string;
  generalInstructions?: string[];
  matchedFormatFamily?: string;
  formatSource?: 'official' | 'family_fallback';
  sections: QuestionPaperFormatSection[];
};

type PaperGenerationStep = 'format_research' | 'generation' | 'pdf';

const MAX_PDF_SOURCE_TEXT_CHARS = 16000;
const INFER_SUBJECT_TEXT_CHARS = 6000;
const FORMAT_RESEARCH_TIMEOUT_MS = 60_000;
const QUESTION_PAPER_GENERATION_TIMEOUT_MS = 90_000;
const QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS = 6144;
const MIN_USABLE_MARKDOWN_LENGTH = 100;
const FORMAT_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_QUESTION_OPTIONS = 8;
const MAX_QUESTION_SUBPARTS = 8;

const formatResearchCache = new Map<string, { result: QuestionPaperFormatPayload; cachedAt: number }>();

const questionPaperFormatSectionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().trim().min(1).max(2000),
  questionType: z.string().trim().min(1).max(160),
  questionTypeDisplay: z.string().trim().min(1).max(200).optional(),
  questions: z.number().int().min(1),
  marksPerQuestion: z.number().int().min(1),
  totalMarks: z.number().int().min(1).optional(),
  negativeMarking: z.number().optional(),
  attemptRequired: z.number().int().min(1).optional(),
});

const questionPaperQuestionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  sectionName: z.string().trim().min(1).max(160),
  questionNumber: z.number().int().min(1),
  text: z.string().trim().min(1).max(6000),
  type: z.enum([
    'mcq',
    'short_answer',
    'long_answer',
    'essay',
    'fill_blank',
    'assertion_reason',
    'numerical',
    'integer',
  ]),
  marks: z.number().int().min(1),
  options: z.array(z.string().trim().min(1).max(1000)).max(MAX_QUESTION_OPTIONS).optional(),
  subParts: z.array(z.string().trim().min(1).max(2000)).max(MAX_QUESTION_SUBPARTS).optional(),
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
  questions: z.array(questionPaperQuestionSchema),
  generatedAt: z.string().datetime(),
  status: z.enum(['ready', 'partial', 'failed']),
  pdfUrl: z.string().trim().min(1).optional(),
  webSearchSources: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  failureMessage: z.string().trim().min(1).optional(),
  parseWarnings: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  rawMarkdownOutput: z.string().trim().min(1).optional(),
});

const questionPaperFailureUpdateSchema = z.object({
  status: z.enum(['failed', 'partial']),
  failureMessage: z.string().trim().min(1).max(1000).optional(),
  parseWarnings: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  rawMarkdownOutput: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  format: z
    .object({
      totalMarks: z.number().int().min(1),
      duration: z.string().trim().min(1).max(120),
      sections: z.array(questionPaperFormatSectionSchema).min(1),
    })
    .optional(),
  questions: z.array(questionPaperQuestionSchema).optional(),
  generalInstructions: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
});

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
};

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

const toTitleCase = (value: string) =>
  sanitizeQuestionPaperText(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const zeroUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  usageSource: 'provider',
});

const addUsages = (...usages: Array<TokenUsage | null | undefined>): TokenUsage =>
  usages.reduce<TokenUsage>(
    (acc, usage) => ({
      inputTokens: acc.inputTokens + (usage?.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (usage?.outputTokens ?? 0),
      totalTokens: acc.totalTokens + (usage?.totalTokens ?? 0),
      usageSource:
        acc.usageSource === 'estimated' || usage?.usageSource === 'estimated'
          ? 'estimated'
          : 'provider',
    }),
    zeroUsage()
  );

const reserveForTextCall = ({
  plan,
  maxOutputTokens,
}: {
  plan: SubscriptionPlan;
  maxOutputTokens: number;
}) => PLAN_DEFINITIONS[plan].maxInputTokensPerRequest + maxOutputTokens;

const estimatePdfAttachmentTokens = (pdfAttachments: Array<{ sizeBytes: number }>) =>
  pdfAttachments.reduce((sum, attachment) => sum + Math.ceil(attachment.sizeBytes / 128), 0);

const truncateSourceText = (value: string) => value.slice(0, MAX_PDF_SOURCE_TEXT_CHARS);

const inferFormatFamily = (examBoard: string) => {
  const normalized = examBoard.toLowerCase();
  if (/cbse|icse|igcse|ib|cambridge|state board/.test(normalized)) return 'school_board';
  if (/university|semester|college|anna university|mumbai university|internal/.test(normalized)) return 'university_exam';
  if (/upsc|ssc|ibps|rbi|psc|nta|jee|neet|cat|clat|gate|cuet|ielts|gmat|gre|sat/.test(normalized)) return 'competitive_exam';
  if (/icai|icsi|icmai|nmc|bar council|ca|cs|cma|mbbs|law/.test(normalized)) return 'professional_exam';
  return 'general_exam';
};

const buildFallbackGeneralInstructions = (examBoard: string, formatFamily: string) => {
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
      'Each correct answer carries marks as per the official scheme.',
      'Use rough work space only where permitted.',
    ];
  }
  if (/icai|ca/i.test(examBoard)) {
    return [
      'The figures in the margin indicate full marks.',
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
    'Figures in the margin indicate full marks for each question.',
    'Write clearly and support your answers with steps wherever relevant.',
  ];
};

const buildMinimalContextHint = ({
  subject,
  educationLevel,
  examBoard,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
}): QuestionPaperFormatPayload => {
  const matchedFormatFamily = inferFormatFamily(examBoard);
  return {
    totalMarks: 0,
    duration: '',
    headerBoardName: examBoard,
    examinationTitle: `${educationLevel} Examination`,
    sessionLabel: String(new Date().getFullYear()),
    subjectCode: sanitizeQuestionPaperText(subject) || undefined,
    generalInstructions: [],
    matchedFormatFamily,
    formatSource: 'family_fallback',
    sections: [],
  };
};

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
  if (!parsed || typeof parsed !== 'object') return null;
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
  if (coveredConcepts.length === 0 || keyFacts.length === 0) return null;

  return {
    subject: humanizeLabel(candidate.subject),
    primaryTopic: humanizeLabel(candidate.primaryTopic),
    coveredConcepts,
    keyFacts,
    questionBoundaries,
  };
};

export const buildQuestionPaperMeteringPlan = ({
  plan,
}: {
  plan: SubscriptionPlan;
}) => ({
  meteringContext: {
    prompt: 'question-paper-generation',
    educationLevel: 'General',
    mode: 'ExamPrep' as const,
    objective: 'Generate question paper',
    history: [],
    contextSummaryText: undefined,
  },
  reservedTokens:
    reserveForTextCall({ plan, maxOutputTokens: 1200 }) +
    reserveForTextCall({ plan, maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS }),
});

export const buildPdfQuestionPaperMeteringPlan = ({
  plan,
  educationLevel,
  examBoard,
  pdfAttachments,
}: {
  plan: SubscriptionPlan;
  educationLevel: string;
  examBoard: string;
  pdfAttachments: Array<{ sizeBytes: number }>;
}) => {
  const prompt = `Extract all text content from these ${examBoard} ${educationLevel} documents. Preserve structure and do not summarize.`;
  const extractionInputTokens =
    estimateAiInputTokens({
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
      mode: 'ExamPrep' as const,
      objective: 'Generate paper from PDFs',
      history: [],
      contextSummaryText: undefined,
    },
    reservedTokens:
      extractionInputTokens +
      4000 +
      reserveForTextCall({ plan, maxOutputTokens: 1200 }) +
      reserveForTextCall({ plan, maxOutputTokens: 50 }) +
      reserveForTextCall({ plan, maxOutputTokens: QUESTION_PAPER_GENERATION_MAX_OUTPUT_TOKENS }),
  };
};

const extractJsonCandidate = (value: string) => {
  let candidate = value.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1).trim();
  }
  candidate = candidate.replace(/,\s*([}\]])/g, '$1');
  return candidate;
};

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(extractJsonCandidate(value)) as T;
  } catch {
    return null;
  }
};

export const buildFormatResearchQuery = ({
  examBoard,
  educationLevel,
  subject,
  year,
}: {
  examBoard: string;
  educationLevel: string;
  subject: string;
  year: number;
}) => `${examBoard} ${educationLevel} ${subject} question paper pattern marking scheme ${year}`;

async function getCachedFormatOrSearch(
  key: string,
  searchFn: () => Promise<QuestionPaperFormatPayload>
): Promise<QuestionPaperFormatPayload> {
  const cached = formatResearchCache.get(key);
  if (cached && Date.now() - cached.cachedAt < FORMAT_CACHE_TTL_MS) {
    logger.info('format_research_cache_hit', { key });
    return cached.result;
  }

  logger.info('format_research_cache_miss', { key });
  const result = await searchFn();
  formatResearchCache.set(key, { result, cachedAt: Date.now() });
  return result;
}

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

Infer the most likely CURRENT exam paper structure and return ONLY valid JSON:
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
      "totalMarks"?: number,
      "negativeMarking"?: number,
      "attemptRequired"?: number
    }
  ]
}`.trim();

const inferQuestionType = (value: string): QuestionPaperQuestion['type'] => {
  const normalized = value.toLowerCase();
  if (normalized.includes('numerical')) return 'numerical';
  if (normalized.includes('integer')) return 'integer';
  if (normalized.includes('mcq') || normalized.includes('multiple')) return 'mcq';
  if (normalized.includes('fill')) return 'fill_blank';
  if (normalized.includes('assertion')) return 'assertion_reason';
  if (normalized.includes('essay') || normalized.includes('descriptive')) return 'essay';
  if (normalized.includes('long')) return 'long_answer';
  return 'short_answer';
};

const sanitizeSection = (section: QuestionPaperFormatSection, index: number): QuestionPaperFormatSection => ({
  ...section,
  name: sanitizeQuestionPaperText(section.name || `Section ${String.fromCharCode(65 + index)}`) || `Section ${String.fromCharCode(65 + index)}`,
  displayName:
    sanitizeQuestionPaperText(section.displayName || section.name || `Section ${String.fromCharCode(65 + index)}`) ||
    `Section ${String.fromCharCode(65 + index)}`,
  instructions: sanitizeQuestionPaperText(section.instructions || 'Answer all questions in this section.'),
  questionType: sanitizeQuestionPaperText(section.questionType || 'Short Answer Questions') || 'Short Answer Questions',
  questionTypeDisplay:
    sanitizeQuestionPaperText(section.questionTypeDisplay || section.questionType || 'Short Answer Questions') ||
    'Short Answer Questions',
  questions: Math.max(1, Number(section.questions) || 1),
  marksPerQuestion: Math.max(1, Number(section.marksPerQuestion) || 1),
  totalMarks:
    section.totalMarks ??
    ((section.attemptRequired ?? section.questions ?? 1) * (section.marksPerQuestion || 1)),
});

const normalizeFormatPayload = (format: QuestionPaperFormatPayload): QuestionPaperFormatPayload => ({
  ...format,
  duration: sanitizeQuestionPaperText(format.duration || '3 hours') || '3 hours',
  generalInstructions: toStringList(format.generalInstructions, 20).map(sanitizeQuestionPaperText),
  sections: format.sections.map(sanitizeSection),
});

const createFallbackSection = (subject: string, format: QuestionPaperFormatPayload): QuestionPaperFormatSection =>
  sanitizeSection(
    {
      name: 'Section A',
      displayName: 'Section A',
      instructions: `Answer the questions based on ${subject}.`,
      questionType: format.sections[0]?.questionType || 'Short Answer Questions',
      questionTypeDisplay: format.sections[0]?.questionTypeDisplay || 'Short Answer Questions',
      questions: format.sections[0]?.questions || 1,
      marksPerQuestion: format.sections[0]?.marksPerQuestion || 2,
      totalMarks:
        format.sections[0]?.totalMarks ??
        ((format.sections[0]?.attemptRequired ?? format.sections[0]?.questions ?? 1) *
          (format.sections[0]?.marksPerQuestion ?? 2)),
    },
    0
  );

const getExamSpecificRequirements = (examBoard: string, educationLevel: string): string => {
  const board = examBoard.toLowerCase();
  if (/jee\s*main/i.test(examBoard)) {
    return 'JEE Mains has Section A (20 MCQ, +4/-1 each) and Section B (10 Numerical, attempt any 5, +4/0 each). Total 100 marks, 3 hours. Do NOT deviate from this official structure.';
  }
  if (/jee\s*adv/i.test(examBoard)) {
    return 'JEE Advanced has multiple question types: single correct MCQ, multiple correct MCQ, integer type, and paragraph-based. Use the most recent official pattern. Papers are 3 hours each.';
  }
  if (/neet/i.test(examBoard)) {
    return 'NEET has Section A (35 MCQ) and Section B (15 MCQ, attempt any 10) per subject. Each question is +4/-1. Total 180 marks per subject, 3 hours 20 minutes.';
  }
  if (/gate/i.test(examBoard)) {
    return 'GATE has General Aptitude (15 marks) and Subject Questions (85 marks). Mix of MCQ (negative marking) and NAT numerical (no negative marking). 3 hours total.';
  }
  if (/upsc\s*cse/i.test(examBoard)) {
    return 'UPSC Mains has essay-type answers in 3-hour sessions. GS papers are 250 marks with 20 questions of 10-15 marks each. Writing quality and coverage matter.';
  }
  if (/ca\s*(foundation|inter|final)|icai/i.test(examBoard)) {
    return 'CA exams follow ICAI pattern: mix of compulsory and optional questions. Practical/numerical questions dominate for accounting papers. Theory papers have structured essay answers.';
  }
  if (/mbbs|nmc|medical/i.test(examBoard)) {
    return "MBBS university exams typically have short answer questions (SAQ), long answer questions (LAQ), and sometimes MCQs. Follow the university pattern for the specific subject (e.g. Anatomy, Physiology, Pharmacology).";
  }
  if (/law|llb|bar\s*council|clat/i.test(examBoard)) {
    return 'Law exams have problem-based questions, statutory interpretation, case analysis, and essay questions. CLAT is MCQ-based. LLB university exams are descriptive.';
  }
  if (/cbse/i.test(examBoard)) {
    return 'CBSE papers follow the latest official pattern with Section A (MCQ/AR/1-mark), Section B (VSA 2-mark), Section C (SA 3-mark), Section D (LA 5-mark), Section E (case-based 4-mark). Total 80 marks, 3 hours.';
  }
  if (/icse/i.test(examBoard)) {
    return 'ICSE papers are 80 marks, 2 hours. Two sections: Section A (compulsory, short questions covering syllabus) and Section B (attempt 4 of 7 detailed questions).';
  }
  if (/semester|university|internal|college/i.test(board)) {
    return "University semester exams typically have unit-based sections with internal choice. Include short answer (2-5 marks) and long answer (10 marks) questions. Match the university's typical pattern for the subject.";
  }
  if (/b\\.tech|btech|engineering/i.test(educationLevel)) {
    return 'B.Tech exams follow university pattern: Part A short answers (2 marks each, compulsory) and Part B long answers with internal choice (10-16 marks each).';
  }
  return `Use authentic official format for ${examBoard} ${educationLevel}. Determine appropriate sections, question types, and marks from your knowledge of this exam.`;
};

export const buildQuestionPaperMarkdownPrompt = ({
  subject,
  educationLevel,
  examBoard,
  topic,
  formatHint,
  sourceDigest,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
  topic?: string;
  formatHint: QuestionPaperFormatPayload;
  sourceDigest?: string;
}) => `
You are an expert exam paper setter for ${examBoard} ${educationLevel} ${subject}.

Write a complete, authentic exam paper in Markdown only. Do not return JSON. Do not use code fences. Do not add commentary.

${
  formatHint.sections.length > 0 && formatHint.formatSource !== 'family_fallback'
    ? `Follow this official format exactly:\n${JSON.stringify({ totalMarks: formatHint.totalMarks, duration: formatHint.duration, sections: formatHint.sections }, null, 2)}`
    : `Determine the authentic official format for ${examBoard} ${educationLevel} ${subject} from your training knowledge. Use the real section structure, question types, marks distribution, and duration that are officially used for this exam. Do not default to a generic 3-section format.`
}

MANDATORY FORMATTING RULES:
- Start the paper with: # [EXAM TITLE]
- Second line: **Board:** ${sanitizeQuestionPaperText(examBoard)} | **Level:** ${sanitizeQuestionPaperText(educationLevel)} | **Subject:** ${sanitizeQuestionPaperText(subject)}
- Third line: **Time:** [DURATION] | **Total Marks:** [TOTAL]
- Then: ## General Instructions (numbered list)
- Then sections: ## Section [NAME] — [TYPE] ([N] × [M] = [TOTAL] Marks)
- MCQ questions MUST have 4 options on separate lines: (A) text (B) text (C) text (D) text
- Numerical/Integer questions have NO options
- Every question ends with **[N marks]**
- Question numbers continue sequentially across ALL sections
- Each question is on its own line
- Finish ALL required sections for this exam format in a single response
- Keep each question concise enough so the full paper fits in one completion

EXAM-SPECIFIC REQUIREMENTS:
${getExamSpecificRequirements(examBoard, educationLevel)}

${sourceDigest ? `CONTENT SCOPE (use ONLY these topics):\n${sourceDigest}\n` : `Generate questions covering the core ${subject} syllabus for ${sanitizeQuestionPaperText(topic || `${examBoard} ${educationLevel}`)}.`}

Write the complete paper now:
`.trim();

export const validateQuestionPaperStructure = ({
  totalMarks,
  sections,
  questions,
}: {
  totalMarks: number;
  sections: QuestionPaperFormatSection[];
  questions: QuestionPaperQuestion[];
}) => {
  const warnings: string[] = [];
  const total = questions.reduce((sum, question) => sum + question.marks, 0);
  if (totalMarks > 0 && total !== totalMarks) {
    warnings.push(`Total marks ${total} may differ from official format ${totalMarks}.`);
  }
  for (const section of sections) {
    const sectionQuestions = questions.filter((question) => question.sectionName === section.name);
    const requiredTotal =
      section.totalMarks ?? ((section.attemptRequired ?? section.questions) * section.marksPerQuestion);
    const actualTotal = sectionQuestions.reduce((sum, question) => sum + question.marks, 0);
    if (actualTotal !== requiredTotal) {
      warnings.push('Section totals may not match the expected format. Please verify marks before use.');
    }
    if (/mcq/i.test(section.questionType) && sectionQuestions.some((question) => !question.options?.length)) {
      warnings.push('Some MCQ options could not be parsed.');
    }
  }
  return Array.from(new Set(warnings));
};

const normalizeParsedPaper = ({
  parsed,
  formatHint,
  subject,
  educationLevel,
  examBoard,
}: {
  parsed: ParsedPaper;
  formatHint: QuestionPaperFormatPayload;
  subject: string;
  educationLevel: string;
  examBoard: string;
}) => {
  const parseWarnings = [...parsed.parseWarnings];
  const hasHintSections = formatHint.sections.length > 0;
  const useParsedSectionsDirectly = parsed.sections.length > 0 && !hasHintSections;
  const fallbackSections = hasHintSections ? formatHint.sections : [createFallbackSection(subject, formatHint)];

  const sections = (parsed.sections.length > 0 ? parsed.sections : fallbackSections).map((entry, index) => {
    if ('questionCount' in entry) {
      const section = entry;
      const hint = useParsedSectionsDirectly
        ? undefined
        : (fallbackSections[index] ?? fallbackSections[fallbackSections.length - 1]);
      return sanitizeSection(
        {
          name: sanitizeQuestionPaperText(section.name || hint?.name || `Section ${String.fromCharCode(65 + index)}`),
          displayName: sanitizeQuestionPaperText(section.name || hint?.displayName || hint?.name || `Section ${String.fromCharCode(65 + index)}`),
          instructions: sanitizeQuestionPaperText(section.instructions || hint?.instructions || 'Answer all questions in this section.'),
          questionType: sanitizeQuestionPaperText(section.type || hint?.questionType || 'Short Answer Questions'),
          questionTypeDisplay: sanitizeQuestionPaperText(section.type || hint?.questionTypeDisplay || hint?.questionType || 'Short Answer Questions'),
          questions: (section.questionCount ?? section.questions.length) || hint?.questions || 1,
          marksPerQuestion: section.marksPerQuestion ?? hint?.marksPerQuestion ?? 1,
          totalMarks:
            section.totalMarks ??
            (((hint?.attemptRequired ?? section.questionCount ?? section.questions.length) || 1) *
              (section.marksPerQuestion ?? hint?.marksPerQuestion ?? 1)),
          negativeMarking: hint?.negativeMarking,
          attemptRequired: hint?.attemptRequired,
        },
        index
      );
    }

    return sanitizeSection(entry, index);
  });

  const questions =
    parsed.sections.flatMap<QuestionPaperQuestion>((section, sectionIndex) => {
      const linkedSection = sections[sectionIndex] ?? sections[0] ?? createFallbackSection(subject, formatHint);
      return section.questions.map((question, questionIndex) => {
        const sanitizedOptions = question.options?.map((option) => sanitizePdfRenderableText(option)).filter(Boolean) ?? [];
        const sanitizedSubParts =
          question.subParts?.map((part) => sanitizePdfRenderableText(part)).filter(Boolean) ?? [];
        const cappedOptions = sanitizedOptions.slice(0, MAX_QUESTION_OPTIONS);
        const cappedSubParts = sanitizedSubParts.slice(0, MAX_QUESTION_SUBPARTS);

        if (sanitizedOptions.length > MAX_QUESTION_OPTIONS) {
          parseWarnings.push(
            `Question ${question.number || questionIndex + 1} had extra options. Only the first ${MAX_QUESTION_OPTIONS} were kept.`
          );
        }
        if (sanitizedSubParts.length > MAX_QUESTION_SUBPARTS) {
          parseWarnings.push(
            `Question ${question.number || questionIndex + 1} had extra sub-parts. Only the first ${MAX_QUESTION_SUBPARTS} were kept.`
          );
        }

        return {
          id: `q-${sectionIndex + 1}-${questionIndex + 1}`,
          sectionName: linkedSection.name,
          questionNumber: question.number || questionIndex + 1,
          text: sanitizePdfRenderableText(question.text || ''),
          type: cappedOptions.length ? 'mcq' : inferQuestionType(section.type || linkedSection.questionType),
          marks: Math.max(1, question.marks ?? linkedSection.marksPerQuestion ?? 1),
          ...(cappedOptions.length
            ? {
                options: cappedOptions,
              }
            : {}),
          ...(cappedSubParts.length
            ? {
                subParts: cappedSubParts,
              }
            : {}),
        };
      });
    }) ?? [];

  if (hasHintSections && parsed.sections.length > 0 && parsed.sections.length < formatHint.sections.length) {
    parseWarnings.push(
      `Expected ${formatHint.sections.length} sections from format research, but only ${parsed.sections.length} were generated. Paper may be incomplete.`
    );
  }

  parseWarnings.push(
    ...validateQuestionPaperStructure({
      totalMarks: parsed.totalMarks ?? formatHint.totalMarks,
      sections,
      questions,
    })
  );

  if (parsed.totalMarks !== null && parsed.totalMarks !== formatHint.totalMarks) {
    parseWarnings.push(`Total marks ${parsed.totalMarks} may differ from official format ${formatHint.totalMarks}.`);
  }

  return {
    title: toTitleCase(parsed.title || `${educationLevel} ${examBoard} ${subject}`),
    headerBoardName: sanitizeQuestionPaperText(parsed.board || formatHint.headerBoardName || examBoard),
    examinationTitle: sanitizeQuestionPaperText(formatHint.examinationTitle || `${educationLevel} Examination`),
    sessionLabel: sanitizeQuestionPaperText(formatHint.sessionLabel || String(new Date().getFullYear())),
    subjectCode: sanitizeQuestionPaperText(formatHint.subjectCode || ''),
    generalInstructions:
      parsed.generalInstructions.length > 0
        ? parsed.generalInstructions.map(sanitizeQuestionPaperText)
        : formatHint.generalInstructions ?? buildFallbackGeneralInstructions(examBoard, inferFormatFamily(examBoard)),
    format: {
      totalMarks: parsed.totalMarks ?? formatHint.totalMarks,
      duration: sanitizeQuestionPaperText(parsed.duration || formatHint.duration || '3 hours') || '3 hours',
      sections,
    },
    questions,
    parseWarnings: Array.from(new Set(parseWarnings.filter(Boolean))),
  };
};

export const normalizeQuestionPaperPayload = ({
  fallbackTitle,
  format,
  questions,
}: {
  fallbackTitle: string;
  format: QuestionPaperFormatPayload;
  questions: QuestionPaperQuestion[];
}) => ({
  title: toTitleCase(fallbackTitle),
  format: normalizeFormatPayload(format),
  questions: questions.map((question, index) => ({
    ...question,
    id: question.id || `q-${index + 1}`,
    questionNumber: Number(question.questionNumber) || index + 1,
    sectionName: humanizeLabel(question.sectionName),
    text: sanitizePdfRenderableText(String(question.text || '')),
    marks: Math.max(1, Number(question.marks) || 1),
    ...(question.options?.length
      ? {
          options: question.options
            .map((option) => sanitizePdfRenderableText(String(option)))
            .filter(Boolean)
            .slice(0, MAX_QUESTION_OPTIONS),
        }
      : {}),
    ...(question.subParts?.length
      ? {
          subParts: question.subParts
            .map((part) => sanitizePdfRenderableText(String(part)))
            .filter(Boolean)
            .slice(0, MAX_QUESTION_SUBPARTS),
        }
      : {}),
  })),
});

export const researchQuestionPaperFormat = async ({
  subject,
  educationLevel,
  examBoard,
  plan,
  uid,
  requestId,
}: {
  subject: string;
  educationLevel: string;
  examBoard: string;
  plan: SubscriptionPlan;
  uid: string;
  requestId: string;
}) => {
  const cacheKey = `${examBoard}:${educationLevel}:${subject}`;
  let usage: TokenUsage = zeroUsage();
  let sources: string[] = [];

  const format = await getCachedFormatOrSearch(cacheKey, async () => {
    const query = buildFormatResearchQuery({
      examBoard,
      educationLevel,
      subject,
      year: new Date().getFullYear(),
    });

    let results: Awaited<ReturnType<typeof searchExamFormatSources>> = [];
    try {
      results = await searchExamFormatSources(query);
    } catch {
      results = [];
    }

    sources = results.map((result) => result.url);
    if (results.length === 0) {
      return buildMinimalContextHint({ subject, educationLevel, examBoard });
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
    usage = response.usage;

    const parsed = safeJsonParse<{
      totalMarks: number;
      duration: string;
      headerBoardName?: string;
      examinationTitle?: string;
      sessionLabel?: string;
      subjectCode?: string;
      generalInstructions?: string[];
      sections: QuestionPaperFormatSection[];
    }>(response.text);

    const matchedFormatFamily = inferFormatFamily(examBoard);
    if (parsed?.totalMarks && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return normalizeFormatPayload({
        ...parsed,
        matchedFormatFamily,
        formatSource: 'official',
        generalInstructions:
          toStringList(parsed.generalInstructions, 20).map(sanitizeQuestionPaperText).length > 0
            ? toStringList(parsed.generalInstructions, 20).map(sanitizeQuestionPaperText)
            : buildFallbackGeneralInstructions(examBoard, matchedFormatFamily),
      });
    }

    return buildMinimalContextHint({ subject, educationLevel, examBoard });
  });

  return { format, sources, usage };
};

const isTimeoutLikeError = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : '';
  return code === 'ATTEMPT_TIMEOUT' || code === 'TOTAL_TIMEOUT' || /ATTEMPT_TIMEOUT|TOTAL_TIMEOUT|deadline-exceeded|timed out/i.test(message);
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
  requestId,
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
  requestId: string;
}) => {
  const paperRef = questionPaperCollection(uid).doc();
  const generatedAt = new Date().toISOString();
  const startedAt = Date.now();
  let failedStep: PaperGenerationStep = 'format_research';
  let rawGenerationResponsePreview: string | undefined;
  let rawMarkdownOutput = '';
  let rawMarkdownSaved = false;

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

    const generationFormatHint =
      research.format.sections.length > 0 && research.format.formatSource !== 'family_fallback'
        ? research.format
        : buildMinimalContextHint({ subject, educationLevel, examBoard });

    const prompt = buildQuestionPaperMarkdownPrompt({
      subject,
      educationLevel,
      examBoard,
      topic,
      formatHint: generationFormatHint,
      sourceDigest: sourceContext,
    });

    const response = await executeHybridAiRequest({
      prompt,
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

    rawMarkdownOutput = response.text.trim();
    rawGenerationResponsePreview = rawMarkdownOutput.slice(0, 500);
    if (rawMarkdownOutput.length < MIN_USABLE_MARKDOWN_LENGTH) {
      throw new Error('Question paper generation returned empty output.');
    }

    await paperRef.set({ rawMarkdownOutput }, { merge: true });
    rawMarkdownSaved = true;

    const parsed = parseMarkdownPaper(rawMarkdownOutput);
    const normalized = normalizeParsedPaper({
      parsed,
      formatHint: generationFormatHint,
      subject,
      educationLevel,
      examBoard,
    });

    const paper = questionPaperDocSchema.parse({
      id: paperRef.id,
      title: normalized.title,
      subject,
      educationLevel,
      examBoard,
      sourceType,
      headerBoardName: normalized.headerBoardName,
      examinationTitle: normalized.examinationTitle,
      sessionLabel: normalized.sessionLabel,
      subjectCode: normalized.subjectCode || undefined,
      generalInstructions: normalized.generalInstructions,
      matchedFormatFamily: research.format.matchedFormatFamily,
      formatSource: research.format.formatSource,
      format: normalized.format,
      questions: normalized.questions,
      generatedAt,
      status: 'ready',
      webSearchSources: research.sources,
      parseWarnings: normalized.parseWarnings.length ? normalized.parseWarnings : undefined,
      rawMarkdownOutput,
      ...(topic ? { topic } : {}),
      ...(sourcePdfNames?.length ? { sourcePdfNames } : {}),
      ...(typeof sourcePdfTextLength === 'number' ? { sourcePdfTextLength } : {}),
    } satisfies QuestionPaperDoc);

    await paperRef.set(stripUndefinedDeep(paper), { merge: true });
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
      usage: addUsages(research.usage, response.usage),
    };
  } catch (error) {
    if (isTimeoutLikeError(error) && rawMarkdownSaved && rawMarkdownOutput.trim().length >= MIN_USABLE_MARKDOWN_LENGTH) {
      const parsed = parseMarkdownPaper(rawMarkdownOutput);
      const normalized = normalizeParsedPaper({
        parsed,
        formatHint: buildMinimalContextHint({ subject, educationLevel, examBoard }),
        subject,
        educationLevel,
        examBoard,
      });
      await paperRef.set(
        stripUndefinedDeep(questionPaperFailureUpdateSchema.parse({
          status: 'partial',
          rawMarkdownOutput,
          title: normalized.title,
          format: normalized.format,
          questions: normalized.questions,
          generalInstructions: normalized.generalInstructions,
          parseWarnings: Array.from(new Set([...normalized.parseWarnings, 'Generation timed out — paper may be incomplete'])),
        })),
        { merge: true }
      );
    } else {
      await paperRef.set(
        stripUndefinedDeep(questionPaperFailureUpdateSchema.parse({
          status: 'failed',
          failureMessage: isTimeoutLikeError(error)
            ? 'Generation took too long. Try a more specific topic or shorter paper.'
            : error instanceof Error
              ? error.message
              : String(error),
          ...(rawMarkdownOutput.trim().length >= MIN_USABLE_MARKDOWN_LENGTH ? { rawMarkdownOutput } : {}),
        })),
        { merge: true }
      );
    }

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
      rawResponsePreview: rawGenerationResponsePreview,
      latencyMs: Date.now() - startedAt,
    });
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

export const generateQuestionPaperPdfForUser = async ({
  uid,
  paperId,
  requestId,
}: {
  uid: string;
  paperId: string;
  requestId: string;
}) => {
  const paper = await getQuestionPaper(uid, paperId);
  try {
    return {
      base64Pdf: generateQuestionPaperPdfBase64(paper),
      filename: `${paper.title.replace(/[^\w.-]+/g, '_')}.pdf`,
    };
  } catch (error) {
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

export const extractPdfTextWithNovaLite = async ({
  uid,
  plan,
  educationLevel,
  examBoard,
  pdfAttachments,
  requestId,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  examBoard: string;
  pdfAttachments: Array<{ name: string; mimeType: 'application/pdf'; sizeBytes: number; base64Data: string }>;
  requestId: string;
}) => {
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

export const inferSubjectFromText = async ({
  uid,
  plan,
  educationLevel,
  extractedText,
  requestId,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  extractedText: string;
  requestId: string;
}) => {
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

export const summarizePdfSourceMaterial = async ({
  uid,
  plan,
  educationLevel,
  examBoard,
  extractedText,
  requestId,
}: {
  uid: string;
  plan: SubscriptionPlan;
  educationLevel: string;
  examBoard: string;
  extractedText: string;
  requestId: string;
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
    requestId,
    history: [],
    summaryCandidates: [],
    attachments: [],
    maxOutputTokens: 1200,
  });

  return {
    digest: normalizePdfSourceDigest(safeJsonParse<PdfSourceDigest>(response.text)),
    usage: response.usage,
  };
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

