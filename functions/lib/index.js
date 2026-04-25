import { onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { env } from './config/env.js';
import { runtimeSecrets } from './config/secrets.js';
const serviceAccount = process.env.FUNCTIONS_SERVICE_ACCOUNT ||
    `firebase-adminsdk-fbsvc@${env.projectId || 'pluto-ef61b'}.iam.gserviceaccount.com`;
const secureCallable = (handler, options) => onCall({
    region: env.region,
    enforceAppCheck: true,
    minInstances: options?.minInstances ?? 0,
    timeoutSeconds: options?.timeoutSeconds,
    memory: '512MiB',
    serviceAccount,
    secrets: runtimeSecrets,
}, handler);
const lazySecureCallable = (loadHandler, options) => secureCallable(async (request) => {
    const handler = await loadHandler();
    return handler(request);
}, options);
export const meGet = lazySecureCallable(async () => (await import('./handlers/me.js')).meGetHandler);
export const meUpdateProfile = lazySecureCallable(async () => (await import('./handlers/me.js')).meUpdateProfileHandler);
export const meUsageHistory = lazySecureCallable(async () => (await import('./handlers/me.js')).meUsageHistoryHandler);
export const aiChat = lazySecureCallable(async () => (await import('./handlers/ai.js')).aiChatHandler, {
    minInstances: 1,
    timeoutSeconds: 120,
});
export const deleteThread = lazySecureCallable(async () => (await import('./handlers/chatState.js')).deleteThreadHandler);
export const billingCheckout = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingCheckoutHandler, { minInstances: 1 });
export const billingVerifyPayment = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingVerifyPaymentHandler, { minInstances: 1 });
export const billingHistory = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingHistoryHandler);
export const billingRequestRefund = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingRequestRefundHandler, { minInstances: 1 });
export const billingSubscriptionGet = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingSubscriptionGetHandler);
export const billingSubscriptionCancel = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingSubscriptionCancelHandler, { minInstances: 1 });
export const billingSubscriptionResume = lazySecureCallable(async () => (await import('./handlers/billing.js')).billingSubscriptionResumeHandler, { minInstances: 1 });
export const adminSyncPayment = lazySecureCallable(async () => (await import('./handlers/billing.js')).adminSyncPaymentHandler);
export const health = onRequest({
    region: env.region,
}, async (request, response) => {
    const { healthHandler } = await import('./handlers/http.js');
    return healthHandler(request, response);
});
export const razorpayWebhook = onRequest({
    region: env.region,
    memory: '256MiB',
    secrets: runtimeSecrets,
}, async (request, response) => {
    const { razorpayWebhookHandler } = await import('./handlers/http.js');
    return razorpayWebhookHandler(request, response);
});
