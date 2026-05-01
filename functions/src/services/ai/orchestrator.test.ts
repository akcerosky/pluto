jest.mock('./providers/geminiProvider.js', () => ({
  geminiProvider: {
    provider: 'gemini',
    configuredModelId: 'gemini-2.5-flash',
    configuredModelUsed: 'gemini-2.5-flash',
    execute: jest.fn(),
  },
}));

jest.mock('./providers/novaMicroProvider.js', () => ({
  novaMicroProvider: {
    provider: 'nova-micro',
    configuredModelId: 'amazon.nova-micro-v1:0',
    configuredModelUsed: 'nova-micro',
    execute: jest.fn(),
  },
  isRetryableNovaError: jest.fn(),
}));

jest.mock('firebase-functions', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from 'firebase-functions';
import { executeHybridAiRequest, NOVA_MAX_ATTEMPTS } from './orchestrator.js';
import { geminiProvider } from './providers/geminiProvider.js';
import { isRetryableNovaError, novaMicroProvider } from './providers/novaMicroProvider.js';

const geminiExecute = geminiProvider.execute as jest.Mock;
const novaExecute = novaMicroProvider.execute as jest.Mock;
const isRetryableNovaErrorMock = isRetryableNovaError as jest.Mock;
const loggerWarn = (logger.warn ?? jest.fn()) as jest.Mock;
const loggerInfo = (logger.info ?? jest.fn()) as jest.Mock;

const baseRequest = {
  prompt: 'Explain inertia',
  educationLevel: 'High School',
  mode: 'Conversational',
  objective: 'Physics',
  plan: 'Free' as const,
  uid: 'user-1',
  requestId: 'request-12345',
  history: [],
  contextSummary: undefined,
  summaryCandidates: [],
  attachments: [],
  maxOutputTokens: 500,
};

const successResult = (provider: 'gemini' | 'nova-micro', modelId: string, modelUsed: string) => ({
  text: 'Answer',
  contextSummary: undefined,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    usageSource: 'provider' as const,
  },
  usageAnomaly: null,
  provider,
  modelId,
  modelUsed,
  latencyMs: 25,
});

beforeEach(() => {
  geminiExecute.mockReset();
  novaExecute.mockReset();
  isRetryableNovaErrorMock.mockReset();
  loggerWarn.mockReset();
  loggerInfo.mockReset();
});

test('text request uses nova with no fallback on first-attempt success', async () => {
  novaExecute.mockResolvedValueOnce(successResult('nova-micro', 'amazon.nova-micro-v1:0', 'nova-micro'));

  const result = await executeHybridAiRequest(baseRequest);

  expect(novaExecute).toHaveBeenCalledTimes(1);
  expect(geminiExecute).not.toHaveBeenCalled();
  expect(result.primaryProvider).toBe('nova-micro');
  expect(result.finalProvider).toBe('nova-micro');
  expect(result.fallbackTriggered).toBe(false);
  expect(result.retryCount).toBe(0);
});

test('text request falls back to gemini only after three nova failures', async () => {
  const failure = { status: 503, message: 'temporary outage' };
  novaExecute
    .mockRejectedValueOnce(failure)
    .mockRejectedValueOnce(failure)
    .mockRejectedValueOnce(failure);
  isRetryableNovaErrorMock.mockReturnValue(true);
  geminiExecute.mockResolvedValueOnce(
    successResult('gemini', 'gemini-2.5-flash', 'gemini-2.5-flash')
  );

  const result = await executeHybridAiRequest(baseRequest);

  expect(novaExecute).toHaveBeenCalledTimes(NOVA_MAX_ATTEMPTS);
  expect(geminiExecute).toHaveBeenCalledTimes(1);
  expect(geminiExecute).toHaveBeenCalledWith(baseRequest);
  expect(result.primaryProvider).toBe('nova-micro');
  expect(result.finalProvider).toBe('gemini');
  expect(result.fallbackTriggered).toBe(true);
  expect(result.retryCount).toBe(3);
  expect(loggerWarn).toHaveBeenCalledWith(
    'ai_fallback_triggered',
    expect.objectContaining({
      eventType: 'ai_fallback_triggered',
      requestId: baseRequest.requestId,
    })
  );
});

test('attachment request uses gemini only', async () => {
  geminiExecute.mockResolvedValueOnce(
    successResult('gemini', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite')
  );

  const result = await executeHybridAiRequest({
    ...baseRequest,
    attachments: [
      {
        name: 'diagram.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        base64Data: 'QQ==',
      },
    ],
  });

  expect(geminiExecute).toHaveBeenCalledTimes(1);
  expect(novaExecute).not.toHaveBeenCalled();
  expect(result.primaryProvider).toBe('gemini');
  expect(result.finalProvider).toBe('gemini');
  expect(result.fallbackTriggered).toBe(false);
  expect(result.modelUsed).toBe('gemini-2.5-flash-lite');
});

test('non-retryable nova failure does not exceed retry cap before gemini fallback', async () => {
  const failure = { status: 400, message: 'bad request' };
  novaExecute.mockRejectedValueOnce(failure);
  isRetryableNovaErrorMock.mockReturnValue(false);
  geminiExecute.mockResolvedValueOnce(
    successResult('gemini', 'gemini-2.5-flash', 'gemini-2.5-flash')
  );

  const result = await executeHybridAiRequest(baseRequest);

  expect(novaExecute).toHaveBeenCalledTimes(1);
  expect(geminiExecute).toHaveBeenCalledTimes(1);
  expect(result.finalProvider).toBe('gemini');
  expect(result.fallbackTriggered).toBe(true);
});

test('completion logs include modelUsed and failure errors carry model metadata', async () => {
  const failure = { status: 503, message: 'temporary outage' };
  novaExecute.mockRejectedValueOnce(failure);
  isRetryableNovaErrorMock.mockReturnValue(true);
  geminiExecute.mockResolvedValueOnce(
    successResult('gemini', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite')
  );

  const result = await executeHybridAiRequest(baseRequest);

  expect(result.modelUsed).toBe('gemini-2.5-flash-lite');
  expect(loggerInfo).toHaveBeenCalledWith(
    'ai_request_completed',
    expect.objectContaining({
      eventType: 'ai_request_completed',
      requestId: baseRequest.requestId,
      modelUsed: 'gemini-2.5-flash-lite',
      finalModelId: 'gemini-2.5-flash-lite',
    })
  );
  expect(failure).toMatchObject({
    provider: 'nova-micro',
    modelId: 'amazon.nova-micro-v1:0',
    modelUsed: 'nova-micro',
    attemptNumber: 1,
    retryEligible: true,
  });
});

test('homework mode guards complete solutions with a generic redirect', async () => {
  geminiExecute.mockResolvedValueOnce({
    ...successResult('gemini', 'gemini-2.5-flash', 'gemini-2.5-flash'),
    text: `Complete Solution:
1. Identify the parts
2. Work them out
3. Final answer`,
  });

  const result = await executeHybridAiRequest({
    ...baseRequest,
    mode: 'Homework',
    prompt: 'help me solve this',
    attachments: [
      {
        name: 'question.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        base64Data: 'QQ==',
      },
    ],
    history: [],
  });

  expect(result.text).toBe(
    "Let's work through this together step by step. What do you know about this problem so far? Try starting with the first part."
  );
});
