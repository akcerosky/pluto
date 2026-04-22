import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '../lib/firebaseAdmin.js';

export const AI_REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
export const AI_REQUEST_LOCK_MS = 120 * 1000;
export const AI_PERMANENT_FAILURE_TTL_MS = 60 * 1000;

export type AiRequestCacheStatus = 'processing' | 'completed' | 'failed';
export type AiRequestFailureType = 'transient' | 'permanent';

export interface CachedAiError {
  code: 'invalid-argument' | 'permission-denied' | 'resource-exhausted' | 'unavailable' | 'internal';
  message: string;
}

export interface AiRequestCacheDoc {
  uid: string;
  requestId: string;
  status: AiRequestCacheStatus;
  response?: unknown;
  failure?: CachedAiError;
  failureType?: AiRequestFailureType;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  lockExpiresAt: number;
}

export type AiRequestClaimResult =
  | { state: 'claimed'; cacheKey: string }
  | { state: 'completed'; cacheKey: string; response: unknown; ageMs: number }
  | { state: 'in_flight'; cacheKey: string; ageMs: number; lockExpiresAt: number }
  | { state: 'permanent_failure'; cacheKey: string; failure: CachedAiError; ageMs: number };

export const hashRequestId = (requestId: string) =>
  createHash('sha256').update(requestId).digest('hex').slice(0, 16);

export const getAiRequestCacheDocId = (uid: string, requestId: string) =>
  `${uid}_${hashRequestId(requestId)}`;

const isFresh = (expiresAt: unknown, now: number) =>
  typeof expiresAt === 'number' && expiresAt > now;

const isLockActive = (lockExpiresAt: unknown, now: number) =>
  typeof lockExpiresAt === 'number' && lockExpiresAt > now;

export const acquireAiRequest = async (
  uid: string,
  requestId: string,
  options?: { now?: number; db?: Firestore }
): Promise<AiRequestClaimResult> => {
  const db = options?.db ?? adminDb;
  const now = options?.now ?? Date.now();
  const cacheKey = getAiRequestCacheDocId(uid, requestId);
  const ref = db.collection('aiRequestCache').doc(cacheKey);

  return db.runTransaction(async (transaction: Transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists ? (snap.data() as Partial<AiRequestCacheDoc>) : null;

    if (existing && existing.uid === uid && existing.requestId === requestId) {
      if (existing.status === 'completed' && isFresh(existing.expiresAt, now)) {
        return {
          state: 'completed' as const,
          cacheKey,
          response: existing.response,
          ageMs: Math.max(now - (existing.updatedAt ?? now), 0),
        };
      }

      if (
        existing.status === 'failed' &&
        existing.failureType === 'permanent' &&
        existing.failure &&
        isFresh(existing.expiresAt, now)
      ) {
        return {
          state: 'permanent_failure' as const,
          cacheKey,
          failure: existing.failure,
          ageMs: Math.max(now - (existing.updatedAt ?? now), 0),
        };
      }

      if (existing.status === 'processing' && isLockActive(existing.lockExpiresAt, now)) {
        return {
          state: 'in_flight' as const,
          cacheKey,
          ageMs: Math.max(now - (existing.updatedAt ?? existing.createdAt ?? now), 0),
          lockExpiresAt: existing.lockExpiresAt ?? now,
        };
      }
    }

    transaction.set(
      ref,
      {
        uid,
        requestId,
        status: 'processing',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        expiresAt: now + AI_REQUEST_CACHE_TTL_MS,
        lockExpiresAt: now + AI_REQUEST_LOCK_MS,
      } satisfies AiRequestCacheDoc,
      { merge: false }
    );

    return { state: 'claimed' as const, cacheKey };
  });
};

export const completeAiRequest = async (
  cacheKey: string,
  response: unknown,
  options?: { now?: number; db?: Firestore }
) => {
  const db = options?.db ?? adminDb;
  const now = options?.now ?? Date.now();
  await db.collection('aiRequestCache').doc(cacheKey).set(
    {
      status: 'completed',
      response,
      failure: null,
      failureType: null,
      updatedAt: now,
      expiresAt: now + AI_REQUEST_CACHE_TTL_MS,
      lockExpiresAt: 0,
    },
    { merge: true }
  );
};

export const failAiRequest = async (
  cacheKey: string,
  failureType: AiRequestFailureType,
  failure?: CachedAiError,
  options?: { now?: number; db?: Firestore }
) => {
  const db = options?.db ?? adminDb;
  const now = options?.now ?? Date.now();
  await db.collection('aiRequestCache').doc(cacheKey).set(
    {
      status: 'failed',
      failureType,
      ...(failure ? { failure } : { failure: null }),
      updatedAt: now,
      expiresAt:
        now + (failureType === 'permanent' ? AI_PERMANENT_FAILURE_TTL_MS : AI_REQUEST_CACHE_TTL_MS),
      lockExpiresAt: 0,
    },
    { merge: true }
  );
};

export const throwCachedAiError = (failure: CachedAiError): never => {
  throw new HttpsError(failure.code, failure.message);
};
