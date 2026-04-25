import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../lib/firebaseAdmin.js';
import { assertAuth } from '../lib/http.js';
const deleteThreadSchema = z.object({
    threadId: z.string().trim().min(1).max(200),
});
const threadRef = (uid, threadId) => adminDb.collection('users').doc(uid).collection('threads').doc(threadId);
const deleteCollectionInBatches = async (collectionPath, batchSize = 400) => {
    while (true) {
        const snapshot = await collectionPath.limit(batchSize).get();
        if (snapshot.empty) {
            break;
        }
        const batch = adminDb.batch();
        snapshot.docs.forEach((docSnapshot) => {
            batch.delete(docSnapshot.ref);
        });
        await batch.commit();
        if (snapshot.size < batchSize) {
            break;
        }
    }
};
export const deleteThreadHandler = async (request) => {
    const uid = assertAuth(request);
    const payload = deleteThreadSchema.parse(request.data ?? {});
    const ref = threadRef(uid, payload.threadId);
    try {
        await deleteCollectionInBatches(ref.collection('messages'));
        await ref.delete();
    }
    catch (error) {
        logger.error('delete_thread_failed', {
            eventType: 'delete_thread_failed',
            uid,
            threadId: payload.threadId,
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw new HttpsError('internal', 'Unable to delete this thread right now.');
    }
    return {
        ok: true,
        threadId: payload.threadId,
    };
};
