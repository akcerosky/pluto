import { logger } from 'firebase-functions';
import { geminiProvider } from './providers/geminiProvider.js';
import { novaMicroProvider, isRetryableNovaError } from './providers/novaMicroProvider.js';
import { novaLiteProvider, isRetryableNovaLiteError } from './providers/novaLiteProvider.js';
import { enforceHomeworkResponsePolicy } from './prompting.js';
import { selectPrimaryProvider } from './router.js';
import type {
  AiProvider,
  AttemptExecutionResult,
  OrchestrationResult,
  ProviderExecutor,
  ProviderRequest,
} from './providerTypes.js';

export const NOVA_MAX_ATTEMPTS = 3;
export const NOVA_ATTEMPT_TIMEOUT_MS = 12_000;
export const NOVA_RETRY_BACKOFFS_MS = [0, 1_000, 2_000] as const;
export const TOTAL_REQUEST_TIMEOUT_MS = 45_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Provider attempt timed out after ${timeoutMs}ms.`);
      Object.assign(error, { code: 'ATTEMPT_TIMEOUT' });
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const isRetryableFailure = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return false;
  }

  const record = error as Record<string, unknown>;
  return (
    record.code === 'ATTEMPT_TIMEOUT' ||
    isRetryableNovaError(error) ||
    isRetryableNovaLiteError(error)
  );
};

const getAttemptTimeoutMs = ({
  primaryProvider,
  totalStartedAt,
  totalTimeoutMs,
}: {
  primaryProvider: AiProvider;
  totalStartedAt: number;
  totalTimeoutMs: number;
}) => {
  const remainingMs = Math.max(totalTimeoutMs - (Date.now() - totalStartedAt), 0);
  if (remainingMs <= 0) {
    const error = new Error(`Total AI request timeout of ${totalTimeoutMs}ms exceeded.`);
    Object.assign(error, { code: 'TOTAL_TIMEOUT' });
    throw error;
  }

  return primaryProvider === 'nova-micro'
    ? Math.min(NOVA_ATTEMPT_TIMEOUT_MS, remainingMs)
    : remainingMs;
};

const logAttemptStarted = ({
  requestId,
  provider,
  modelId,
  modelUsed,
  attemptNumber,
  fallbackTriggered,
}: {
  requestId?: string;
  provider: AiProvider;
  modelId: string | null;
  modelUsed: string | null;
  attemptNumber: number;
  fallbackTriggered: boolean;
}) => {
  logger.info('ai_attempt_started', {
    eventType: 'ai_attempt_started',
    requestId: requestId ?? null,
    attemptNumber,
    provider,
    modelId,
    modelUsed: modelUsed ?? null,
    fallbackTriggered,
  });
};

const logAttemptFinished = ({
  requestId,
  provider,
  modelId,
  modelUsed,
  attemptNumber,
  outcome,
  retryEligible,
  fallbackTriggered,
  latencyMs,
  usage,
  errorMessage,
  providerStatus,
}: {
  requestId?: string;
  provider: AiProvider;
  modelId: string | null;
  modelUsed: string | null;
  attemptNumber: number;
  outcome: 'success' | 'failure';
  retryEligible: boolean;
  fallbackTriggered: boolean;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  errorMessage?: string;
  providerStatus?: number | null;
}) => {
  logger.info('ai_attempt_finished', {
    eventType: 'ai_attempt_finished',
    requestId: requestId ?? null,
    attemptNumber,
    provider,
    modelId,
    modelUsed: modelUsed ?? null,
    outcome,
    retryEligible,
    fallbackTriggered,
    latencyMs,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    providerStatus: providerStatus ?? null,
    errorMessage: errorMessage ?? null,
  });
};

const getProviderStatus = (error: unknown) =>
  typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number'
    ? Number((error as { status: number }).status)
    : null;

const getErrorModelMetadata = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return {
      modelId: null as string | null,
      modelUsed: null as string | null,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    modelId: typeof record.modelId === 'string' ? record.modelId : null,
    modelUsed: typeof record.modelUsed === 'string' ? record.modelUsed : null,
  };
};

const executeAttempt = async ({
  provider,
  request,
  attemptNumber,
  primaryProvider,
  fallbackTriggered,
  totalStartedAt,
}: {
  provider: ProviderExecutor;
  request: ProviderRequest;
  attemptNumber: number;
  primaryProvider: AiProvider;
  fallbackTriggered: boolean;
  totalStartedAt: number;
}): Promise<AttemptExecutionResult> => {
  logAttemptStarted({
    requestId: request.requestId,
    provider: provider.provider,
    modelId: provider.configuredModelId,
    modelUsed: provider.configuredModelUsed,
    attemptNumber,
    fallbackTriggered,
  });
  const startedAt = Date.now();

  try {
    const result = await withTimeout(
      provider.execute(request),
      getAttemptTimeoutMs({
        primaryProvider,
        totalStartedAt,
        totalTimeoutMs: request.totalTimeoutMs ?? TOTAL_REQUEST_TIMEOUT_MS,
      })
    );
    logAttemptFinished({
      requestId: request.requestId,
      provider: result.provider,
      modelId: result.modelId,
      modelUsed: result.modelUsed,
      attemptNumber,
      outcome: 'success',
      retryEligible: false,
      fallbackTriggered,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });
    return {
      ...result,
      attemptNumber,
    };
  } catch (error) {
    const errorModelMetadata = getErrorModelMetadata(error);
    logAttemptFinished({
      requestId: request.requestId,
      provider: provider.provider,
      modelId: errorModelMetadata.modelId ?? provider.configuredModelId,
      modelUsed: errorModelMetadata.modelUsed ?? provider.configuredModelUsed,
      attemptNumber,
      outcome: 'failure',
      retryEligible:
        (provider.provider === 'nova-micro' || provider.provider === 'nova-lite') &&
        isRetryableFailure(error),
      fallbackTriggered,
      latencyMs: Date.now() - startedAt,
      usage: null,
      providerStatus: getProviderStatus(error),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (typeof error === 'object' && error !== null) {
      Object.assign(error as Record<string, unknown>, {
        provider: provider.provider,
        modelId: provider.configuredModelId,
        modelUsed: provider.configuredModelUsed,
        attemptNumber,
        retryEligible:
          (provider.provider === 'nova-micro' || provider.provider === 'nova-lite') &&
          isRetryableFailure(error),
      });
    }
    throw error;
  }
};

export const executeHybridAiRequest = async (request: ProviderRequest): Promise<OrchestrationResult> => {
  const totalStartedAt = Date.now();
  const primaryProvider = selectPrimaryProvider(request.attachments);
  logger.info('ai_route_selected', {
    eventType: 'ai_route_selected',
    requestId: request.requestId ?? null,
    primaryProvider,
    attachmentCount: request.attachments.length,
  });

  let finalResult: AttemptExecutionResult;
  let finalProvider: AiProvider = primaryProvider;
  let fallbackTriggered = false;
  let retryCount = 0;

  if (primaryProvider !== 'gemini') {
    const primaryExecutor = primaryProvider === 'nova-lite' ? novaLiteProvider : novaMicroProvider;
    let lastError: unknown;

    for (let attempt = 1; attempt <= NOVA_MAX_ATTEMPTS; attempt += 1) {
      try {
        finalResult = await executeAttempt({
          provider: primaryExecutor,
          request,
          attemptNumber: attempt,
          primaryProvider,
          fallbackTriggered: false,
          totalStartedAt,
        });
        retryCount = attempt - 1;
        logger.info('ai_request_completed', {
          eventType: 'ai_request_completed',
          requestId: request.requestId ?? null,
          primaryProvider,
          finalProvider: finalResult.provider,
          finalModelId: finalResult.modelId,
          modelUsed: finalResult.modelUsed,
          fallbackTriggered: false,
          totalRetryCount: retryCount,
          totalLatencyMs: Date.now() - totalStartedAt,
        });
        const guardedText = enforceHomeworkResponsePolicy({
          mode: request.mode,
          prompt: request.prompt,
          history: request.history,
          answer: finalResult.text,
        });
        return {
          ...finalResult,
          text: guardedText,
          primaryProvider,
          finalProvider: finalResult.provider,
          fallbackTriggered: false,
          retryCount,
          totalLatencyMs: Date.now() - totalStartedAt,
        };
      } catch (error) {
        lastError = error;
        const retryEligible = isRetryableFailure(error);
        if (!retryEligible || attempt >= NOVA_MAX_ATTEMPTS) {
          break;
        }
        retryCount = attempt;
        await wait(NOVA_RETRY_BACKOFFS_MS[attempt] ?? 0);
      }
    }

    fallbackTriggered = true;
    finalProvider = 'gemini';
    logger.warn(primaryProvider === 'nova-lite' ? 'gemini_fallback_triggered_from_nova_lite' : 'ai_fallback_triggered', {
      eventType: 'ai_fallback_triggered',
      requestId: request.requestId ?? null,
      primaryProvider,
      finalProvider,
      fallbackTriggered,
      retryCount: NOVA_MAX_ATTEMPTS,
      errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
    });
    finalResult = await executeAttempt({
      provider: geminiProvider,
      request,
      attemptNumber: NOVA_MAX_ATTEMPTS + 1,
      primaryProvider,
      fallbackTriggered: true,
      totalStartedAt,
    });
    retryCount = NOVA_MAX_ATTEMPTS;
  } else {
    finalResult = await executeAttempt({
      provider: geminiProvider,
      request,
      attemptNumber: 1,
      primaryProvider,
      fallbackTriggered: false,
      totalStartedAt,
    });
  }

  logger.info('ai_request_completed', {
    eventType: 'ai_request_completed',
    requestId: request.requestId ?? null,
    primaryProvider,
    finalProvider,
    finalModelId: finalResult.modelId,
    modelUsed: finalResult.modelUsed,
    fallbackTriggered,
    totalRetryCount: retryCount,
    totalLatencyMs: Date.now() - totalStartedAt,
  });

  const guardedText = enforceHomeworkResponsePolicy({
    mode: request.mode,
    prompt: request.prompt,
    history: request.history,
    answer: finalResult.text,
  });

  return {
    ...finalResult,
    text: guardedText,
    primaryProvider,
    finalProvider,
    fallbackTriggered,
    retryCount,
    totalLatencyMs: Date.now() - totalStartedAt,
  };
};
