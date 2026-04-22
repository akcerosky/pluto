import { adminDb } from '../lib/firebaseAdmin.js';
export const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const AI_RATE_LIMIT_MAX_REQUESTS = 20;
export const checkAndRecordAiRateLimit = async (uid, options) => {
    const db = options?.db ?? adminDb;
    const now = options?.now ?? Date.now();
    const cutoff = now - AI_RATE_LIMIT_WINDOW_MS;
    const ref = db.collection('aiRateLimits').doc(uid);
    return db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.exists ? snap.data() : {};
        const timestamps = (Array.isArray(data.timestamps) ? data.timestamps : [])
            .filter((value) => typeof value === 'number')
            .filter((timestamp) => timestamp > cutoff);
        if (timestamps.length >= AI_RATE_LIMIT_MAX_REQUESTS) {
            transaction.set(ref, {
                timestamps,
                updatedAt: now,
            }, { merge: true });
            return {
                allowed: false,
                count: timestamps.length,
                limit: AI_RATE_LIMIT_MAX_REQUESTS,
                windowMs: AI_RATE_LIMIT_WINDOW_MS,
            };
        }
        const nextTimestamps = [...timestamps, now];
        transaction.set(ref, {
            timestamps: nextTimestamps,
            updatedAt: now,
        }, { merge: true });
        return {
            allowed: true,
            count: nextTimestamps.length,
            limit: AI_RATE_LIMIT_MAX_REQUESTS,
            windowMs: AI_RATE_LIMIT_WINDOW_MS,
        };
    });
};
