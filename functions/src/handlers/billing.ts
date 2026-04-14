import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { assertAdmin, assertAuth, getBootstrapIdentity } from '../lib/http.js';
import { DEFAULT_PLAN, PLAN_DEFINITIONS, PRO_REFUND_DAILY_LIMIT, type SubscriptionPlan } from '../config/plans.js';
import {
  calculateRefundEligibility,
  createPaymentRecord,
  getMeSnapshot,
  getPaymentRecord,
  getSubscriptionPrivate,
  listPaymentHistory,
  markRefundState,
  updateSubscriptionFromRazorpay,
} from '../services/firestoreRepo.js';
import {
  cancelRazorpaySubscription,
  createRefund,
  createRazorpaySubscription,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
  resumeRazorpaySubscription,
  verifyCheckoutSignature,
} from '../services/razorpay.js';
import { getIstNow, toIstIsoString } from '../utils/time.js';

const paidPlanSchema = z.enum(['Plus', 'Pro']);

const billingCheckoutSchema = z.object({
  plan: paidPlanSchema,
  returnUrl: z.string().url(),
});

const billingVerifySchema = z.object({
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySubscriptionId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

const refundSchema = z.object({
  paymentRecordId: z.string().trim().min(1),
});

const adminSyncSchema = z.object({
  uid: z.string().trim().min(1),
  paymentRecordId: z.string().trim().min(1),
});

export const billingCheckoutHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const payload = billingCheckoutSchema.parse(request.data ?? {});
  const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));

  const subscription = await createRazorpaySubscription({
    plan: payload.plan,
    customerEmail: snapshot.profile.email,
    customerName: snapshot.profile.name,
    notes: {
      uid,
      plan: payload.plan,
      returnUrl: payload.returnUrl,
    },
  });

  const paymentRecordId = subscription.id;
  await createPaymentRecord(uid, paymentRecordId, {
    provider: 'razorpay',
    plan: payload.plan,
    status: 'pending',
    amountInr: PLAN_DEFINITIONS[payload.plan].amountInr,
    createdAt: toIstIsoString(getIstNow()),
    updatedAt: toIstIsoString(getIstNow()),
    subscriptionId: subscription.id,
    metadata: {
      returnUrl: payload.returnUrl,
    },
  });

  await updateSubscriptionFromRazorpay(uid, {
    plan: payload.plan,
    status: 'pending',
    subscriptionId: subscription.id,
    cancelAtPeriodEnd: false,
  });

  return {
    provider: 'razorpay',
    key: process.env.RAZORPAY_KEY_ID,
    subscriptionId: subscription.id,
    amountInr: PLAN_DEFINITIONS[payload.plan].amountInr,
    plan: payload.plan,
    name: 'Pluto',
    description: `Pluto ${payload.plan} subscription`,
    prefill: {
      name: snapshot.profile.name,
      email: snapshot.profile.email,
    },
    callbackUrl: payload.returnUrl,
  };
};

export const billingVerifyPaymentHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const payload = billingVerifySchema.parse(request.data ?? {});

  if (!verifyCheckoutSignature(payload)) {
    throw new HttpsError('permission-denied', 'Invalid Razorpay checkout signature.');
  }

  const [payment, subscription] = await Promise.all([
    fetchRazorpayPayment(payload.razorpayPaymentId),
    fetchRazorpaySubscription(payload.razorpaySubscriptionId),
  ]);

  const paymentRecordId = payload.razorpaySubscriptionId;
  const existingPayment = await getPaymentRecord(uid, paymentRecordId);
  if (!existingPayment) {
    throw new HttpsError('not-found', 'No pending Razorpay payment record was found.');
  }

  const periodStart =
    typeof subscription.current_start === 'number'
      ? new Date(subscription.current_start * 1000)
      : getIstNow();
  const periodEnd =
    typeof subscription.current_end === 'number'
      ? new Date(subscription.current_end * 1000)
      : getIstNow();

  await createPaymentRecord(uid, paymentRecordId, {
    ...existingPayment,
    status: payment.status === 'captured' ? 'captured' : existingPayment.status,
    paymentId: payment.id,
    subscriptionId: subscription.id,
    updatedAt: toIstIsoString(getIstNow()),
  });

  await updateSubscriptionFromRazorpay(uid, {
    plan: existingPayment.plan,
    status: String(subscription.status) === 'paused' ? 'paused' : 'active',
    subscriptionId: subscription.id,
    paymentId: payment.id,
    currentPeriodStart: toIstIsoString(periodStart),
    currentPeriodEnd: toIstIsoString(periodEnd),
    cancelAtPeriodEnd: false,
  });

  const snapshot = await getMeSnapshot(uid);
  return {
    provider: 'razorpay',
    paymentStatus: payment.status,
    subscription: snapshot.subscription,
    requiresWebhookSync: false,
  };
};

export const billingHistoryHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  return {
    history: await listPaymentHistory(uid),
  };
};

export const billingSubscriptionGetHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
  return {
    subscription: snapshot.subscription,
    usageToday: snapshot.usageToday,
    dailyLimit: snapshot.dailyLimit,
    remainingToday: snapshot.remainingToday,
  };
};

export const billingSubscriptionCancelHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const privateSubscription = await getSubscriptionPrivate(uid);
  if (!privateSubscription.providerSubscriptionId) {
    throw new HttpsError('failed-precondition', 'No Razorpay subscription is active for this account.');
  }

  await cancelRazorpaySubscription(privateSubscription.providerSubscriptionId);
  const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
  await updateSubscriptionFromRazorpay(uid, {
    plan: snapshot.subscription.plan,
    status: 'cancelled',
    subscriptionId: privateSubscription.providerSubscriptionId,
    paymentId: privateSubscription.providerPaymentId,
    currentPeriodStart: privateSubscription.currentPeriodStart,
    currentPeriodEnd: privateSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: true,
  });

  const updated = await getMeSnapshot(uid, getBootstrapIdentity(request));
  return {
    subscription: updated.subscription,
  };
};

