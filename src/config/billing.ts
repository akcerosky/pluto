import type { SubscriptionPlan } from './subscription';

export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, 'Free'>;

export const BILLING_API_BASE_URL =
  import.meta.env.VITE_BILLING_API_BASE_URL || '/api';

export const BILLING_ENDPOINTS = {
  createPhonePeSubscription: `${BILLING_API_BASE_URL}/billing/phonepe/subscription/create`,
  verifyPhonePePayment: `${BILLING_API_BASE_URL}/billing/phonepe/subscription/verify`,
};

export const PHONEPE_RETURN_PARAM = 'phonepe_return';

