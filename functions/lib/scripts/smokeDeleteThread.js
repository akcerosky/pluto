import { adminDb } from '../lib/firebaseAdmin.js';
import { deleteThreadHandler } from '../handlers/chatState.js';
process.env.FIREBASE_PROJECT_ID ||= 'pluto-ef61b';
process.env.GOOGLE_CLOUD_PROJECT ||= process.env.FIREBASE_PROJECT_ID;
process.env.GCLOUD_PROJECT ||= process.env.FIREBASE_PROJECT_ID;
const uid = process.env.SMOKE_UID || 'smoke-delete-thread-user';
const messageCount = Number.parseInt(process.env.SMOKE_THREAD_MESSAGE_COUNT || '2', 10);
const assertFirestoreAccessConfigured = () => {
    const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());
    const hasCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
        process.env.FIREBASE_ADMIN_REFRESH_TOKEN_JSON?.trim());
    if (!hasEmulator && !hasCredentials) {
        throw new Error('smokeDeleteThread requires either FIRESTORE_EMULATOR_HOST for local emulator runs or admin credentials via GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_ADMIN_REFRESH_TOKEN_JSON.');
    }
};
const makeThreadRef = (threadId) => adminDb.collection('users').doc(uid).collection('threads').doc(threadId);
const run = async () => {
    assertFirestoreAccessConfigured();
    const threadId = `smoke-thread-${Date.now()}`;
    const ref = makeThreadRef(threadId);
    const messagesRef = ref.collection('messages');
    await ref.set({
        id: threadId,
        title: 'Smoke delete thread',
        mode: 'Conversational',
        educationLevel: 'High School',
        objective: 'Delete verification',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount,
    });
    let batch = adminDb.batch();
    let batchWrites = 0;
    for (let index = 0; index < messageCount; index += 1) {
        const messageId = `msg-${index + 1}`;
        batch.set(messagesRef.doc(messageId), {
            id: messageId,
            role: index % 2 === 0 ? 'user' : 'assistant',
            parts: [{ type: 'text', text: index % 2 === 0 ? `hello ${index + 1}` : `reply ${index + 1}` }],
            mode: 'Conversational',
            timestamp: Date.now() + index,
        });
        batchWrites += 1;
        if (batchWrites === 450 || index === messageCount - 1) {
            await batch.commit();
            batch = adminDb.batch();
            batchWrites = 0;
        }
    }
    await deleteThreadHandler({
        auth: {
            uid,
            token: {},
        },
        data: {
            threadId,
        },
    });
    const [threadSnapshot, messagesSnapshot] = await Promise.all([
        ref.get(),
        messagesRef.get(),
    ]);
    if (threadSnapshot.exists || !messagesSnapshot.empty) {
        throw new Error(`Smoke delete failed for ${threadId}: threadExists=${threadSnapshot.exists}, remainingMessages=${messagesSnapshot.size}`);
    }
    console.log(JSON.stringify({
        ok: true,
        uid,
        threadId,
        deletedMessages: messageCount,
    }, null, 2));
};
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