export const billingSubscriptionResumeHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const privateSubscription = await getSubscriptionPrivate(uid);
  if (!privateSubscription.providerSubscriptionId) {
    throw new HttpsError('failed-precondition', 'No Razorpay subscription is available to resume.');
  }

  const snapshot = await getMeSnapshot(uid, getBootstrapIdentity(request));
  if (snapshot.subscription.status === 'cancelled') {
    throw new HttpsError(
      'failed-precondition',
      'This subscription cannot be resumed because it was cancelled, not paused. Please subscribe again.'
    );
  }

  try {
    await resumeRazorpaySubscription(privateSubscription.providerSubscriptionId);
  } catch (error) {
    const description =
      typeof error === 'object' && error && 'description' in error ? String(error.description) : '';
    if (description.toLowerCase().includes('cancelled state')) {
      throw new HttpsError(
        'failed-precondition',
        'This subscription cannot be resumed because it was cancelled, not paused. Please subscribe again.'
      );
    }
    throw error;
  }

  await updateSubscriptionFromRazorpay(uid, {
    plan: snapshot.subscription.plan,
    status: 'active',
    subscriptionId: privateSubscription.providerSubscriptionId,
    paymentId: privateSubscription.providerPaymentId,
    currentPeriodStart: privateSubscription.currentPeriodStart,
    currentPeriodEnd: privateSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: false,
  });

  const updated = await getMeSnapshot(uid, getBootstrapIdentity(request));
  return {
    subscription: updated.subscription,
  };
};

export const billingRequestRefundHandler = async (request: CallableRequest<unknown>) => {
  const uid = assertAuth(request);
  const payload = refundSchema.parse(request.data ?? {});
  const payment = await getPaymentRecord(uid, payload.paymentRecordId);
  if (!payment) {
    throw new HttpsError('not-found', 'Payment record not found.');
  }

  if (payment.provider !== 'razorpay') {
    throw new HttpsError('failed-precondition', 'Only Razorpay payments can be refunded.');
  }

  if (payment.status !== 'captured' || !payment.paymentId) {
    throw new HttpsError('failed-precondition', 'Only captured Razorpay payments can be refunded.');
  }

  if (payment.refundRequested || payment.refundCompleted) {
    throw new HttpsError('already-exists', 'A refund has already been requested for this payment.');
  }

  const createdAt = new Date(payment.createdAt);
  const ageMs = Date.now() - createdAt.getTime();
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    throw new HttpsError('failed-precondition', 'Refunds are only allowed within 7 days of payment.');
  }

  const planLimit =
    PLAN_DEFINITIONS[payment.plan as SubscriptionPlan].dailyLimit ?? PRO_REFUND_DAILY_LIMIT;
  const refundCheck = await calculateRefundEligibility(uid, payment.plan as SubscriptionPlan, createdAt);
  if (refundCheck.eligibleUsageCapacity > 0 && refundCheck.usageRatio > 0.5) {
    throw new HttpsError('failed-precondition', 'Refunds are unavailable after more than 50% plan usage.');
  }

  await markRefundState(uid, payload.paymentRecordId, {
    status: payment.status,
    refundRequested: true,
    refundCompleted: false,
  });

  await createRefund(payment.paymentId, {
    plan: payment.plan,
    dailyLimitReference: String(planLimit),
  });

  await markRefundState(uid, payload.paymentRecordId, {
    status: 'refunded',
    refundRequested: true,
    refundCompleted: true,
  });

  return {
    ok: true,
  };
};

export const adminSyncPaymentHandler = async (request: CallableRequest<unknown>) => {
  assertAdmin(request);
  const payload = adminSyncSchema.parse(request.data ?? {});
  const payment = await getPaymentRecord(payload.uid, payload.paymentRecordId);
  if (!payment?.subscriptionId) {
    throw new HttpsError('not-found', 'Payment or subscription record not found.');
  }

  const subscription = await fetchRazorpaySubscription(payment.subscriptionId);
  const refreshedPayment =
    payment.paymentId ? await fetchRazorpayPayment(payment.paymentId) : null;

  const plan = payment.plan as Exclude<SubscriptionPlan, 'Free'>;
  const currentPeriodStart =
    typeof subscription.current_start === 'number'
      ? toIstIsoString(new Date(subscription.current_start * 1000))
      : null;
  const currentPeriodEnd =
    typeof subscription.current_end === 'number'
      ? toIstIsoString(new Date(subscription.current_end * 1000))
      : null;

  await createPaymentRecord(payload.uid, payload.paymentRecordId, {
    ...payment,
    status:
      refreshedPayment?.status === 'captured'
        ? 'captured'
        : subscription.status === 'cancelled'
        ? 'failed'
        : payment.status,
    updatedAt: toIstIsoString(getIstNow()),
  });

  await updateSubscriptionFromRazorpay(payload.uid, {
    plan: String(subscription.status) === 'cancelled' ? DEFAULT_PLAN : plan,
    status:
      String(subscription.status) === 'active'
        ? 'active'
        : String(subscription.status) === 'paused'
        ? 'paused'
        : String(subscription.status) === 'cancelled'
        ? 'expired'
        : 'pending',
    subscriptionId: subscription.id,
    paymentId: refreshedPayment?.id ?? payment.paymentId ?? null,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: String(subscription.status) === 'cancelled',
  });

  return {
    ok: true,
  };
};
