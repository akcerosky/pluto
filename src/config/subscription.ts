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
    price: '₹0',
    priceInrMonthly: 0,
    tagLine: 'Great for daily learning bursts',
    dailyMessageLimit: 15,
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
      '15 AI requests per day',
      'Conversational mode',
      'Up to 2 projects',
      '500 characters per prompt',
    ],
  },
  Plus: {
    id: 'Plus',
    price: '₹499/mo',
    priceInrMonthly: 499,
    tagLine: 'For serious students and regular practice',
    dailyMessageLimit: 200,
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
      '200 AI requests per day',
      'Conversational + Homework + Exam Prep',
      'Up to 12 projects',
      '2,000 characters per prompt',
    ],
  },
  Pro: {
    id: 'Pro',
    price: '₹1,499/mo',
    priceInrMonthly: 1499,
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
