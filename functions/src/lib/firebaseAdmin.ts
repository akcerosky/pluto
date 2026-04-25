import { getApps, initializeApp, refreshToken } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const getRefreshTokenCredential = () => {
  const raw = process.env.FIREBASE_ADMIN_REFRESH_TOKEN_JSON;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      client_id?: string;
      client_secret?: string;
      refresh_token?: string;
      type?: string;
      project_id?: string;
    };
    if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
      return null;
    }
    return {
      credential: refreshToken({
        type: parsed.type ?? 'authorized_user',
        client_id: parsed.client_id,
        client_secret: parsed.client_secret,
        refresh_token: parsed.refresh_token,
      }),
      projectId:
        parsed.project_id ??
        process.env.GOOGLE_CLOUD_PROJECT ??
        process.env.GCLOUD_PROJECT ??
        process.env.FIREBASE_PROJECT_ID,
    };
  } catch {
    return null;
  }
};

const app =
  getApps()[0] ??
  (() => {
    const tokenCredential = getRefreshTokenCredential();
    if (tokenCredential) {
      return initializeApp(tokenCredential);
    }
    return initializeApp();
  })();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
