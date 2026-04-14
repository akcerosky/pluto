import type { SubscriptionPlan } from './subscription';

export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, 'Free'>;

export const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-south1';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';
