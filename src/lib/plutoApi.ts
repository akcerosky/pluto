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
}) => {
  const call = httpsCallable<typeof payload, {
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
  const result = await call(payload);
  return result.data;
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
