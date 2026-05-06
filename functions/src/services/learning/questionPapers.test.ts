const executeHybridAiRequest = jest.fn();
const searchExamFormatSources = jest.fn();
const setMock = jest.fn();
const docMock = jest.fn(() => ({
  id: 'paper-1',
  set: setMock,
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

import { generateQuestionPaperForUser, normalizePdfSourceDigest } from './questionPapers.js';

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
          totalMarks: 80,
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
          format: {
            totalMarks: 80,
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
          questions: [
            {
              id: 'q-1',
              sectionName: 'Section A',
              questionNumber: 1,
              text: 'What is force?',
              type: 'short_answer',
              marks: 2,
            },
          ],
        }),
        usage: { inputTokens: 20, outputTokens: 40, totalTokens: 60, usageSource: 'provider' },
      });

    await generateQuestionPaperForUser({
      uid: 'user-1',
      subject: 'Physics',
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      topic: 'Force',
      plan: 'Plus',
      sourceType: 'topic',
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
        maxOutputTokens: 2500,
        totalTimeoutMs: 90000,
      })
    );
  });
});
