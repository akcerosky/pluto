import { onRequest } from 'firebase-functions/v2/https';
import { env } from '../config/env.js';
import { acquireBillingEventLock, createPaymentRecord, getPaymentRecord, getUserEmailContact, updateSubscriptionFromRazorpay, } from '../services/firestoreRepo.js';
import { sendEmail } from '../services/email.js';
import { subscriptionActivated, subscriptionCancelled, subscriptionCharged, subscriptionPaused, } from '../services/emailTemplates.js';
import { fetchRazorpaySubscription, verifyRazorpayWebhookSignature } from '../services/razorpay.js';
import { getIstNow, toIstIsoString } from '../utils/time.js';
export const healthHandler = (_request, response) => {
    response.status(200).json({
        ok: true,
        service: 'pluto-functions',
        region: env.region,
        now: toIstIsoString(getIstNow()),
    });
};
export const resolvePlanFromAmount = (amountInr) => {
    if (amountInr === 299)
        return 'Plus';
    if (amountInr === 599)
        return 'Pro';
    return 'Free';
};
export const razorpayWebhookHandler = async (request, response) => {
    const rawRequest = request;
    const rawBody = typeof rawRequest.rawBody === 'string'
        ? rawRequest.rawBody
        : Buffer.isBuffer(rawRequest.rawBody)
            ? rawRequest.rawBody.toString('utf8')
            : JSON.stringify(request.body ?? {});
    const signature = request.header('x-razorpay-signature');
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        response.status(401).json({ error: 'Invalid Razorpay webhook signature.' });
        return;
    }
    const event = request.body?.event;
    const entity = request.body?.payload?.subscription?.entity;
    const notes = entity?.notes ?? {};
    const uid = notes.uid;
    if (!uid || !entity?.id) {
        response.status(400).json({ error: 'Webhook payload is missing Pluto user metadata.' });
        return;
    }
    const paymentRecordId = entity.id;
    const lockAcquired = await acquireBillingEventLock(uid, `${event}:${paymentRecordId}`, {
        provider: 'razorpay',
        eventType: event ?? 'unknown',
        paymentRecordId,
    });
    if (!lockAcquired) {
        response.status(200).json({ ok: true, duplicate: true });
        return;
    }
    const subscription = await fetchRazorpaySubscription(paymentRecordId);
    const plan = resolvePlanFromAmount((subscription.plan_id === env.razorpayPlusPlanId ? 299 : 599));
    const currentPeriodStart = typeof subscription.current_start === 'number'
        ? toIstIsoString(new Date(subscription.current_start * 1000))
        : null;
    const currentPeriodEnd = typeof subscription.current_end === 'number'
        ? toIstIsoString(new Date(subscription.current_end * 1000))
        : null;
    await createPaymentRecord(uid, paymentRecordId, {
        provider: 'razorpay',
        plan,
        status: event === 'subscription.cancelled'
            ? 'failed'
            : event === 'subscription.charged'
                ? 'captured'
                : 'pending',
        amountInr: plan === 'Plus' ? 299 : 599,
        createdAt: toIstIsoString(getIstNow()),
        updatedAt: toIstIsoString(getIstNow()),
        subscriptionId: paymentRecordId,
        paymentId: request.body?.payload?.payment?.entity?.id ?? null,
    });
    await updateSubscriptionFromRazorpay(uid, {
        plan: event === 'subscription.cancelled' ? 'Free' : plan,
        status: event === 'subscription.activated' || event === 'subscription.charged'
            ? 'active'
            : event === 'subscription.paused'
                ? 'paused'
                : event === 'subscription.cancelled'
                    ? 'expired'
                    : 'pending',
        subscriptionId: paymentRecordId,
        paymentId: request.body?.payload?.payment?.entity?.id ?? null,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: event === 'subscription.cancelled' ? false : subscription.status === 'cancelled',
    });
    const paymentRecord = await getPaymentRecord(uid, paymentRecordId);
    const contact = await getUserEmailContact(uid);
    if (!contact.email) {
        console.warn('Skipping Razorpay webhook email because no email address was found.', {
            uid,
            event,
        });
    }
    else {
        const amount = plan === 'Plus' ? 299 : 599;
        let emailPayload = null;
        switch (event) {
            case 'subscription.activated':
                if (paymentRecord?.metadata?.activationEmailSent !== true) {
                    emailPayload = {
                        subject: `Your Pluto ${plan} subscription is active`,
                        html: subscriptionActivated(contact.name, plan, currentPeriodEnd),
                    };
                }
                break;
            case 'subscription.charged':
                emailPayload = {
                    subject: `Pluto ${plan} renewal confirmed`,
                    html: subscriptionCharged(contact.name, plan, amount, currentPeriodEnd),
                };
                break;
            case 'subscription.cancelled':
                emailPayload = {
                    subject: `Your Pluto ${plan} subscription was cancelled`,
                    html: subscriptionCancelled(contact.name, plan, currentPeriodEnd),
                };
                break;
            case 'subscription.paused':
                emailPayload = {
                    subject: `Your Pluto ${plan} subscription is paused`,
                    html: subscriptionPaused(contact.name, plan),
                };
                break;
            default:
                break;
        }
        if (emailPayload) {
            const emailSent = await sendEmail(contact.email, emailPayload.subject, emailPayload.html);
            if (event === 'subscription.activated' && emailSent) {
                await createPaymentRecord(uid, paymentRecordId, {
                    ...(paymentRecord ?? {
                        provider: 'razorpay',
                        plan,
                        status: 'captured',
                        amountInr: amount,
                        createdAt: toIstIsoString(getIstNow()),
                        updatedAt: toIstIsoString(getIstNow()),
                        subscriptionId: paymentRecordId,
                    }),
                    metadata: {
                        ...(paymentRecord?.metadata ?? {}),
                        activationEmailSent: true,
                    },
                    updatedAt: toIstIsoString(getIstNow()),
                });
            }
        }
    }
    response.status(200).json({ ok: true });
};
export const health = onRequest({
    region: env.region,
}, healthHandler);
export const razorpayWebhook = onRequest({
    region: env.region,
    memory: '256MiB',
}, razorpayWebhookHandler);
