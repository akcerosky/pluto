jest.mock('../lib/http.js', () => ({
  assertAuth: jest.fn(() => 'user-1'),
  getBootstrapIdentity: jest.fn(() => undefined),
}));

jest.mock('../services/firestoreRepo.js', () => ({
  getMeSnapshot: jest.fn(async () => ({
    subscription: { plan: 'Plus' },
    planDefinition: { learningFeaturesEnabled: true },
  })),
}));

jest.mock('../services/learning/flashcards.js', () => ({
  generateFlashcardSetForUser: jest.fn(async (payload) => payload),
  deleteFlashcardSetForUser: jest.fn(),
  getDueCardsForUser: jest.fn(),
  getFlashcardCardsForSet: jest.fn(),
  getFlashcardSetsForUser: jest.fn(),
  submitCardReviewForUser: jest.fn(),
}));

jest.mock('../services/learning/questionPapers.js', () => ({
  deleteQuestionPaperForUser: jest.fn(),
  extractPdfTextWithNovaLite: jest.fn(),
  generateQuestionPaperForUser: jest.fn(),
  generateQuestionPaperPdfForUser: jest.fn(),
  inferSubjectFromText: jest.fn(),
  listQuestionPapers: jest.fn(),
}));

import { generateFlashcardSetHandler } from './learning.js';

test('generateFlashcardSet accepts null optional fields and normalizes them away', async () => {
  const result = await generateFlashcardSetHandler({
    auth: { uid: 'user-1' },
    data: {
      topic: 'Photosynthesis',
      subject: null,
      educationLevel: null,
    },
  } as never);

  expect(result).toMatchObject({
    uid: 'user-1',
    topic: 'Photosynthesis',
    plan: 'Plus',
  });
  expect(result).not.toHaveProperty('subject', null);
  expect(result).not.toHaveProperty('educationLevel', null);
});
