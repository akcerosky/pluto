import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { SubscriptionPlan } from '../config/subscription';
import type { MessagePart } from '../types';
import type { InlineAttachmentInput } from './attachments';

const requireFunctions = () => {
  if (!functions) {
    throw new Error('Firebase Functions is not configured.');
  }
  return functions;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const AI_CHAT_CLIENT_RETRY_DELAYS_MS = [1800, 4200];

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
  return (
    code === 'functions/unavailable' ||
    code === 'functions/resource-exhausted' ||
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED'
  );
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
  attachments: InlineAttachmentInput[];
  requestId: string;
  onRetrying?: (state: { attempt: number; delayMs: number; totalRetries: number }) => void;
}) => {
  const { onRetrying, ...requestPayload } = payload;
  const call = httpsCallable<typeof requestPayload, {
    answer: string;
    usagePendingSync: boolean;
    subscription: MeResponse['subscription'];
    usageTodayTokens: number;
    dailyTokenLimit: number;
    remainingTodayTokens: number;
    estimatedMessagesLeft: number;
    premiumModeCount: number;
    freePremiumModesRemainingToday: number | null;
    planConfig: MeResponse['planConfig'];
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      usageSource: 'provider' | 'estimated';
    };
  }>(requireFunctions(), 'aiChat');

  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_CHAT_CLIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (attempt === 0) {
        console.info('[Pluto][aiChat] Sending request', {
          requestId: requestPayload.requestId,
          mode: requestPayload.mode,
          historyCount: requestPayload.history.length,
          attachmentCount: requestPayload.attachments.length,
        });
      } else {
        console.info('[Pluto][aiChat] Retry attempt started', {
          requestId: requestPayload.requestId,
          attempt,
          totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
        });
      }

      const result = await call(requestPayload);
      if (attempt > 0) {
        console.info('[Pluto][aiChat] Retry succeeded', {
          requestId: requestPayload.requestId,
          attempt,
          totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
        });
      }
      return result.data;
    } catch (error) {
      lastError = error;
      const { code, status } = getCallableErrorStatus(error);
      console.warn('[Pluto][aiChat] Request failed', {
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

      const retryDelayMs = AI_CHAT_CLIENT_RETRY_DELAYS_MS[attempt] ?? 0;
      onRetrying?.({
        attempt: attempt + 1,
        delayMs: retryDelayMs,
        totalRetries: AI_CHAT_CLIENT_RETRY_DELAYS_MS.length,
      });
      await wait(retryDelayMs);
    }
  }

  console.error('[Pluto][aiChat] Exhausted retries', {
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
