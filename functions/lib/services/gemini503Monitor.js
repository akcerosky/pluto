import { logger } from 'firebase-functions';
import { adminDb } from '../lib/firebaseAdmin.js';
export const GEMINI_503_WINDOW_MS = 5 * 60 * 1000;
export const GEMINI_503_SPIKE_THRESHOLD = 10;
export const getGemini503WindowBucket = (now) => Math.floor(now / GEMINI_503_WINDOW_MS) * GEMINI_503_WINDOW_MS;
export const recordGemini503 = async (uid, requestId, options) => {
    const db = options?.db ?? adminDb;
    const now = options?.now ?? Date.now();
    const windowBucket = getGemini503WindowBucket(now);
    const cutoff = now - GEMINI_503_WINDOW_MS;
    const ref = db.collection('aiMonitoring').doc('gemini503Window');
    const result = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.exists
            ? snap.data()
            : {};
        const sameWindow = data.windowBucket === windowBucket;
        const timestamps = sameWindow
            ? (Array.isArray(data.timestamps) ? data.timestamps : [])
                .filter((value) => typeof value === 'number')
                .filter((timestamp) => timestamp > cutoff)
            : [];
        const affectedUids = sameWindow
            ? (Array.isArray(data.affectedUids) ? data.affectedUids : [])
                .filter((value) => typeof value === 'string')
            : [];
        const nextTimestamps = [...timestamps, now];
        const nextAffectedUids = Array.from(new Set([...affectedUids, uid]));
        const shouldAlert = nextTimestamps.length >= GEMINI_503_SPIKE_THRESHOLD && data.alertEmitted !== true;
        transaction.set(ref, {
            windowBucket,
            timestamps: nextTimestamps,
            count: nextTimestamps.length,
            affectedUids: nextAffectedUids,
            alertEmitted: data.alertEmitted === true || shouldAlert,
            updatedAt: now,
            latestRequestId: requestId,
        }, { merge: false });
        return {
            count: nextTimestamps.length,
            windowBucket,
            affectedUids: nextAffectedUids,
            shouldAlert,
        };
    });
    if (result.shouldAlert) {
        logger.error('gemini_503_spike_detected', {
            eventType: 'gemini_503_spike_detected',
            count: result.count,
            time_window: '5min',
            affected_users: result.affectedUids,
            windowBucket: result.windowBucket,
            latestRequestId: requestId,
        });
    }
    return result;
};
