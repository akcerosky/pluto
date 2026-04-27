import * as Sentry from '@sentry/react';

const sentryDsn =
  import.meta.env.VITE_SENTRY_DSN ||
  'https://549cc2ade1320d76b625e8adc66bbb48@o4511269306105856.ingest.us.sentry.io/4511290639974400';

Sentry.init({
  dsn: sentryDsn,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  sendDefaultPii: true,
});

