export const normalizeLearningErrorMessage = ({
  error,
  fallback,
}: {
  error: unknown;
  fallback: string;
}) => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';

  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === 'INTERNAL') {
    return fallback;
  }

  if (/Provider attempt timed out/i.test(normalized) || /temporarily busy/i.test(normalized)) {
    return 'Pluto is taking longer than expected right now. Please try again in a moment.';
  }

  if (/invalid JSON|structure/i.test(normalized)) {
    return "Pluto couldn't format the paper correctly. This sometimes happens with niche exam types. Please try again or rephrase the subject.";
  }

  if (/Flashcard generation returned invalid JSON/i.test(normalized)) {
    return 'Pluto could not structure the flashcards correctly on that attempt. Please try again.';
  }

  if (/Cannot use "undefined" as a Firestore value/i.test(normalized)) {
    return 'This attempt failed before Pluto could finish saving your result. Please try again.';
  }

  if (/permission-denied|unauthenticated/i.test(normalized)) {
    return 'Pluto could not complete this request with your current session. Please refresh and try again.';
  }

  if (/unavailable|resource-exhausted|quota/i.test(normalized)) {
    return 'Pluto is temporarily unavailable for this request. Please try again shortly.';
  }

  if (/internal|unexpected/i.test(normalized)) {
    return fallback;
  }

  return normalized.length > 220 ? fallback : normalized;
};
