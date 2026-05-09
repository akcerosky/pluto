const executeHybridAiRequest = jest.fn();
const searchExamFormatSources = jest.fn();
const setMock = jest.fn();
const loggerWarn = jest.fn();
const loggerInfo = jest.fn();
const docMock = jest.fn(() => ({
  id: 'paper-1',
  set: setMock,
}));

jest.mock('firebase-functions', () => ({
  logger: {
    info: loggerInfo,
    warn: loggerWarn,
  },
}));

jest.mock('../../lib/firebaseAdmin.js', () => ({
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: docMock,
        })),
      })),
    })),
  },
}));

jest.mock('../ai/orchestrator.js', () => ({
  executeHybridAiRequest,
}));

jest.mock('./searchAdapter.js', () => ({
  searchExamFormatSources,
}));

import {
  buildFormatResearchQuery,
  buildQuestionPaperMarkdownPrompt,
  generateQuestionPaperForUser,
  normalizePdfSourceDigest,
  researchQuestionPaperFormat,
  validateQuestionPaperStructure,
} from './questionPapers.js';

const markdownPaper = `
# JEE Mains Chemistry Mock Paper
**Board:** JEE Mains | **Level:** Competitive Exam | **Subject:** Chemistry
**Time:** 3 hours | **Total Marks:** 8

## General Instructions
1. Answer all questions.
2. Read carefully.

## Section A — MCQ (2 × 2 = 4 Marks)
Choose the correct option.

**Q1.** What is the atomic number of oxygen? **[2 marks]**
(A) 6
(B) 7
(C) 8
(D) 9

**Q2.** Which particle carries a negative charge? **[2 marks]**
(A) Proton
(B) Neutron
(C) Electron
(D) Positron

## Section B — Short Answer (1 × 4 = 4 Marks)
Answer briefly.

**Q3.** Explain ionic bonding with one example. **[4 marks]**
`.trim();

const markdownPaperWithTooManyOptions = `
# Class 10 CBSE Physics
**Board:** CBSE | **Level:** Class 10 | **Subject:** Physics
**Time:** 3 hours | **Total Marks:** 10

## General Instructions
1. Answer all questions.

## Section A — MCQ (1 × 2 = 2 Marks)
Choose the correct option.

**Q1.** Sample MCQ with many options **[2 marks]**
(A) Option 1
(B) Option 2
(C) Option 3
(D) Option 4
(E) Option 5
(F) Option 6
(G) Option 7
(H) Option 8
(I) Option 9
(J) Option 10
`.trim();

