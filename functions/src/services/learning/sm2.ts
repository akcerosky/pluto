import type { FlashcardCardDoc } from '../../types/index.js';

export const updateCardAfterReview = (
  card: FlashcardCardDoc,
  rating: 'easy' | 'good' | 'hard',
  nowIso: string
): FlashcardCardDoc => {
  let { interval, easinessFactor, repetitions } = card;

  if (rating === 'hard') {
    interval = 1;
    repetitions = 0;
  } else if (rating === 'good') {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easinessFactor);
    repetitions += 1;
    easinessFactor = Math.max(1.3, easinessFactor - 0.08);
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easinessFactor);
    repetitions += 1;
    easinessFactor = Math.max(1.3, easinessFactor + 0.15);
  }

  const nextReviewDate = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();
  const masteryLevel =
    repetitions >= 5 && easinessFactor >= 2.0
      ? 'mastered'
      : repetitions >= 2
        ? 'reviewing'
        : repetitions >= 1
          ? 'learning'
          : 'new';

  return {
    ...card,
    interval,
    easinessFactor,
    repetitions,
    nextReviewAt: nextReviewDate,
    lastReviewedAt: nowIso,
    lastRating: rating,
    masteryLevel,
    timesReviewed: (card.timesReviewed ?? 0) + 1,
    timesCorrect: (card.timesCorrect ?? 0) + (rating === 'hard' ? 0 : 1),
  };
};
