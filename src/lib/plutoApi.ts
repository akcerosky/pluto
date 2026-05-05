import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { runtimeLogger } from './runtimeLogger';
import type { SubscriptionPlan } from '../config/subscription';
import type {
  FlashcardCardDoc,
  FlashcardSetDoc,
  MessagePart,
  QuestionPaperDoc,
  ThreadContextSummary,
} from '../types';
import type { InlineAttachmentInput } from './attachments';

const requireFunctions = () => {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  return functions;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const AI_CHAT_CLIENT_RETRY_DELAYS_MS = [2000, 4000];
const AI_CHAT_ALREADY_EXISTS_RETRY_DELAY_MS = 2000;
const AI_CHAT_TEXT_TIMEOUT_MS = 120_000;
const AI_CHAT_ATTACHMENT_TIMEOUT_MS = 180_000;
const isDevelopmentLogEnabled = import.meta.env.VITE_APP_ENV === 'development';
const RETRYABLE_ERRORS = new Set([
  'functions/already-exists',
  'functions/unavailable',
  'functions/deadline-exceeded',
]);
const RETRYABLE_STATUSES = new Set(['ALREADY_EXISTS', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);
const NON_RETRYABLE = new Set([
  'functions/resource-exhausted',
  'functions/permission-denied',
  'functions/invalid-argument',
]);
const NON_RETRYABLE_STATUSES = new Set(['RESOURCE_EXHAUSTED', 'PERMISSION_DENIED', 'INVALID_ARGUMENT']);

const logAiChatInfo = (...args: unknown[]) => {
  if (isDevelopmentLogEnabled) {
    void args;
  }
};

const logAiChatWarning = (...args: unknown[]) => {
  if (isDevelopmentLogEnabled) {
    runtimeLogger.warn('[Pluto][aiChat]', undefined, { args });
  }
};

const getCallableErrorStatus = (error: unknown) => {
  if (!(typeof error === 'object' && error !== null)) {
    return { code: null as string | null, status: null as string | null };
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : null;
  const details =
    typeof record.details === 'object' && record.details !== null
      ? (record.details as Record<string, unknown>)
      : null;
  const status =
    typeof details?.status === 'string'
      ? details.status
      : typeof record.status === 'string'
        ? record.status
        : null;

  return { code, status };
};

const isRetryableAiChatError = (error: unknown) => {
  const { code, status } = getCallableErrorStatus(error);

  if ((code && NON_RETRYABLE.has(code)) || (status && NON_RETRYABLE_STATUSES.has(status))) {
    return false;
  }

  return Boolean((code && RETRYABLE_ERRORS.has(code)) || (status && RETRYABLE_STATUSES.has(status)));
};

const getAiChatRetryDelayMs = (error: unknown, attempt: number) => {
  const { code, status } = getCallableErrorStatus(error);
  if (code === 'functions/already-exists' || status === 'ALREADY_EXISTS') {
    return AI_CHAT_ALREADY_EXISTS_RETRY_DELAY_MS;
  }
  return AI_CHAT_CLIENT_RETRY_DELAYS_MS[attempt] ?? 0;
};

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    educationLevel: string;
    objective: string;
    avatar?: string;
    plan: SubscriptionPlan;
  };
  subscription: {
    plan: SubscriptionPlan;
    status: 'pending' | 'active' | 'cancelled' | 'paused' | 'expired';
    provider: 'free' | 'razorpay';
    endDate: string | null;
    cancelAtPeriodEnd: boolean;
    updatedAt: string;
  };
  usageTodayTokens: number;
  dailyTokenLimit: number;
  remainingTodayTokens: number;
  estimatedMessagesLeft: number;
  premiumModeCount: number;
  freePremiumModesRemainingToday: number | null;
  planConfig: {
    id: SubscriptionPlan;
    price: string;
    priceInrMonthly: number;
    tagLine: string;
    dailyTokenLimit: number;
    maxInputTokensPerRequest: number;
    maxOutputTokensPerRequest: number;
    averageTokensPerMessage: number;
    maxInputChars: number;
    allowedModes: Array<'Conversational' | 'Homework' | 'ExamPrep'>;
    attachmentsEnabled: boolean;
    allowedAttachmentKinds: Array<'image' | 'pdf'>;
    maxAttachmentBytes: number;
    maxTotalAttachmentPayloadBytes: number;
    learningFeaturesEnabled?: boolean;
  };
}

export const meGet = async (): Promise<MeResponse> => {
  const call = httpsCallable<undefined, MeResponse>(requireFunctions(), 'meGet');
  const result = await call();
  return result.data;
};

export const meUpdateProfile = async (payload: {
  name?: string;
  educationLevel?: string;
  objective?: string;
}): Promise<MeResponse> => {
  const call = httpsCallable<typeof payload, MeResponse>(requireFunctions(), 'meUpdateProfile');
  const result = await call(payload);
  return result.data;
};

export const meUsageHistory = async (): Promise<{
  history: Array<{
    dateKey: string;
    count: number;
    inputTokensUsed: number;
    outputTokensUsed: number;
    totalTokensUsed: number;
    planSnapshot: SubscriptionPlan | null;
  }>;
}> => {
  const call = httpsCallable<undefined, { history: Array<{
    dateKey: string;
    count: number;
    inputTokensUsed: number;
    outputTokensUsed: number;
    totalTokensUsed: number;
    planSnapshot: SubscriptionPlan | null;
  }> }>(
    requireFunctions(),
    'meUsageHistory'
  );
  const result = await call();
  return result.data;
};

export const aiChat = async (payload: {
  prompt: string;
  mode: 'Conversational' | 'Homework' | 'ExamPrep';
  educationLevel: string;
  objective: string;
  history: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
  contextSummary?: ThreadContextSummary;
  summaryCandidates?: Array<{ role: 'user' | 'assistant'; parts: MessagePart[] }>;
  attachments: InlineAttachmentInput[];
  threadId: string;
  assistantMessageId: string;
  requestId: string;
  onRetrying?: (state: { attempt: number; delayMs: number; totalRetries: number }) => void;
}) => {
  const { onRetrying, ...requestPayload } = payload;
  const timeout = requestPayload.attachments.length > 0
    ? AI_CHAT_ATTACHMENT_TIMEOUT_MS
    : AI_CHAT_TEXT_TIMEOUT_MS;
  const call = httpsCallable<typeof requestPayload, {
    answer: string;
    modelUsed: 'flash' | 'nova-micro';
    provider?: 'gemini' | 'nova-micro';
    usagePendingSync: boolean;
    subscription: MeResponse['subscription'];
    usageTodayTokens: number;
    dailyTokenLimit: number;
    remainingTodayTokens: number;
    estimatedMessagesLeft: number;
    premiumModeCount: number;
    freePremiumModesRemainingToday: number | null;
    planConfig: MeResponse['planConfig'];
    assistantMessageId: string;
    assistantTimestamp: number;
    contextSummary?: ThreadContextSummary;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      usageSource: 'provider' | 'estimated';
    };
  }>(requireFunctions(), 'aiChat', { timeout });

  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_CHAT_CLIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (attempt === 0) {
        logAiChatInfo('Sending request', {
          requestId: requestPayload.requestId,
          mode: requestPayload.mode,
          historyCount: requestPayload.history.length,
          summaryCandidateCount: requestPayload.summaryCandidates?.length ?? 0,
          hasContextSummary: Boolean(requestPayload.contextSummary?.text),
          attachmentCount: requestPayload.attachments.length,
          timeout,
        });
      } else {
        logAiChatInfo('Retry attempt started', {
          requestId: requestPayload.requestId,
          attempt,
          totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
        });
      }

      const result = await call(requestPayload);
      if (attempt > 0) {
        logAiChatInfo('Retry succeeded', {
          requestId: requestPayload.requestId,
          attempt,
          totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
        });
      }
      return result.data;
    } catch (error) {
      lastError = error;
      const { code, status } = getCallableErrorStatus(error);
      logAiChatWarning('Request failed', {
        requestId: requestPayload.requestId,
        attempt,
        totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
        code,
        status,
        message: error instanceof Error ? error.message : String(error),
      });

      if (
        !isRetryableAiChatError(error) ||
        attempt >= AI_CHAT_CLIENT_RETRY_DELAYS_MS.length
      ) {
        break;
      }

      const retryDelayMs = getAiChatRetryDelayMs(error, attempt);
      onRetrying?.({
        attempt: attempt + 1,
        delayMs: retryDelayMs,
        totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
      });
      await wait(retryDelayMs);
    }
  }

  runtimeLogger.error('[Pluto][aiChat] Exhausted retries', lastError, {
    requestId: requestPayload.requestId,
    totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
    message: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
};

export const billingCheckout = async (payload: { plan: 'Plus' | 'Pro'; returnUrl: string }) => {
  const call = httpsCallable<typeof payload, {
    provider: 'razorpay';
    key: string;
    subscriptionId: string;
    amountInr: number;
    plan: 'Plus' | 'Pro';
    name: string;
    description: string;
    prefill: { name: string; email: string };
    callbackUrl: string;
  }>(requireFunctions(), 'billingCheckout');
  const result = await call(payload);
  return result.data;
};

export const billingVerifyPayment = async (payload: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}) => {
  const call = httpsCallable<typeof payload, {
    provider: 'razorpay';
    paymentStatus: string;
    subscription: MeResponse['subscription'];
    requiresWebhookSync: boolean;
  }>(requireFunctions(), 'billingVerifyPayment');
  const result = await call(payload);
  return result.data;
};

