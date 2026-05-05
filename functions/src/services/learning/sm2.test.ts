import { updateCardAfterReview } from './sm2.js';

const baseCard = {
  id: 'card-1',
  front: 'What is mitosis?',
  back: 'Cell division',
  concept: 'Mitosis',
  order: 1,
  interval: 6,
  easinessFactor: 2.5,
  repetitions: 2,
  nextReviewAt: new Date().toISOString(),
  masteryLevel: 'learning' as const,
  timesReviewed: 1,
  timesCorrect: 1,
};

test('hard rating resets interval and repetitions', () => {
  const updated = updateCardAfterReview(baseCard, 'hard', new Date().toISOString());
  expect(updated.interval).toBe(1);
  expect(updated.repetitions).toBe(0);
  expect(updated.masteryLevel).toBe('new');
});

test('good rating advances repetition and reduces easiness slightly', () => {
  const updated = updateCardAfterReview(baseCard, 'good', new Date().toISOString());
  expect(updated.repetitions).toBe(3);
  expect(updated.easinessFactor).toBeCloseTo(2.42, 2);
  expect(updated.masteryLevel).toBe('reviewing');
});

test('easy rating advances repetition and boosts easiness factor', () => {
  const updated = updateCardAfterReview(baseCard, 'easy', new Date().toISOString());
  expect(updated.repetitions).toBe(3);
  expect(updated.easinessFactor).toBeCloseTo(2.65, 2);
  expect(updated.timesCorrect).toBe(baseCard.timesCorrect + 1);
});
