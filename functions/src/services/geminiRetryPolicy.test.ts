import {
  GEMINI_MODEL_FALLBACK_ORDER,
  GEMINI_RETRY_BACKOFFS_MS,
  GEMINI_RETRY_JITTER_MS,
  isRetryableGeminiError,
} from './gemini.js';

const providerError = (status: number) => ({ status, message: `status ${status}` });

test('Gemini retry policy retries only transient provider errors', () => {
  expect(isRetryableGeminiError(providerError(500))).toBe(true);
  expect(isRetryableGeminiError(providerError(503))).toBe(true);
  expect(isRetryableGeminiError({ code: 'DEADLINE_EXCEEDED', message: 'deadline' })).toBe(true);

  expect(isRetryableGeminiError(providerError(429))).toBe(false);
  expect(isRetryableGeminiError(providerError(403))).toBe(false);
  expect(isRetryableGeminiError(providerError(401))).toBe(false);
  expect(isRetryableGeminiError(providerError(400))).toBe(false);
});

test('Gemini retry schedule uses two total attempts with defined jitter', () => {
  expect(GEMINI_RETRY_BACKOFFS_MS).toEqual([0, 3000]);
  expect(GEMINI_RETRY_JITTER_MS).toBe(500);
});

test('Gemini fallback order uses Flash first and Flash Lite second', () => {
  expect(GEMINI_MODEL_FALLBACK_ORDER).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
});
