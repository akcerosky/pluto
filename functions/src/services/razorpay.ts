import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { getRazorpayPlanId, requireEnv } from '../config/env.js';
import type { SubscriptionPlan } from '../config/plans.js';

const getRazorpayClient = () =>
  new Razorpay({
    key_id: requireEnv('razorpayKeyId'),
    key_secret: requireEnv('razorpayKeySecret'),
  });

export const createRazorpaySubscription = async (payload: {
  plan: Extract<SubscriptionPlan, 'Plus' | 'Pro'>;
  customerEmail: string;
  customerName: string;
  notes: Record<string, string>;
}) => {
  return getRazorpayClient().subscriptions.create({
    plan_id: getRazorpayPlanId(payload.plan),
    customer_notify: 1,
    total_count: 12,
    notes: payload.notes,
  });
};

export const verifyRazorpayWebhookSignature = (body: string, signature: string | undefined) => {
  if (!signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', requireEnv('razorpayWebhookSecret'))
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

export const verifyCheckoutSignature = (payload: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}) => {
  const generated = crypto
    .createHmac('sha256', requireEnv('razorpayKeySecret'))
    .update(`${payload.razorpayPaymentId}|${payload.razorpaySubscriptionId}`)
    .digest('hex');

  return generated === payload.razorpaySignature;
};

export const fetchRazorpayPayment = async (paymentId: string) => {
  return getRazorpayClient().payments.fetch(paymentId);
};

export const fetchRazorpaySubscription = async (subscriptionId: string) => {
  return getRazorpayClient().subscriptions.fetch(subscriptionId);
};

export const cancelRazorpaySubscription = async (subscriptionId: string) => {
  return getRazorpayClient().subscriptions.cancel(subscriptionId, false);
};

export const resumeRazorpaySubscription = async (subscriptionId: string) => {
  return getRazorpayClient().subscriptions.resume(subscriptionId, {
    resume_at: 'now',
  });
};

export const createRefund = async (paymentId: string, notes?: Record<string, string>) => {
  return getRazorpayClient().payments.refund(paymentId, {
    notes,
  });
};
