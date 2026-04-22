import { GEMINI_RETRY_BACKOFFS_MS, GEMINI_RETRY_JITTER_MS, isRetryableGeminiError } from './gemini.js';
const providerError = (status) => ({ status, message: `status ${status}` });
test('Gemini retry policy retries only transient provider errors', () => {
    expect(isRetryableGeminiError(providerError(500))).toBe(true);
    expect(isRetryableGeminiError(providerError(503))).toBe(true);
    expect(isRetryableGeminiError({ code: 'DEADLINE_EXCEEDED', message: 'deadline' })).toBe(true);
    expect(isRetryableGeminiError(providerError(429))).toBe(false);
    expect(isRetryableGeminiError(providerError(403))).toBe(false);
    expect(isRetryableGeminiError(providerError(400))).toBe(false);
});
test('Gemini retry schedule uses three total attempts with defined jitter', () => {
    expect(GEMINI_RETRY_BACKOFFS_MS).toEqual([0, 1000, 2000]);
    expect(GEMINI_RETRY_JITTER_MS).toBe(500);
});
