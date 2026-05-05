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
  threadId: string;
  assistantMessageId: string;
  requestId: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usageSource: 'provider' | 'estimated';
}

export interface QuestionPaperFormatSection {
  name: string;
  instructions: string;
  questionType: string;
  questions: number;
  marksPerQuestion: number;
}

export interface QuestionPaperQuestion {
  id: string;
  sectionName: string;
  questionNumber: number;
  text: string;
  type: 'mcq' | 'short_answer' | 'long_answer' | 'fill_blank' | 'assertion_reason';
  marks: number;
  options?: string[];
  subParts?: string[];
}

export interface QuestionPaperDoc {
  id: string;
  title: string;
  subject: string;
  educationLevel: string;
  examBoard: string;
  topic?: string;
  sourceType: 'topic' | 'pdf';
  sourcePdfNames?: string[];
  sourcePdfTextLength?: number;
  format: {
    totalMarks: number;
    duration: string;
    sections: QuestionPaperFormatSection[];
  };
  questions: QuestionPaperQuestion[];
  generatedAt: string;
  status: 'generating' | 'ready' | 'failed';
  pdfUrl?: string;
  webSearchSources?: string[];
  failureMessage?: string;
}

export interface FlashcardSetStats {
  mastered: number;
  reviewing: number;
  learning: number;
  new: number;
  dueToday: number;
}

export interface FlashcardSetDoc {
  id: string;
  title: string;
  subject: string;
  topic: string;
  educationLevel?: string;
  totalCards: number;
  createdAt: string;
  lastReviewedAt?: string;
  stats: FlashcardSetStats;
}

export interface FlashcardCardDoc {
  id: string;
  front: string;
  back: string;
  concept: string;
  order: number;
  interval: number;
  easinessFactor: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt?: string;
  lastRating?: 'easy' | 'good' | 'hard';
  masteryLevel: 'new' | 'learning' | 'reviewing' | 'mastered';
  timesReviewed: number;
  timesCorrect: number;
}

export interface FlashcardSessionDoc {
  id: string;
  setId: string;
  date: string;
  cardsReviewed: number;
  ratings: { easy: number; good: number; hard: number };
  durationSeconds: number;
  completedAt: string;
}
