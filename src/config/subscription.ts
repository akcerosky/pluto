export type SubscriptionPlan = 'Free' | 'Plus' | 'Pro';
export type PlanFeatureKey =
  | 'homeworkMode'
  | 'examPrepMode'
  | 'projects'
  | 'prioritySupport'
  | 'extendedContext';

export type AttachmentKind = 'image' | 'pdf';

export interface PlanConfig {
  id: SubscriptionPlan;
  price: string;
  priceInrMonthly: number;
  tagLine: string;
  dailyTokenLimit: number;
  maxInputTokensPerRequest: number;
  maxOutputTokensPerRequest: number;
  averageTokensPerMessage: number;
  maxInputChars: number;
  maxProjects: number | null;
  historyWindow: number;
  allowedModes: Array<'Conversational' | 'Homework' | 'ExamPrep'>;
  attachmentsEnabled: boolean;
  allowedAttachmentKinds: AttachmentKind[];
  maxAttachmentBytes: number;
  maxTotalAttachmentPayloadBytes: number;
  features: Record<PlanFeatureKey, boolean>;
  bullets: string[];
}

export const FREE_PREMIUM_MODE_DAILY_LIMIT = 3;
export const INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  Free: {
    id: 'Free',
    price: 'INR 0',
    priceInrMonthly: 0,
    tagLine: 'Great for daily learning bursts',
    dailyTokenLimit: 25_000,
    maxInputTokensPerRequest: 1_000,
    maxOutputTokensPerRequest: 1_500,
    averageTokensPerMessage: 2_000,
    maxInputChars: 500,
    maxProjects: 2,
    historyWindow: 16,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    attachmentsEnabled: false,
    allowedAttachmentKinds: [],
    maxAttachmentBytes: 0,
    maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    features: {
      homeworkMode: false,
      examPrepMode: false,
      projects: true,
      prioritySupport: false,
      extendedContext: false,
    },
    bullets: [
      '25,000 tokens per day',
      'Conversational mode + 3 Homework / Exam Prep uses per day',
      'Up to 2 projects',
      '1,000 input / 1,500 output tokens per request',
      '500 characters per prompt',
    ],
  },
  Plus: {
    id: 'Plus',
    price: 'INR 299/mo',
    priceInrMonthly: 299,
    tagLine: 'For serious students and regular practice',
    dailyTokenLimit: 250_000,
    maxInputTokensPerRequest: 4_000,
    maxOutputTokensPerRequest: 4_000,
    averageTokensPerMessage: 4_000,
    maxInputChars: 2000,
    maxProjects: 12,
    historyWindow: 16,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    attachmentsEnabled: true,
    allowedAttachmentKinds: ['image'],
    maxAttachmentBytes: 5 * 1024 * 1024,
    maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    features: {
      homeworkMode: true,
      examPrepMode: true,
      projects: true,
      prioritySupport: true,
      extendedContext: true,
    },
    bullets: [
      '250,000 tokens per day',
      'Conversational + Homework + Exam Prep',
      'Up to 12 projects',
      '4,000 input / 4,000 output tokens per request',
      '2,000 characters per prompt',
    ],
  },
  Pro: {
    id: 'Pro',
    price: 'INR 599/mo',
    priceInrMonthly: 599,
    tagLine: 'Power tier for heavy daily usage',
    dailyTokenLimit: 1_000_000,
    maxInputTokensPerRequest: 8_000,
    maxOutputTokensPerRequest: 8_000,
    averageTokensPerMessage: 6_000,
    maxInputChars: 6000,
    maxProjects: null,
    historyWindow: 16,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    attachmentsEnabled: true,
    allowedAttachmentKinds: ['image', 'pdf'],
    maxAttachmentBytes: 20 * 1024 * 1024,
    maxTotalAttachmentPayloadBytes: INLINE_ATTACHMENT_PAYLOAD_LIMIT_BYTES,
    features: {
      homeworkMode: true,
      examPrepMode: true,
      projects: true,
      prioritySupport: true,
      extendedContext: true,
    },
    bullets: [
      '1,000,000 tokens per day',
      'All learning modes',
      'Unlimited projects',
      '8,000 input / 8,000 output tokens per request',
      '6,000 characters per prompt',
    ],
  },
};

export const DEFAULT_PLAN: SubscriptionPlan = 'Free';
