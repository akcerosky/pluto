export type SubscriptionPlan = 'Free' | 'Plus' | 'Pro';
export type PlanFeatureKey =
  | 'homeworkMode'
  | 'examPrepMode'
  | 'projects'
  | 'prioritySupport'
  | 'extendedContext';

export interface PlanConfig {
  id: SubscriptionPlan;
  price: string;
  priceInrMonthly: number;
  tagLine: string;
  dailyMessageLimit: number | null;
  maxInputChars: number;
  maxProjects: number | null;
  historyWindow: number;
  allowedModes: Array<'Conversational' | 'Homework' | 'ExamPrep'>;
  features: Record<PlanFeatureKey, boolean>;
  bullets: string[];
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  Free: {
    id: 'Free',
    price: 'INR 0',
    priceInrMonthly: 0,
    tagLine: 'Great for daily learning bursts',
    dailyMessageLimit: 10,
    maxInputChars: 500,
    maxProjects: 2,
    historyWindow: 8,
    allowedModes: ['Conversational'],
    features: {
      homeworkMode: false,
      examPrepMode: false,
      projects: true,
      prioritySupport: false,
      extendedContext: false,
    },
    bullets: [
      '10 AI requests per day',
      'Conversational mode',
      'Up to 2 projects',
      '500 characters per prompt',
    ],
  },
  Plus: {
    id: 'Plus',
    price: 'INR 299/mo',
    priceInrMonthly: 299,
    tagLine: 'For serious students and regular practice',
    dailyMessageLimit: 100,
    maxInputChars: 2000,
    maxProjects: 12,
    historyWindow: 24,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    features: {
      homeworkMode: true,
      examPrepMode: true,
      projects: true,
      prioritySupport: true,
      extendedContext: true,
    },
    bullets: [
      '100 AI requests per day',
      'Conversational + Homework + Exam Prep',
      'Up to 12 projects',
      '2,000 characters per prompt',
    ],
  },
  Pro: {
    id: 'Pro',
    price: 'INR 599/mo',
    priceInrMonthly: 599,
    tagLine: 'Power tier for heavy daily usage',
    dailyMessageLimit: null,
    maxInputChars: 6000,
    maxProjects: null,
    historyWindow: 80,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
    features: {
      homeworkMode: true,
      examPrepMode: true,
      projects: true,
      prioritySupport: true,
      extendedContext: true,
    },
    bullets: [
      'Unlimited daily AI requests',
      'All learning modes',
      'Unlimited projects',
      '6,000 characters per prompt',
    ],
  },
};

export const DEFAULT_PLAN: SubscriptionPlan = 'Free';