describe('questionPapers markdown reliability flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMock.mockResolvedValue(undefined);
  });

  test('normalizePdfSourceDigest accepts valid digest payloads', () => {
    expect(
      normalizePdfSourceDigest({
        subject: 'physics',
        primaryTopic: 'electricity',
        coveredConcepts: ['electric current', 'potential difference'],
        keyFacts: ['Current is the rate of flow of charge.'],
        questionBoundaries: ['Do not include magnetism.'],
      })
    ).toEqual({
      subject: 'Physics',
      primaryTopic: 'Electricity',
      coveredConcepts: ['Electric Current', 'Potential Difference'],
      keyFacts: ['Current is the rate of flow of charge.'],
      questionBoundaries: ['Do not include magnetism.'],
    });
  });

  test('buildFormatResearchQuery uses the year-based pattern', () => {
    expect(
      buildFormatResearchQuery({
        examBoard: 'CBSE',
        educationLevel: 'Class 10',
        subject: 'Physics',
        year: 2026,
      })
    ).toBe('CBSE Class 10 Physics question paper pattern marking scheme 2026');
  });

  test('researchQuestionPaperFormat caches format research results for warm instances', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'CBSE format',
        url: 'https://example.com/format',
        snippet: 'Format details',
      },
    ]);
    executeHybridAiRequest.mockResolvedValue({
      text: JSON.stringify({
        totalMarks: 80,
        duration: '3 hours',
        generalInstructions: ['Answer all questions.'],
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all questions.',
            questionType: 'Short Answer',
            questions: 2,
            marksPerQuestion: 2,
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
    });

    const first = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      requestId: 'req-cache-1',
    });
    const second = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      requestId: 'req-cache-2',
    });

    expect(first.format.totalMarks).toBe(80);
    expect(second.format.totalMarks).toBe(80);
    expect(searchExamFormatSources).toHaveBeenCalledTimes(1);
    expect(executeHybridAiRequest).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith('format_research_cache_miss', { key: 'CBSE:Class 10:Physics' });
    expect(loggerInfo).toHaveBeenCalledWith('format_research_cache_hit', { key: 'CBSE:Class 10:Physics' });
  });

  test('family fallback results are cached when search research is unavailable', async () => {
    searchExamFormatSources.mockResolvedValue([]);

    const first = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'Unknown Board',
      plan: 'Plus',
      requestId: 'req-fallback-1',
    });
    const second = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'Unknown Board',
      plan: 'Plus',
      requestId: 'req-fallback-2',
    });

    expect(first.format.formatSource).toBe('family_fallback');
    expect(second.format.formatSource).toBe('family_fallback');
    expect(searchExamFormatSources).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith('format_research_cache_miss', {
      key: 'Unknown Board:Competitive Exam:Physics',
    });
    expect(loggerInfo).toHaveBeenCalledWith('format_research_cache_hit', {
      key: 'Unknown Board:Competitive Exam:Physics',
    });
  });

  test('search results always flow through model-based format parsing', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'JEE Main exam pattern',
        url: 'https://example.com/jee-main',
        snippet:
          'Section A has 20 multiple choice questions. Section B has 10 numerical value questions. Attempt any 5 in Section B.',
      },
    ]);

    executeHybridAiRequest.mockResolvedValue({
      text: JSON.stringify({
        totalMarks: 100,
        duration: '3 hours',
        generalInstructions: ['Answer all questions.'],
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all single-correct MCQs.',
            questionType: 'MCQ (Single Correct)',
            questions: 20,
            marksPerQuestion: 4,
          },
          {
            name: 'Section B',
            instructions: 'Answer numerical value questions.',
            questionType: 'Numerical Value',
            questions: 10,
            marksPerQuestion: 4,
            attemptRequired: 5,
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
    });

    const result = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'JEE Mains',
      plan: 'Plus',
      requestId: 'req-heuristic-jee',
    });

    expect(result.format.formatSource).toBe('official');
    expect(result.format.sections).toHaveLength(2);
    expect(result.format.sections[0]).toEqual(
      expect.objectContaining({
        name: 'Section A',
        questionType: 'MCQ (Single Correct)',
        questions: 20,
        marksPerQuestion: 4,
      })
    );
    expect(result.format.sections[1]).toEqual(
      expect.objectContaining({
        name: 'Section B',
        questionType: 'Numerical Value',
        questions: 10,
        attemptRequired: 5,
      })
    );
    expect(executeHybridAiRequest).toHaveBeenCalledTimes(1);
  });

  test('buildQuestionPaperMarkdownPrompt requests adaptive markdown generation rules', () => {
    const prompt = buildQuestionPaperMarkdownPrompt({
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      topic: 'Force',
      formatHint: {
        totalMarks: 10,
        duration: '3 hours',
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all questions.',
            questionType: 'Short Answer',
            questions: 2,
            marksPerQuestion: 2,
          },
        ],
      },
    });

    expect(prompt).toContain('Write a complete, authentic exam paper in Markdown only.');
    expect(prompt).toContain('# [EXAM TITLE]');
    expect(prompt).toContain('**Board:** CBSE');
    expect(prompt).toContain('Do not return JSON.');
    expect(prompt).toContain('Follow this official format exactly:');
  });

  test('buildQuestionPaperMarkdownPrompt asks model to determine authentic format when hint has no sections', () => {
    const prompt = buildQuestionPaperMarkdownPrompt({
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'Unknown Exam',
      formatHint: {
        totalMarks: 0,
        duration: '',
        formatSource: 'family_fallback',
        sections: [],
      },
    });

    expect(prompt).toContain('Determine the authentic official format');
    expect(prompt).toContain('Do not default to a generic 3-section format.');
  });

  test('generateQuestionPaperForUser saves raw markdown output and parse warnings as ready paper', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'JEE format',
        url: 'https://example.com/jee',
        snippet: 'Pattern',
      },
    ]);
    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 8,
          duration: '3 hours',
          generalInstructions: ['Answer all questions.'],
          sections: [
            {
              name: 'Section A',
              instructions: 'Choose the correct option.',
              questionType: 'MCQ',
              questions: 2,
              marksPerQuestion: 2,
            },
            {
              name: 'Section B',
              instructions: 'Answer briefly.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 4,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: markdownPaper,
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Chemistry',
      educationLevel: 'Competitive Exam',
      examBoard: 'JEE Mains',
      topic: 'Atomic Structure',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-markdown-ready',
    });

    expect(result.paper.status).toBe('ready');
    expect(result.paper.rawMarkdownOutput).toContain('# JEE Mains Chemistry Mock Paper');
    expect(result.paper.questions).toHaveLength(3);
    expect(result.paper.parseWarnings).toBeUndefined();
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ rawMarkdownOutput: markdownPaper }), { merge: true });
    expect(setMock.mock.calls[2][0]).not.toHaveProperty('subjectCode');
  });

  test('normalization trusts parsed sections when format hint has empty sections', async () => {
    searchExamFormatSources.mockResolvedValue([]);
    executeHybridAiRequest.mockResolvedValueOnce({
      text: markdownPaper,
      usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
    });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Chemistry',
      educationLevel: 'Competitive Exam',
      examBoard: 'Unknown Board',
      topic: 'Atomic Structure',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-empty-hint-sections',
    });

    expect(result.paper.status).toBe('ready');
    expect(result.paper.format.sections.length).toBeGreaterThan(1);
    expect(result.paper.format.sections[0].name).toContain('Section A');
  });

  test('generation trims options above schema max and keeps paper ready', async () => {
    searchExamFormatSources.mockResolvedValue([]);
    executeHybridAiRequest.mockResolvedValueOnce({
      text: markdownPaperWithTooManyOptions,
      usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
    });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-too-many-options',
    });

    expect(result.paper.status).toBe('ready');
    expect((result.paper.questions[0]?.options?.length ?? 0)).toBeLessThanOrEqual(8);
  });

  test('marks mismatches produce warnings instead of failed status', async () => {
    const warnings = validateQuestionPaperStructure({
      totalMarks: 20,
      sections: [
        {
          name: 'Section A',
          instructions: 'Answer all questions.',
          questionType: 'MCQ',
          questions: 2,
          marksPerQuestion: 2,
          totalMarks: 4,
        },
      ],
      questions: [
        {
          id: 'q-1',
          sectionName: 'Section A',
          questionNumber: 1,
          text: 'Question 1',
          type: 'mcq',
          marks: 5,
        },
      ],
    });

    expect(warnings).toEqual(
      expect.arrayContaining([
        'Total marks 5 may differ from official format 20.',
        'Section totals may not match the expected format. Please verify marks before use.',
        'Some MCQ options could not be parsed.',
      ])
    );
  });

  test('timeout before raw markdown save fails with the new guidance message', async () => {
    searchExamFormatSources.mockResolvedValue([]);
    executeHybridAiRequest.mockRejectedValueOnce(
      Object.assign(new Error('deadline-exceeded'), { code: 'TOTAL_TIMEOUT' })
    );

    await expect(
      generateQuestionPaperForUser({
        uid: 'user-1',
        subject: 'Chemistry',
        educationLevel: 'Competitive Exam',
        examBoard: 'JEE Mains',
        plan: 'Plus',
        sourceType: 'topic',
        requestId: 'req-timeout-failed',
      })
    ).rejects.toThrow('deadline-exceeded');

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureMessage: 'Generation took too long. Try a more specific topic or shorter paper.',
      }),
      { merge: true }
    );
  });

  test('timeout after raw markdown save downgrades to partial', async () => {
    searchExamFormatSources.mockResolvedValue([]);
    executeHybridAiRequest.mockResolvedValueOnce({
      text: markdownPaper,
      usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
    });
    setMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('deadline-exceeded'), { code: 'TOTAL_TIMEOUT' }))
      .mockResolvedValueOnce(undefined);

    await expect(
      generateQuestionPaperForUser({
        uid: 'user-1',
        subject: 'Chemistry',
        educationLevel: 'Competitive Exam',
        examBoard: 'JEE Mains',
        plan: 'Plus',
        sourceType: 'topic',
        requestId: 'req-timeout-partial',
      })
    ).rejects.toThrow('deadline-exceeded');

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'partial',
        rawMarkdownOutput: markdownPaper,
        parseWarnings: expect.arrayContaining(['Generation timed out — paper may be incomplete']),
      }),
      { merge: true }
    );
  });
});
