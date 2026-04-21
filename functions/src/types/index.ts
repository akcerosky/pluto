import type { SubscriptionPlan, SubscriptionStatus, ChatMode } from '../config/plans.js';

export interface ProfileDoc {
  name: string;
  educationLevel: string;
  objective: string;
  email: string;
  avatar?: string;
  updatedAt: string;
}

export interface SubscriptionPublicDoc {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: 'razorpay' | 'free';
  endDate: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

export interface SubscriptionPrivateDoc {
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  refundRequested: boolean;
  refundCompleted: boolean;
  updatedAt: string;
}

export interface UsageDailyDoc {
  count: number;
  premiumModeCount: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  totalTokensUsed: number;
  reservedTokens: number;
  planSnapshot: SubscriptionPlan;
  lastMessageAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  provider: 'razorpay';
  plan: SubscriptionPlan;
  status: 'pending' | 'captured' | 'failed' | 'refunded';
  amountInr: number;
  createdAt: string;
  updatedAt: string;
  paymentId?: string | null;
  subscriptionId?: string | null;
  refundRequested?: boolean;
  refundCompleted?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UserBootstrapIdentity {
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
}

export interface AiTextPart {
  type: 'text';
  text: string;
}

export interface AiImagePart {
  type: 'image';
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AiFilePart {
  type: 'file';
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type AiMessagePart = AiTextPart | AiImagePart | AiFilePart;

export interface AiHistoryMessage {
  role: 'user' | 'assistant';
  parts: AiMessagePart[];
}

export interface ThreadContextSummary {
  version: 1;
  text: string;
  summarizedMessageCount: number;
  summarizedExchangeCount: number;
  blockSize: number;
  updatedAt: number;
}

export interface AiInlineAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
}

export interface AiChatPayload {
  prompt: string;
  mode: ChatMode;
  educationLevel: string;
  objective: string;
  history: AiHistoryMessage[];
  contextSummary?: ThreadContextSummary;
  summaryCandidates?: AiHistoryMessage[];
  attachments: AiInlineAttachment[];
  requestId: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usageSource: 'provider' | 'estimated';
}
