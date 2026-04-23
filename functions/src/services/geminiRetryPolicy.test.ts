import { isRetryableGeminiError } from './gemini.js';

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
