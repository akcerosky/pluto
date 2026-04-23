import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { env } from './config/env.js';
import { runtimeSecrets } from './config/secrets.js';

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
      secrets: runtimeSecrets,
    },
    handler as never
  );

const lazySecureCallable = (
  loadHandler: LazyCallableHandler,
  options?: { minInstances?: number; timeoutSeconds?: number }
) =>
  secureCallable(
    async (request) => {
      const handler = await loadHandler();
      return handler(request);
    },
    options
  );

export const meGet = lazySecureCallable(
  async () => (await import('./handlers/me.js')).meGetHandler as CloudCallableHandler
);
export const meUpdateProfile = lazySecureCallable(
  async () => (await import('./handlers/me.js')).meUpdateProfileHandler as CloudCallableHandler
);
export const meUsageHistory = lazySecureCallable(
  async () => (await import('./handlers/me.js')).meUsageHistoryHandler as CloudCallableHandler
);

export const aiChat = lazySecureCallable(async () => (await import('./handlers/ai.js')).aiChatHandler as CloudCallableHandler, {
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
    secrets: runtimeSecrets,
  },
  async (request, response) => {
    const { razorpayWebhookHandler } = await import('./handlers/http.js');
    return razorpayWebhookHandler(request, response);
  }
);
