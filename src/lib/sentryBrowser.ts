const isProduction = import.meta.env.VITE_APP_ENV === 'production';
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const sentryScriptSrc = 'https://browser.sentry-cdn.com/10.50.0/bundle.min.js';

type SentryBrowser = {
  init: (options: Record<string, unknown>) => void;
  withScope: (callback: (scope: { setTag: (key: string, value: string) => void; setExtra: (key: string, value: unknown) => void }) => void) => void;
  captureException: (error: unknown) => void;
};

declare global {
  interface Window {
    Sentry?: SentryBrowser;
  }
}

let loadPromise: Promise<SentryBrowser | null> | null = null;
let initPromise: Promise<SentryBrowser | null> | null = null;

const loadSentryScript = () => {
  if (!isProduction || !sentryDsn || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.Sentry) {
    return Promise.resolve(window.Sentry);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${sentryScriptSrc}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.Sentry ?? null), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Unable to load Sentry browser SDK.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = sentryScriptSrc;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => resolve(window.Sentry ?? null), { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load Sentry browser SDK.')), { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
};

export const initializeSentryFromEnv = async () => {
  if (!isProduction || !sentryDsn) {
    return null;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = loadSentryScript().then((sentry) => {
    if (!sentry) {
      return null;
    }

    sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION,
      sendDefaultPii: true,
    });

    return sentry;
  });

  return initPromise;
};

export const captureSentryException = async (
  message: string,
  error?: unknown,
  extras?: Record<string, unknown>
) => {
  const sentry = await initializeSentryFromEnv();
  if (!sentry) {
    return;
  }

  sentry.withScope((scope) => {
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

    sentry.captureException(error instanceof Error ? error : new Error(message));
  });
};
