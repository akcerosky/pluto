import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import type { UserBootstrapIdentity } from '../types/index.js';

export const assertAuth = <T>(request: CallableRequest<T>) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'A signed-in Firebase user is required.');
  }
  return request.auth.uid;
};

export const assertAdmin = <T>(request: CallableRequest<T>) => {
  const uid = assertAuth(request);
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access is required.');
  }
  return uid;
};

export const getRequestId = <T extends { requestId?: string }>(payload: T): string => {
  if (!payload.requestId || typeof payload.requestId !== 'string') {
    throw new HttpsError('invalid-argument', 'requestId is required.');
  }
  return payload.requestId;
};

export const getBootstrapIdentity = <T>(request: CallableRequest<T>): UserBootstrapIdentity => ({
  email: typeof request.auth?.token?.email === 'string' ? request.auth.token.email : null,
  name:
    typeof request.auth?.token?.name === 'string'
      ? request.auth.token.name
      : typeof request.auth?.token?.email === 'string'
      ? request.auth.token.email.split('@')[0]
      : null,
  avatar: typeof request.auth?.token?.picture === 'string' ? request.auth.token.picture : null,
});
