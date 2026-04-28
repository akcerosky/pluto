import { getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN;
const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-south1';
const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
type AppCheckDebugGlobal = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.length > 0
);

const app = hasFirebaseConfig ? getApps()[0] ?? initializeApp(firebaseConfig) : null;
const isAuthActionPage =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/__/auth/action');

if (app && appCheckSiteKey && !isAuthActionPage) {
  if (isDevelopment && typeof self !== 'undefined') {
    (self as AppCheckDebugGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckDebugToken || true;
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, functionsRegion) : null;
