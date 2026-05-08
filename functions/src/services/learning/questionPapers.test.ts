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
  EXAM_FORMAT_OVERRIDES,
  generateQuestionPaperForUser,
  normalizePdfSourceDigest,
  normalizeQuestionPaperPayload,
  researchQuestionPaperFormat,
  validateQuestionPaperStructure,
} from './questionPapers.js';
import { sanitizePdfRenderableText } from './questionPaperSanitizer.js';

const buildLongQuestionsPayload = (text: string) =>
  JSON.stringify({
    questions: [
      {
        id: 'q-1',
        sectionName: 'Section A',
        questionNumber: 1,
        text,
        type: 'short_answer',
        marks: 2,
        subParts: [
          'State the governing law for the circuit and identify the variables involved in detail using complete engineering terminology from the paper.',
          'Write one practical use case from first-year engineering labs and explain how the same idea is observed during a standard introductory experiment.',
          'Add one more short explanatory point that stays inside the same source material and reinforces the concept clearly for the learner.',
        ],
      },
    ],
  });

const buildSectionQuestionPayload = ({
  sectionName,
  questionNumber,
  text,
}: {
  sectionName: string;
  questionNumber: number;
  text: string;
}) =>
  JSON.stringify({
    questions: [
      {
        id: `q-${questionNumber}`,
        sectionName,
        questionNumber,
        text,
        type: 'short_answer',
        marks: 2,
        subParts: [
          'State the key idea using the terminology from the source and connect it to the exact concept family covered in the uploaded lesson.',
          'Give one short applied example from the same source material and explain why it belongs to this section of the paper.',
          'Add one more compact explanatory sentence so the response payload remains complete and detailed for validation.',
        ],
      },
    ],
  });

