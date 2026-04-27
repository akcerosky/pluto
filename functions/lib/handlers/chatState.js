import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { z } from 'zod';
import { adminDb } from '../lib/firebaseAdmin.js';
import { assertAuth } from '../lib/http.js';
const deleteThreadSchema = z.object({
    threadId: z.string().trim().min(1).max(200),
});
const threadRef = (uid, threadId) => adminDb.collection('users').doc(uid).collection('threads').doc(threadId);
const countMessages = async (collectionRef, pageSize = 400) => {
    let total = 0;
    let lastDoc = null;
    while (true) {
        let query = collectionRef.orderBy('__name__').limit(pageSize);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }
        const snapshot = await query.get();
        if (snapshot.empty) {
            break;
        }
        total += snapshot.size;
        lastDoc = snapshot.docs.at(-1) ?? null;
        if (snapshot.size < pageSize) {
            break;
        }
    }
    return total;
};
const deleteThreadRecursively = async (ref) => {
    let retriedWrites = 0;
    let failedWrites = 0;
    const bulkWriter = adminDb.bulkWriter();
    bulkWriter.onWriteError((error) => {
        const willRetry = error.failedAttempts < 3;
        if (willRetry) {
            retriedWrites += 1;
        }
        else {
            failedWrites += 1;
        }
        logger.warn('delete_thread_write_error', {
            eventType: 'delete_thread_write_error',
            path: error.documentRef.path,
            code: error.code,
            message: error.message,
            failedAttempts: error.failedAttempts,
            willRetry,
        });
        return willRetry;
    });
    await adminDb.recursiveDelete(ref, bulkWriter);
    await bulkWriter.close();
    return { retriedWrites, failedWrites };
};
export const deleteThreadHandler = async (request) => {
    const uid = assertAuth(request);
    const payload = deleteThreadSchema.parse(request.data ?? {});
    const ref = threadRef(uid, payload.threadId);
    const messagesRef = ref.collection('messages');
    logger.info('delete_thread_started', {
        eventType: 'delete_thread_started',
        uid,
        threadId: payload.threadId,
        threadPath: ref.path,
    });
    try {
        const [threadSnapshot, messageCount] = await Promise.all([
            ref.get(),
            countMessages(messagesRef),
        ]);
        logger.info('delete_thread_preflight', {
            eventType: 'delete_thread_preflight',
            uid,
            threadId: payload.threadId,
            threadExists: threadSnapshot.exists,
            messageCount,
        });
        if (!threadSnapshot.exists) {
            logger.info('delete_thread_missing', {
                eventType: 'delete_thread_missing',
                uid,
                threadId: payload.threadId,
            });
            return {
                ok: true,
                threadId: payload.threadId,
                deletedMessages: 0,
                threadPreviouslyMissing: true,
            };
        }
        const startedAt = Date.now();
        const deletionResult = await deleteThreadRecursively(ref);
        const remainingMessages = await countMessages(messagesRef);
        const threadExistsAfterDelete = (await ref.get()).exists;
        logger.info('delete_thread_completed', {
            eventType: 'delete_thread_completed',
            uid,
            threadId: payload.threadId,
            deletedMessagesEstimate: messageCount,
            remainingMessages,
            threadExistsAfterDelete,
            retriedWrites: deletionResult.retriedWrites,
            failedWrites: deletionResult.failedWrites,
            latencyMs: Date.now() - startedAt,
        });
        if (threadExistsAfterDelete || remainingMessages > 0 || deletionResult.failedWrites > 0) {
            logger.error('delete_thread_incomplete', {
                eventType: 'delete_thread_incomplete',
                uid,
                threadId: payload.threadId,
                remainingMessages,
                threadExistsAfterDelete,
                retriedWrites: deletionResult.retriedWrites,
                failedWrites: deletionResult.failedWrites,
            });
            throw new HttpsError('internal', 'Unable to fully delete this thread right now.');
        }
    }
    catch (error) {
        logger.error('delete_thread_failed', {
            eventType: 'delete_thread_failed',
            uid,
            threadId: payload.threadId,
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw error instanceof HttpsError
            ? error
            : new HttpsError('internal', 'Unable to delete this thread right now.');
    }
    return {
        ok: true,
        threadId: payload.threadId,
    };
};
