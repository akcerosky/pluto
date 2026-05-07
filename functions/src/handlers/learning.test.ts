import { HttpsError } from 'firebase-functions/v2/https';

const getMeSnapshot = jest.fn(async () => ({
  subscription: { plan: 'Plus' },
  planDefinition: { learningFeaturesEnabled: true },
}));

const reserveUsageTokens = jest.fn(async () => undefined);
const releaseReservedUsageTokens = jest.fn(async () => undefined);
const reconcileUsageTokens = jest.fn(async () => ({
  usageTodayTokens: 100,
  dailyTokenLimit: 250000,
  remainingTodayTokens: 249900,
  estimatedMessagesLeft: 62,
  premiumModeCount: 0,
  freePremiumModesRemainingToday: 0,
}));

jest.mock('../lib/http.js', () => ({
  assertAuth: jest.fn(() => 'user-1'),
  getBootstrapIdentity: jest.fn(() => undefined),
}));

jest.mock('../services/firestoreRepo.js', () => ({
  getMeSnapshot,
  reserveUsageTokens,
  releaseReservedUsageTokens,
  reconcileUsageTokens,
}));

const buildFlashcardMeteringPayload = jest.fn(({ topic, educationLevel }) => ({
  reservedTokens: 6100,
  meteringContext: {
    prompt: `flashcards:${topic}`,
    educationLevel: educationLevel || 'High School',
    mode: 'Conversational',
    objective: `Generate a machine-readable flashcard set for ${topic}`,
    history: [],
    contextSummaryText: undefined,
  },
}));

const generateFlashcardSetForUser = jest.fn();

jest.mock('../services/learning/flashcards.js', () => ({
  buildFlashcardMeteringPayload,
  generateFlashcardSetForUser,
  deleteFlashcardSetForUser: jest.fn(),
  getDueCardsForUser: jest.fn(),
  getFlashcardCardsForSet: jest.fn(),
  getFlashcardSetsForUser: jest.fn(),
  submitCardReviewForUser: jest.fn(),
}));

const buildQuestionPaperMeteringPlan = jest.fn();
const buildPdfQuestionPaperMeteringPlan = jest.fn();
const extractPdfTextWithNovaLite = jest.fn();
const summarizePdfSourceMaterial = jest.fn();
const inferSubjectFromText = jest.fn();
const generateQuestionPaperForUser = jest.fn();

jest.mock('../services/learning/questionPapers.js', () => ({
  buildPdfQuestionPaperMeteringPlan,
  buildPdfTopicFromDigest: jest.fn((digest) => digest?.primaryTopic),
  buildQuestionPaperMeteringPlan,
  buildSourceContextFromDigest: jest.fn(() => 'source context'),
  buildSubjectFromDigest: jest.fn(() => ''),
  deleteQuestionPaperForUser: jest.fn(),
  extractPdfTextWithNovaLite,
  generateQuestionPaperForUser,
  generateQuestionPaperPdfForUser: jest.fn(),
  inferSubjectFromText,
  listQuestionPapers: jest.fn(),
  summarizePdfSourceMaterial,
}));

import {
  generateFlashcardSetHandler,
  generatePaperFromPdfsHandler,
} from './learning.js';

beforeEach(() => {
  jest.clearAllMocks();
  getMeSnapshot.mockResolvedValue({
    subscription: { plan: 'Plus' },
    planDefinition: { learningFeaturesEnabled: true },
  });
  reserveUsageTokens.mockResolvedValue(undefined);
  releaseReservedUsageTokens.mockResolvedValue(undefined);
  reconcileUsageTokens.mockResolvedValue({
    usageTodayTokens: 100,
    dailyTokenLimit: 250000,
    remainingTodayTokens: 249900,
    estimatedMessagesLeft: 62,
    premiumModeCount: 0,
    freePremiumModesRemainingToday: 0,
  });
  buildFlashcardMeteringPayload.mockImplementation(({ topic, educationLevel }) => ({
    reservedTokens: 6100,
    meteringContext: {
      prompt: `flashcards:${topic}`,
      educationLevel: educationLevel || 'High School',
      mode: 'Conversational',
      objective: `Generate a machine-readable flashcard set for ${topic}`,
      history: [],
      contextSummaryText: undefined,
    },
  }));
  buildQuestionPaperMeteringPlan.mockReturnValue({
    reservedTokens: 11000,
    meteringContext: {
      prompt: 'question-paper',
      educationLevel: 'Class 10',
      mode: 'ExamPrep',
      objective: 'Generate question paper',
      history: [],
      contextSummaryText: undefined,
    },
  });
  buildPdfQuestionPaperMeteringPlan.mockReturnValue({
    reservedTokens: 42000,
    meteringContext: {
      prompt: 'pdf-question-paper',
      educationLevel: 'Class 10',
      mode: 'ExamPrep',
      objective: 'Generate paper from PDFs',
      history: [],
      contextSummaryText: undefined,
    },
  });
});

test('generateFlashcardSet accepts null optional fields and normalizes them away', async () => {
  generateFlashcardSetForUser.mockResolvedValue({
    setId: 'set-1',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, usageSource: 'provider' },
  });

  const result = await generateFlashcardSetHandler({
    auth: { uid: 'user-1' },
    data: {
      topic: 'Photosynthesis',
      subject: null,
      educationLevel: null,
    },
  } as never);

  expect(result).toMatchObject({ setId: 'set-1' });
  expect(generateFlashcardSetForUser).toHaveBeenCalledWith(
    expect.objectContaining({
      uid: 'user-1',
      topic: 'Photosynthesis',
      plan: 'Plus',
    })
  );
  expect(generateFlashcardSetForUser.mock.calls[0][0]).not.toHaveProperty('subject', null);
  expect(generateFlashcardSetForUser.mock.calls[0][0]).not.toHaveProperty('educationLevel', null);
});