describe('normalizePdfSourceDigest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts valid digest payloads', () => {
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

  test('returns null instead of throwing on malformed list fields', () => {
    expect(() =>
      normalizePdfSourceDigest({
        subject: 'Physics',
        primaryTopic: 'Electricity',
        coveredConcepts: [{ label: 'current' }],
        keyFacts: 'Current flows',
        questionBoundaries: 'Avoid magnetism',
      })
    ).not.toThrow();

    expect(
      normalizePdfSourceDigest({
        subject: 'Physics',
        primaryTopic: 'Electricity',
        coveredConcepts: [{ label: 'current' }],
        keyFacts: 'Current flows',
        questionBoundaries: 'Avoid magnetism',
      })
    ).toBeNull();
  });

  test('question paper generation opts into extended AI timeouts for research and final generation', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'CBSE format',
        url: 'https://example.com/format',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
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
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Class 10 CBSE Physics',
          headerBoardName: 'CBSE',
          format: {
            totalMarks: 2,
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
          generalInstructions: ['Answer all questions.'],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildLongQuestionsPayload(
          'What is force? Explain its engineering significance with one real-world example from mechanics.'
        ),
        usage: { inputTokens: 22, outputTokens: 42, totalTokens: 64, usageSource: 'provider' },
      });

    await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      topic: 'Force',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-question-paper-test',
    });

    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        maxOutputTokens: 1200,
        totalTimeoutMs: 60000,
      })
    );
    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        maxOutputTokens: 1600,
        totalTimeoutMs: 90000,
      })
    );
    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        maxOutputTokens: 4096,
        totalTimeoutMs: 90000,
      })
    );
  });

  test('buildFormatResearchQuery uses the official sample-paper search shape', () => {
    expect(buildFormatResearchQuery({
      examBoard: 'CBSE',
      educationLevel: 'Class 10',
      subject: 'Physics',
    })).toBe('CBSE Class 10 Physics sample question paper marking scheme official');
  });

  test('uses exam format overrides directly for known competitive exams without running search research', async () => {
    const result = await researchQuestionPaperFormat({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Competitive Exam',
      examBoard: 'JEE Mains',
      plan: 'Plus',
      requestId: 'req-override-jee-mains',
    });

    expect(searchExamFormatSources).not.toHaveBeenCalled();
    expect(executeHybridAiRequest).not.toHaveBeenCalled();
    expect(result.format.totalMarks).toBe(EXAM_FORMAT_OVERRIDES['JEE Mains'].totalMarks);
    expect(result.format.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Section A',
          questionType: 'MCQ (Single Correct)',
          negativeMarking: -1,
        }),
        expect.objectContaining({
          name: 'Section B',
          questionType: 'Numerical Value',
          attemptRequired: 5,
        }),
      ])
    );
  });

  test('validateQuestionPaperStructure enforces type-based mark ranges and exact totals', () => {
    expect(() =>
      validateQuestionPaperStructure({
        totalMarks: 10,
        sections: [
          {
            name: 'Section A',
            instructions: 'Answer all questions.',
            questionType: 'Short Answer Questions',
            questions: 1,
            marksPerQuestion: 2,
          },
        ],
        questions: [
          {
            id: 'q-1',
            sectionName: 'Section A',
            questionNumber: 1,
            text: 'Explain Ohmâ€™s law.',
            type: 'short_answer',
            marks: 10,
          },
        ],
      })
    ).toThrow('Invalid marks for short_answer');
  });

  test('normalizeQuestionPaperPayload sanitizes text and humanizes section labels', () => {
    const normalized = normalizeQuestionPaperPayload({
      fallbackTitle: 'class 10 cbse physics exam',
      format: {
        totalMarks: 2,
        duration: '3 hours',
        sections: [
          {
            name: 'section_a',
            instructions: 'Answer donât skip.',
            questionType: 'short_answer',
            questions: 1,
            marksPerQuestion: 2,
          },
        ],
      },
      questions: [
        {
          id: 'q-1',
          sectionName: 'section_a',
          questionNumber: 1,
          text: 'Explain donât and find √x.',
          type: 'short_answer',
          marks: 2,
          options: ['A â€¢ 2', 'B â€¢ 4'],
        },
      ],
    });

    expect(normalized.title).toBe('Class 10 Cbse Physics Exam');
    expect(normalized.format.sections[0]).toMatchObject({
      name: 'Section A',
      questionType: 'Short Answer',
      instructions: "Answer don't skip.",
    });
    expect(normalized.questions[0]).toMatchObject({
      sectionName: 'Section A',
      text: "Explain don't and find sqrtx.",
    });
  });

  test('sanitizePdfRenderableText converts unsupported exam symbols to ASCII fallbacks', () => {
    expect(sanitizePdfRenderableText('₹5 at 30°C, x² + √y ≥ π and a ≠ b')).toBe(
      'Rs.5 at 30deg C, x^2 + sqrty >= pi and a != b'
    );
  });
  test('repairs fenced JSON with trailing commas and succeeds without retry', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'University format',
        url: 'https://example.com/university',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: '```json\n{"title":"BEE Paper","format":{"totalMarks":2,"duration":"3 hours","sections":[{"name":"Section A","instructions":"Answer all questions.","questionType":"Short Answer","questions":1,"marksPerQuestion":2,},],},"generalInstructions":["Answer all questions.",],}\n```',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: `\`\`\`json
{"questions":[{"id":"q-1","sectionName":"Section A","questionNumber":1,"text":"Define BEE and explain why first-year engineering students study electrical quantities, safety, and circuit basics before entering discipline-specific labs with reference to foundational engineering practice.","type":"short_answer","marks":2,"subParts":["Name two measurable electrical quantities and mention where each one is observed in an introductory lab setup.","State one basic laboratory precaution and explain why it matters before handling live or simulated circuit components.","Add one more short explanatory sentence that stays within the same concept boundary and reinforces the purpose of the topic.",],},]}
\`\`\``,
        usage: { inputTokens: 18, outputTokens: 36, totalTokens: 54, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'BEE',
      educationLevel: 'B.Tech / B.E.',
      examBoard: 'University End Semester',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-question-paper-repair',
    });

    expect(result.paper.title).toBe('Bee Paper');
    expect(executeHybridAiRequest).toHaveBeenCalledTimes(3);
    expect(
      loggerWarn.mock.calls.some(([eventType]) => eventType === 'paper_generation_json_parse_failed')
    ).toBe(false);
  });

  test('retries questions generation once when first parse fails because response is too short', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'University format',
        url: 'https://example.com/university',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: '{"title":"BEE Retry Paper","format":{"totalMarks":2,"duration":"3 hours","sections":[{"name":"Section A","instructions":"Answer all questions.","questionType":"Short Answer","questions":1,"marksPerQuestion":2}]},"generalInstructions":["Answer all questions."]}',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: 'too short',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildLongQuestionsPayload(
          'Explain basic electrical engineering and show how voltage, current, and resistance are related in a simple resistive circuit.'
        ),
        usage: { inputTokens: 15, outputTokens: 35, totalTokens: 50, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'BEE',
      educationLevel: 'B.Tech / B.E.',
      examBoard: 'University End Semester',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-question-paper-retry',
    });

    expect(result.paper.title).toBe('Bee Retry Paper');
    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        maxOutputTokens: 4096,
      })
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_incomplete_question_output',
      expect.objectContaining({
        requestId: 'req-question-paper-retry',
        isRetry: false,
        rawResponsePreview: 'too short',
      })
    );
  });

  test('short first question response skips parsing and retries with a hotter prompt', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'CBSE format',
        url: 'https://example.com/cbse',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Class 10 CBSE Physics',
          format: {
            totalMarks: 2,
            duration: '3 hours',
            sections: [
              {
                name: 'Section A',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
            ],
          },
          generalInstructions: ['Answer all questions.'],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: '{"questions":[{"id":"q-1","sectionName":"Section A","questionNumber":1,"text":"Incomplete',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildLongQuestionsPayload(
          'Explain electric current and relate it to charge flow with one simple classroom example.'
        ),
        usage: { inputTokens: 15, outputTokens: 35, totalTokens: 50, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-short-first-retry',
    });

    expect(result.paper.title).toBe('Class 10 Cbse Physics');
    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        temperature: 0.8,
        prompt: expect.stringContaining(
          'Previous attempt returned incomplete output. Please generate a complete, detailed response.'
        ),
      })
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_incomplete_question_output',
      expect.objectContaining({
        requestId: 'req-short-first-retry',
        isRetry: false,
      })
    );
  });

  test('throws descriptive error after retry parse failure and logs raw preview', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'University format',
        url: 'https://example.com/university',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: '{"title":"BEE Retry Paper","format":{"totalMarks":2,"duration":"3 hours","sections":[{"name":"Section A","instructions":"Answer all questions.","questionType":"Short Answer","questions":1,"marksPerQuestion":2}]},"generalInstructions":["Answer all questions."]}',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: 'bad response one',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: 'bad response two',
        usage: { inputTokens: 15, outputTokens: 35, totalTokens: 50, usageSource: 'provider' },
      });

    await expect(
      generateQuestionPaperForUser({
        uid: 'user-1',
        subject: 'BEE',
        educationLevel: 'B.Tech / B.E.',
        examBoard: 'University End Semester',
        plan: 'Plus',
        sourceType: 'topic',
        requestId: 'req-question-paper-retry-fail',
      })
    ).rejects.toThrow('Question paper generation returned invalid JSON after retry. Raw response length: 16');

    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_incomplete_question_output',
      expect.objectContaining({
        requestId: 'req-question-paper-retry-fail',
        isRetry: false,
        rawResponsePreview: 'bad response one',
      })
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_response_too_short',
      expect.objectContaining({
        requestId: 'req-question-paper-retry-fail',
        isRetry: true,
        rawResponsePreview: 'bad response two',
      })
    );
  });

  test('applies end truncation repair when parse fails near the end of a long response', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'University format',
        url: 'https://example.com/university',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 2,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'BEE Repair Paper',
          format: {
            totalMarks: 2,
            duration: '3 hours',
            sections: [
              {
                name: 'Section A',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
            ],
          },
          generalInstructions: ['Answer all questions.'],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: `{"questions":[{"id":"q-1","sectionName":"Section A","questionNumber":1,"text":"${'Explain the role of Ohm law in analysing introductory engineering circuits. '.repeat(
          8
        )}","type":"short_answer","marks":2`,
        usage: { inputTokens: 25, outputTokens: 45, totalTokens: 70, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'BEE',
      educationLevel: 'B.Tech / B.E.',
      examBoard: 'University End Semester',
      plan: 'Plus',
      sourceType: 'topic',
      requestId: 'req-question-paper-truncation-repair',
    });

    expect(result.paper.title).toBe('Bee Repair Paper');
    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_truncation_repaired',
      expect.objectContaining({
        requestId: 'req-question-paper-truncation-repair',
        isRetry: false,
      })
    );
  });

  test('recovers from incomplete all-sections output by regenerating questions section by section', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'CBSE format',
        url: 'https://example.com/cbse',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 4,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
            {
              name: 'Section B',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Class 10 CBSE Physics',
          format: {
            totalMarks: 4,
            duration: '3 hours',
            sections: [
              {
                name: 'Section A',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
              {
                name: 'Section B',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
            ],
          },
          generalInstructions: ['Answer all questions.'],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section A',
          questionNumber: 1,
          text: 'Explain electric current and write one daily-life example drawn from the uploaded source.',
        }),
        usage: { inputTokens: 25, outputTokens: 50, totalTokens: 75, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section A',
          questionNumber: 1,
          text: 'Explain electric current and distinguish it from potential difference using the uploaded lesson context.',
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section B',
          questionNumber: 2,
          text: 'Define potential difference and describe how it is measured in a simple circuit from the same source.',
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      sourceType: 'pdf',
      sourceContext: 'SOURCE COVERAGE\nSubject: Physics\nPrimary topic: Electricity',
      requestId: 'req-question-paper-section-recovery',
    });

    expect(result.paper.questions).toHaveLength(2);
    expect(result.paper.questions.map((question) => question.sectionName)).toEqual(['Section A', 'Section B']);
    expect(executeHybridAiRequest).toHaveBeenCalledTimes(5);
    expect(loggerWarn).toHaveBeenCalledWith(
      'paper_generation_section_recovery_started',
      expect.objectContaining({
        requestId: 'req-question-paper-section-recovery',
        sourceType: 'pdf',
      })
    );
  });

  test('section recovery also retries hotter when the first section response is incomplete', async () => {
    searchExamFormatSources.mockResolvedValue([
      {
        title: 'CBSE format',
        url: 'https://example.com/cbse',
        snippet: 'Format details',
      },
    ]);

    executeHybridAiRequest
      .mockResolvedValueOnce({
        text: JSON.stringify({
          totalMarks: 4,
          duration: '3 hours',
          sections: [
            {
              name: 'Section A',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
            {
              name: 'Section B',
              instructions: 'Answer all questions.',
              questionType: 'Short Answer',
              questions: 1,
              marksPerQuestion: 2,
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Class 10 CBSE Physics',
          format: {
            totalMarks: 4,
            duration: '3 hours',
            sections: [
              {
                name: 'Section A',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
              {
                name: 'Section B',
                instructions: 'Answer all questions.',
                questionType: 'Short Answer',
                questions: 1,
                marksPerQuestion: 2,
              },
            ],
          },
          generalInstructions: ['Answer all questions.'],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section A',
          questionNumber: 1,
          text: 'Explain electric current and write one daily-life example drawn from the uploaded source.',
        }),
        usage: { inputTokens: 25, outputTokens: 50, totalTokens: 75, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: '{"questions":[{"id":"q-1","sectionName":"Section A","questionNumber":1,"text":"Incomplete',
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section A',
          questionNumber: 1,
          text: 'Explain electric current and distinguish it from potential difference using the uploaded lesson context.',
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      })
      .mockResolvedValueOnce({
        text: buildSectionQuestionPayload({
          sectionName: 'Section B',
          questionNumber: 2,
          text: 'Define potential difference and describe how it is measured in a simple circuit from the same source.',
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      });

    const result = await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      plan: 'Plus',
      sourceType: 'pdf',
      sourceContext: 'SOURCE COVERAGE\nSubject: Physics\nPrimary topic: Electricity',
      requestId: 'req-section-short-first-retry',
    });

    expect(result.paper.questions).toHaveLength(2);
    expect(executeHybridAiRequest).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        temperature: 0.8,
        prompt: expect.stringContaining(
          'Previous attempt returned incomplete output. Please generate a complete, detailed response.'
        ),
      })
    );
  });
});
