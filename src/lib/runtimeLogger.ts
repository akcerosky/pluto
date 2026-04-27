const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development';

const toError = (message: string, error?: unknown) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(message);
};

const captureProductionError = async (
  message: string,
  error?: unknown,
  extras?: Record<string, unknown>
) => {
  const Sentry = await import('@sentry/react');
  Sentry.withScope((scope) => {
    scope.setTag('runtime_logger', 'true');
    scope.setExtra('message', message);

    if (extras) {
      for (const [key, value] of Object.entries(extras)) {
        scope.setExtra(key, value);
      }
    }

    if (error !== undefined && !(error instanceof Error)) {
      scope.setExtra('errorValue', String(error));
    }

    Sentry.captureException(toError(message, error));
  });
};

export const runtimeLogger = {
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  warn: (message: string, error?: unknown, extras?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.warn(message, error, extras);
    }

    void message;
    void error;
    void extras;
  },
  error: (message: string, error?: unknown, extras?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.error(message, error, extras);
      return;
    }

    void captureProductionError(message, error, extras);
  },
};
