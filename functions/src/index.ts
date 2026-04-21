import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { env } from './config/env.js';
import { aiChatHandler } from './handlers/ai.js';
import { meGetHandler, meUpdateProfileHandler, meUsageHistoryHandler } from './handlers/me.js';

type CloudCallableHandler = (request: CallableRequest<unknown>) => Promise<unknown>;
type LazyCallableHandler = () => Promise<CloudCallableHandler>;

const serviceAccount =
  process.env.FUNCTIONS_SERVICE_ACCOUNT ||
  `firebase-adminsdk-fbsvc@${env.projectId || 'pluto-ef61b'}.iam.gserviceaccount.com`;

const secureCallable = (
  handler: CloudCallableHandler,
  options?: { minInstances?: number; timeoutSeconds?: number }
) =>
  onCall(
    {
      region: env.region,
      enforceAppCheck: true,
      minInstances: options?.minInstances ?? 0,
      timeoutSeconds: options?.timeoutSeconds,
      memory: '512MiB',
      serviceAccount,
    },
    handler as never
  );

const lazySecureCallable = (
  loadHandler: LazyCallableHandler,
  options?: { minInstances?: number }
) =>
  secureCallable(
    async (request) => {
      const handler = await loadHandler();
      return handler(request);
    },
    options
  );

export const meGet = secureCallable(meGetHandler as CloudCallableHandler);
export const meUpdateProfile = secureCallable(meUpdateProfileHandler as CloudCallableHandler);
export const meUsageHistory = secureCallable(meUsageHistoryHandler as CloudCallableHandler);

export const aiChat = secureCallable(aiChatHandler as CloudCallableHandler, {
  minInstances: 1,
  timeoutSeconds: 120,
});

export const billingCheckout = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingCheckoutHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const billingVerifyPayment = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingVerifyPaymentHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const billingHistory = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingHistoryHandler as CloudCallableHandler
);
export const billingRequestRefund = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingRequestRefundHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const billingSubscriptionGet = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingSubscriptionGetHandler as CloudCallableHandler
);
export const billingSubscriptionCancel = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingSubscriptionCancelHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const billingSubscriptionResume = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).billingSubscriptionResumeHandler as CloudCallableHandler,
  { minInstances: 1 }
);
export const adminSyncPayment = lazySecureCallable(
  async () => (await import('./handlers/billing.js')).adminSyncPaymentHandler as CloudCallableHandler
);

export const health = onRequest(
  {
    region: env.region,
  },
  async (request, response) => {
    const { healthHandler } = await import('./handlers/http.js');
    return healthHandler(request, response);
  }
);

export const razorpayWebhook = onRequest(
  {
    region: env.region,
    memory: '256MiB',
  },
  async (request, response) => {
    const { razorpayWebhookHandler } = await import('./handlers/http.js');
    return razorpayWebhookHandler(request, response);
  }
);
