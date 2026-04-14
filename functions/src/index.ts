import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { env } from './config/env.js';
import { aiChatHandler } from './handlers/ai.js';
import {
  adminSyncPaymentHandler,
  billingCheckoutHandler,
  billingHistoryHandler,
  billingRequestRefundHandler,
  billingSubscriptionCancelHandler,
  billingSubscriptionGetHandler,
  billingSubscriptionResumeHandler,
  billingVerifyPaymentHandler,
} from './handlers/billing.js';
import { health, razorpayWebhook } from './handlers/http.js';
import { meGetHandler, meUpdateProfileHandler, meUsageHistoryHandler } from './handlers/me.js';

type CloudCallableHandler = (request: CallableRequest<unknown>) => Promise<unknown>;

const serviceAccount =
  process.env.FUNCTIONS_SERVICE_ACCOUNT ||
  `firebase-adminsdk-fbsvc@${env.projectId || 'pluto-ef61b'}.iam.gserviceaccount.com`;

const secureCallable = (
  handler: CloudCallableHandler,
  options?: { minInstances?: number }
) =>
  onCall(
    {
      region: env.region,
      enforceAppCheck: true,
      minInstances: options?.minInstances ?? 0,
      memory: '512MiB',
      serviceAccount,
    },
    handler as never
  );

export const meGet = secureCallable(meGetHandler as CloudCallableHandler);
export const meUpdateProfile = secureCallable(meUpdateProfileHandler as CloudCallableHandler);
export const meUsageHistory = secureCallable(meUsageHistoryHandler as CloudCallableHandler);

export const aiChat = secureCallable(aiChatHandler as CloudCallableHandler, { minInstances: 1 });
export const billingCheckout = secureCallable(billingCheckoutHandler as CloudCallableHandler, { minInstances: 1 });
export const billingVerifyPayment = secureCallable(billingVerifyPaymentHandler as CloudCallableHandler, { minInstances: 1 });
export const billingHistory = secureCallable(billingHistoryHandler as CloudCallableHandler);
export const billingRequestRefund = secureCallable(billingRequestRefundHandler as CloudCallableHandler, {
  minInstances: 1,
});
export const billingSubscriptionGet = secureCallable(billingSubscriptionGetHandler as CloudCallableHandler);
export const billingSubscriptionCancel = secureCallable(
  billingSubscriptionCancelHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const billingSubscriptionResume = secureCallable(
  billingSubscriptionResumeHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const adminSyncPayment = secureCallable(adminSyncPaymentHandler as CloudCallableHandler);

export { health, razorpayWebhook };