export const billingHistory = async () => {
  const call = httpsCallable<undefined, { history: Array<Record<string, unknown>> }>(requireFunctions(), 'billingHistory');
  const result = await call();
  return result.data;
};

export const billingRequestRefund = async (payload: { paymentRecordId: string }) => {
  const call = httpsCallable<typeof payload, { ok: boolean }>(requireFunctions(), 'billingRequestRefund');
  const result = await call(payload);
  return result.data;
};

export const billingSubscriptionGet = async () => {
  const call = httpsCallable<undefined, {
    subscription: MeResponse['subscription'];
    usageTodayTokens: number;
    dailyTokenLimit: number;
    remainingTodayTokens: number;
    estimatedMessagesLeft: number;
    premiumModeCount: number;
    freePremiumModesRemainingToday: number | null;
  }>(requireFunctions(), 'billingSubscriptionGet');
  const result = await call();
  return result.data;
};

export const deleteThread = async (payload: { threadId: string }) => {
  const call = httpsCallable<typeof payload, { ok: true; threadId: string }>(
    requireFunctions(),
    'deleteThread'
  );
  const result = await call(payload);
  return result.data;
};

export const billingSubscriptionCancel = async () => {
  const call = httpsCallable<undefined, { subscription: MeResponse['subscription'] }>(
    requireFunctions(),
    'billingSubscriptionCancel'
  );
  const result = await call();
  return result.data;
};

