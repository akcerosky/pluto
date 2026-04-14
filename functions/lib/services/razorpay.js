import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { getRazorpayPlanId, requireEnv } from '../config/env.js';
const getRazorpayClient = () => new Razorpay({
    key_id: requireEnv('razorpayKeyId'),
    key_secret: requireEnv('razorpayKeySecret'),
});
export const createRazorpaySubscription = async (payload) => {
    return getRazorpayClient().subscriptions.create({
        plan_id: getRazorpayPlanId(payload.plan),
        customer_notify: 1,
        total_count: 12,
        notes: payload.notes,
    });
};
export const verifyRazorpayWebhookSignature = (body, signature) => {
    if (!signature) {
        return false;
    }
    const expected = crypto
        .createHmac('sha256', requireEnv('razorpayWebhookSecret'))
        .update(body)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};
export const verifyCheckoutSignature = (payload) => {
    const generated = crypto
        .createHmac('sha256', requireEnv('razorpayKeySecret'))
        .update(`${payload.razorpayPaymentId}|${payload.razorpaySubscriptionId}`)
        .digest('hex');
    return generated === payload.razorpaySignature;
};
export const fetchRazorpayPayment = async (paymentId) => {
    return getRazorpayClient().payments.fetch(paymentId);
};
export const fetchRazorpaySubscription = async (subscriptionId) => {
    return getRazorpayClient().subscriptions.fetch(subscriptionId);
};
export const cancelRazorpaySubscription = async (subscriptionId) => {
    return getRazorpayClient().subscriptions.cancel(subscriptionId, false);
};
export const resumeRazorpaySubscription = async (subscriptionId) => {
    return getRazorpayClient().subscriptions.resume(subscriptionId, {
        resume_at: 'now',
    });
};
export const createRefund = async (paymentId, notes) => {
    return getRazorpayClient().payments.refund(paymentId, {
        notes,
    });
};