test('generateFlashcardSet reserves and reconciles aggregated usage on success', async () => {
  generateFlashcardSetForUser.mockResolvedValue({
    setId: 'set-1',
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, usageSource: 'provider' },
  });

  const result = await generateFlashcardSetHandler({
    auth: { uid: 'user-1' },
    data: {
      topic: 'Photosynthesis',
      subject: 'Biology',
      educationLevel: 'Class 10',
    },
  } as never);

  expect(result).toMatchObject({ setId: 'set-1', usagePendingSync: false });
  expect(reserveUsageTokens).toHaveBeenCalledWith('user-1', 'Plus', 6100);
  expect(reconcileUsageTokens).toHaveBeenCalledWith(
    'user-1',
    'Plus',
    6100,
    { inputTokens: 120, outputTokens: 80, totalTokens: 200, usageSource: 'provider' }
  );
  expect(releaseReservedUsageTokens).not.toHaveBeenCalled();
});

test('generateFlashcardSet releases reserved tokens when generation fails', async () => {
  generateFlashcardSetForUser.mockRejectedValue(new Error('model failed'));

  await expect(
    generateFlashcardSetHandler({
      auth: { uid: 'user-1' },
      data: {
        topic: 'Photosynthesis',
      },
    } as never)
  ).rejects.toThrow('model failed');

  expect(reserveUsageTokens).toHaveBeenCalledWith('user-1', 'Plus', 6100);
  expect(releaseReservedUsageTokens).toHaveBeenCalledWith('user-1', 6100);
  expect(reconcileUsageTokens).not.toHaveBeenCalled();
});

test('generatePaperFromPdfs reconciles aggregated usage across all sub-steps', async () => {
  extractPdfTextWithNovaLite.mockResolvedValue({
    text: 'extracted text',
    usage: { inputTokens: 1000, outputTokens: 600, totalTokens: 1600, usageSource: 'provider' },
  });
  summarizePdfSourceMaterial.mockResolvedValue({
    digest: { subject: 'Chemistry', primaryTopic: 'Chemical Reactions', coveredConcepts: [], keyFacts: [], questionBoundaries: [] },
    usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, usageSource: 'estimated' },
  });
  inferSubjectFromText.mockResolvedValue({
    subject: 'Chemistry',
    usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, usageSource: 'provider' },
  });
  generateQuestionPaperForUser.mockResolvedValue({
    paper: { id: 'paper-1' },
    usage: { inputTokens: 300, outputTokens: 240, totalTokens: 540, usageSource: 'provider' },
  });

  const result = await generatePaperFromPdfsHandler({
    auth: { uid: 'user-1' },
    data: {
      pdfAttachments: [
        {
          name: 'lesson.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          base64Data: 'ZmFrZQ==',
        },
      ],
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      subject: null,
    },
  } as never);

  expect(result).toMatchObject({ paperId: 'paper-1', usagePendingSync: false });
  expect(reserveUsageTokens).toHaveBeenCalledWith('user-1', 'Plus', 42000);
  expect(reconcileUsageTokens).toHaveBeenCalledWith(
    'user-1',
    'Plus',
    42000,
    {
      inputTokens: 1540,
      outputTokens: 960,
      totalTokens: 2500,
      usageSource: 'estimated',
    }
  );
});

test('generatePaperFromPdfs returns success with usagePendingSync when reconciliation fails', async () => {
  extractPdfTextWithNovaLite.mockResolvedValue({
    text: 'extracted text',
    usage: { inputTokens: 1000, outputTokens: 600, totalTokens: 1600, usageSource: 'provider' },
  });
  summarizePdfSourceMaterial.mockResolvedValue({
    digest: { subject: 'Chemistry', primaryTopic: 'Chemical Reactions', coveredConcepts: [], keyFacts: [], questionBoundaries: [] },
    usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, usageSource: 'provider' },
  });
  inferSubjectFromText.mockResolvedValue({
    subject: 'Chemistry',
    usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60, usageSource: 'provider' },
  });
  generateQuestionPaperForUser.mockResolvedValue({
    paper: { id: 'paper-1' },
    usage: { inputTokens: 300, outputTokens: 240, totalTokens: 540, usageSource: 'provider' },
  });
  reconcileUsageTokens.mockRejectedValueOnce(new Error('reconcile failed'));

  const result = await generatePaperFromPdfsHandler({
    auth: { uid: 'user-1' },
    data: {
      pdfAttachments: [
        {
          name: 'lesson.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          base64Data: 'ZmFrZQ==',
        },
      ],
      educationLevel: 'Class 10',
      examBoard: 'CBSE',
      subject: 'Chemistry',
    },
  } as never);

  expect(result).toMatchObject({ paperId: 'paper-1', usagePendingSync: true });
  expect(releaseReservedUsageTokens).toHaveBeenCalledWith('user-1', 42000);
});

test('generateFlashcardSet throws quota error when reservation exceeds quota', async () => {
  reserveUsageTokens.mockRejectedValueOnce(new Error('TOKEN_QUOTA_EXCEEDED'));

  await expect(
    generateFlashcardSetHandler({
      auth: { uid: 'user-1' },
      data: {
        topic: 'Photosynthesis',
      },
    } as never)
  ).rejects.toEqual(
    new HttpsError(
      'resource-exhausted',
      'You reached the Plus daily token limit for today. Upgrade to continue or wait for the 00:00 IST reset.'
    )
  );
});