export const billingSubscriptionResume = async () => {
  const call = httpsCallable<undefined, { subscription: MeResponse['subscription'] }>(
    requireFunctions(),
    'billingSubscriptionResume'
  );
  const result = await call();
  return result.data;
};

export const generateQuestionPaper = async (payload: {
  subject: string;
  educationLevel: string;
  examBoard: string;
  topic?: string;
}) => {
  const call = httpsCallable<typeof payload, { paperId: string }>(requireFunctions(), 'generateQuestionPaper');
  const result = await call(payload);
  return result.data;
};

export const getQuestionPapers = async () => {
  const call = httpsCallable<undefined, { papers: QuestionPaperDoc[]; grouped: Record<string, QuestionPaperDoc[]> }>(
    requireFunctions(),
    'getQuestionPapers'
  );
  const result = await call();
  return result.data;
};

export const deleteQuestionPaper = async (payload: { paperId: string }) => {
  const call = httpsCallable<typeof payload, { ok: boolean }>(requireFunctions(), 'deleteQuestionPaper');
  const result = await call(payload);
  return result.data;
};

export const generateQuestionPaperPdf = async (payload: { paperId: string }) => {
  const call = httpsCallable<typeof payload, { base64Pdf: string; filename: string }>(
    requireFunctions(),
    'generateQuestionPaperPdf'
  );
  const result = await call(payload);
  return result.data;
};

export const generateFlashcardSet = async (payload: {
  topic: string;
  subject?: string;
  educationLevel?: string;
}) => {
  const call = httpsCallable<typeof payload, { setId: string }>(requireFunctions(), 'generateFlashcardSet');
  const result = await call(payload);
  return result.data;
};

export const getFlashcardSets = async () => {
  const call = httpsCallable<undefined, { sets: FlashcardSetDoc[]; dueCount: number }>(
    requireFunctions(),
    'getFlashcardSets'
  );
  const result = await call();
  return result.data;
};

export const getFlashcardCards = async (payload: { setId: string }) => {
  const call = httpsCallable<typeof payload, { cards: FlashcardCardDoc[] }>(requireFunctions(), 'getFlashcardCards');
  const result = await call(payload);
  return result.data;
};

export const getDueCards = async (payload?: { setId?: string }) => {
  const call = httpsCallable<typeof payload, { cards: FlashcardCardDoc[]; session?: { setId?: string; date: string } }>(
    requireFunctions(),
    'getDueCards'
  );
  const result = await call(payload);
  return result.data;
};

export const submitCardReview = async (payload: {
  setId: string;
  cardId: string;
  rating: 'easy' | 'good' | 'hard';
  sessionId: string;
}) => {
  const call = httpsCallable<
    typeof payload,
    { card: FlashcardCardDoc; stats: FlashcardSetDoc['stats'] }
  >(requireFunctions(), 'submitCardReview');
  const result = await call(payload);
  return result.data;
};

export const deleteFlashcardSet = async (payload: { setId: string }) => {
  const call = httpsCallable<typeof payload, { ok: boolean }>(requireFunctions(), 'deleteFlashcardSet');
  const result = await call(payload);
  return result.data;
};

export const generatePaperFromPdfs = async (payload: {
  pdfAttachments: Array<{
    name: string;
    mimeType: 'application/pdf';
    sizeBytes: number;
    base64Data: string;
  }>;
  educationLevel: string;
  examBoard: string;
  subject?: string;
}) => {
  const call = httpsCallable<typeof payload, { paperId: string }>(requireFunctions(), 'generatePaperFromPdfs');
  const result = await call(payload);
  return result.data;
};
