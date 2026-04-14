import { onCall } from 'firebase-functions/v2/https';
import { env } from './config/env.js';
import { aiChatHandler } from './handlers/ai.js';
import { adminSyncPaymentHandler, billingCheckoutHandler, billingHistoryHandler, billingRequestRefundHandler, billingSubscriptionCancelHandler, billingSubscriptionGetHandler, billingSubscriptionResumeHandler, billingVerifyPaymentHandler, } from './handlers/billing.js';
import { health, razorpayWebhook } from './handlers/http.js';
import { meGetHandler, meUpdateProfileHandler, meUsageHistoryHandler } from './handlers/me.js';
const serviceAccount = process.env.FUNCTIONS_SERVICE_ACCOUNT ||
    `firebase-adminsdk-fbsvc@${env.projectId || 'pluto-ef61b'}.iam.gserviceaccount.com`;
const secureCallable = (handler, options) => onCall({
    region: env.region,
    enforceAppCheck: true,
    minInstances: options?.minInstances ?? 0,
    memory: '512MiB',
    serviceAccount,
}, handler);
export const meGet = secureCallable(meGetHandler);
export const meUpdateProfile = secureCallable(meUpdateProfileHandler);
export const meUsageHistory = secureCallable(meUsageHistoryHandler);
export const aiChat = secureCallable(aiChatHandler, { minInstances: 1 });
export const billingCheckout = secureCallable(billingCheckoutHandler, { minInstances: 1 });
export const billingVerifyPayment = secureCallable(billingVerifyPaymentHandler, { minInstances: 1 });
export const billingHistory = secureCallable(billingHistoryHandler);
export const billingRequestRefund = secureCallable(billingRequestRefundHandler, {
    minInstances: 1,
});
export const billingSubscriptionGet = secureCallable(billingSubscriptionGetHandler);
export const billingSubscriptionCancel = secureCallable(billingSubscriptionCancelHandler, { minInstances: 1 });
export const billingSubscriptionResume = secureCallable(billingSubscriptionResumeHandler, { minInstances: 1 });
export const adminSyncPayment = secureCallable(adminSyncPaymentHandler);
export { health, razorpayWebhook };
