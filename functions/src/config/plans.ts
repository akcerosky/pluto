export type SubscriptionPlan = 'Free' | 'Plus' | 'Pro';
export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'paused' | 'expired';
export type ChatMode = 'Conversational' | 'Homework' | 'ExamPrep';

export interface PlanDefinition {
  id: SubscriptionPlan;
  displayPrice: string;
  amountInr: number;
  dailyLimit: number | null;
  maxInputChars: number;
  allowedModes: ChatMode[];
}

export const IST_TIME_ZONE = 'Asia/Kolkata';
export const PRO_REFUND_DAILY_LIMIT = 100;

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  Free: {
    id: 'Free',
    displayPrice: 'INR 0',
    amountInr: 0,
    dailyLimit: 10,
    maxInputChars: 500,
    allowedModes: ['Conversational'],
  },
  Plus: {
    id: 'Plus',
    displayPrice: 'INR 299/month',
    amountInr: 299,
    dailyLimit: 100,
    maxInputChars: 2000,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
  },
  Pro: {
    id: 'Pro',
    displayPrice: 'INR 599/month',
    amountInr: 599,
    dailyLimit: null,
    maxInputChars: 6000,
    allowedModes: ['Conversational', 'Homework', 'ExamPrep'],
  },
};

export const DEFAULT_PLAN: SubscriptionPlan = 'Free';
