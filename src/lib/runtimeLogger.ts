import { captureSentryException } from './sentryBrowser';

const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development';

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

    void captureSentryException(message, error, extras);
  },
};
