import * as Sentry from '@sentry/react';

const isProduction = import.meta.env.VITE_APP_ENV === 'production';
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

if (isProduction && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    sendDefaultPii: true,
  });
}
