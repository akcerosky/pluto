import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/firebaseAdmin.js';
export const AI_REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
export const AI_REQUEST_LOCK_MS = 120 * 1000;
export const AI_PERMANENT_FAILURE_TTL_MS = 60 * 1000;
export const hashRequestId = (requestId) => createHash('sha256').update(requestId).digest('hex').slice(0, 16);
export const getAiRequestCacheDocId = (uid, requestId) => `${uid}_${hashRequestId(requestId)}`;
const isFresh = (expiresAt, now) => typeof expiresAt === 'number' && expiresAt > now;
const isLockActive = (lockExpiresAt, now) => typeof lockExpiresAt === 'number' && lockExpiresAt > now;
export const acquireAiRequest = async (uid, requestId, options) => {
    const db = options?.db ?? adminDb;
    const now = options?.now ?? Date.now();
    const cacheKey = getAiRequestCacheDocId(uid, requestId);
    const ref = db.collection('aiRequestCache').doc(cacheKey);
    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const existing = snap.exists ? snap.data() : null;
        if (existing && existing.uid === uid && existing.requestId === requestId) {
            if (existing.status === 'completed' && isFresh(existing.expiresAt, now)) {
                return {
                    state: 'completed',
                    cacheKey,
                    response: existing.response,
                    ageMs: Math.max(now - (existing.updatedAt ?? now), 0),
                };
            }
            if (existing.status === 'failed' &&
                existing.failureType === 'permanent' &&
                existing.failure &&
                isFresh(existing.expiresAt, now)) {
                return {
                    state: 'permanent_failure',
                    cacheKey,
                    failure: existing.failure,
                    ageMs: Math.max(now - (existing.updatedAt ?? now), 0),
                };
            }
            if (existing.status === 'processing' && isLockActive(existing.lockExpiresAt, now)) {
                return {
                    state: 'in_flight',
                    cacheKey,
                    ageMs: Math.max(now - (existing.updatedAt ?? existing.createdAt ?? now), 0),
                    lockExpiresAt: existing.lockExpiresAt ?? now,
                };
            }
        }
        transaction.set(ref, {
            uid,
            requestId,
            status: 'processing',
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            expiresAt: now + AI_REQUEST_CACHE_TTL_MS,
            lockExpiresAt: now + AI_REQUEST_LOCK_MS,
        }, { merge: false });
        return { state: 'claimed', cacheKey };
    });
};
export const completeAiRequest = async (cacheKey, response, options) => {
    const db = options?.db ?? adminDb;
    const now = options?.now ?? Date.now();
    await db.collection('aiRequestCache').doc(cacheKey).set({
        status: 'completed',
        response,
        failure: null,
        failureType: null,
        updatedAt: now,
        expiresAt: now + AI_REQUEST_CACHE_TTL_MS,
        lockExpiresAt: 0,
    }, { merge: true });
};
export const failAiRequest = async (cacheKey, failureType, failure, options) => {
    const db = options?.db ?? adminDb;
    const now = options?.now ?? Date.now();
    await db.collection('aiRequestCache').doc(cacheKey).set({
        status: 'failed',
        failureType,
        ...(failure ? { failure } : { failure: null }),
        updatedAt: now,
        expiresAt: now + (failureType === 'permanent' ? AI_PERMANENT_FAILURE_TTL_MS : AI_REQUEST_CACHE_TTL_MS),
        lockExpiresAt: 0,
    }, { merge: true });
};
export const throwCachedAiError = (failure) => {
    throw new HttpsError(failure.code, failure.message);
};
