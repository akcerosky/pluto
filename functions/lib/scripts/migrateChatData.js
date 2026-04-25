import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/firebaseAdmin.js';
const MIGRATION_VERSION = 1;
const MESSAGE_BATCH_LIMIT = 400;
const normalizeArgs = () => {
    const args = process.argv.slice(2);
    const getValue = (flag) => {
        const index = args.indexOf(flag);
        return index >= 0 ? args[index + 1] : undefined;
    };
    return {
        uid: getValue('--uid'),
        limit: Number(getValue('--limit') ?? 0) || undefined,
        force: args.includes('--force'),
    };
};
const normalizeMessageParts = (message) => {
    if (Array.isArray(message.parts) && message.parts.length > 0) {
        return message.parts;
    }
    if (typeof message.content === 'string' && message.content.trim()) {
        return [{ type: 'text', text: message.content }];
    }
    return [];
};
const chunk = (items, size) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};
const userDocRef = (uid) => adminDb.collection('users').doc(uid);
const getUserRefsForBulkMigration = async (limit) => {
    const appStateSnapshots = await adminDb.collectionGroup('appState').get();
    const userRefs = new Map();
    for (const docSnap of appStateSnapshots.docs) {
        if (docSnap.id !== 'main') {
            continue;
        }
        const userRef = docSnap.ref.parent.parent;
        if (!userRef) {
            continue;
        }
        userRefs.set(userRef.id, userRef);
        if (limit && userRefs.size >= limit) {
            break;
        }
    }
    return [...userRefs.values()];
};
const migrateUser = async (uid, force = false) => {
    const root = userDocRef(uid);
    const appStateRef = root.collection('appState').doc('main');
    const migrationRef = root.collection('meta').doc('migration');
    const [appStateSnap, migrationSnap] = await Promise.all([appStateRef.get(), migrationRef.get()]);
    if (!appStateSnap.exists) {
        return { uid, skipped: 'no_app_state' };
    }
    if (!force && migrationSnap.exists && migrationSnap.data()?.state === 'completed') {
        return { uid, skipped: 'already_completed' };
    }
    const legacy = (appStateSnap.data() ?? {});
    const threads = Array.isArray(legacy.threads) ? legacy.threads : [];
    const projects = Array.isArray(legacy.projects) ? legacy.projects : [];
    await migrationRef.set({
        version: MIGRATION_VERSION,
        state: 'running',
        startedAt: Date.now(),
        sourceDocUpdatedAt: Number(legacy.updatedAt) || 0,
        migratedThreadCount: 0,
        migratedMessageCount: 0,
        lastError: null,
    }, { merge: true });
    let migratedMessageCount = 0;
    try {
        for (const project of projects) {
            await root.collection('projects').doc(project.id).set({
                id: project.id,
                name: project.name,
                description: project.description ?? '',
                color: project.color ?? '#8A2BE2',
                createdAt: Number(project.createdAt) || Date.now(),
            }, { merge: true });
        }
        for (const thread of threads) {
            const messages = Array.isArray(thread.messages) ? thread.messages : [];
            await root.collection('threads').doc(thread.id).set({
                id: thread.id,
                title: thread.title || 'New Chat',
                mode: thread.mode || 'Conversational',
                educationLevel: thread.educationLevel || 'High School',
                objective: thread.objective || 'General Learning',
                createdAt: Number(thread.createdAt) || Date.now(),
                updatedAt: Number(thread.updatedAt) || Number(thread.createdAt) || Date.now(),
                projectId: thread.projectId ?? null,
                contextSummary: thread.contextSummary ?? null,
                messageCount: messages.length,
            }, { merge: true });
            for (const messageBatch of chunk(messages, MESSAGE_BATCH_LIMIT)) {
                const batch = adminDb.batch();
                messageBatch.forEach((message) => {
                    const messageRef = root
                        .collection('threads')
                        .doc(thread.id)
                        .collection('messages')
                        .doc(message.id);
                    batch.set(messageRef, {
                        id: message.id,
                        role: message.role,
                        parts: normalizeMessageParts(message),
                        mode: message.mode || thread.mode || 'Conversational',
                        timestamp: Number(message.timestamp) || Date.now(),
                    }, { merge: true });
                });
                await batch.commit();
            }
            migratedMessageCount += messages.length;
            await migrationRef.set({
                migratedThreadCount: FieldValue.increment(1),
                migratedMessageCount,
            }, { merge: true });
        }
        await Promise.all([
            migrationRef.set({
                version: MIGRATION_VERSION,
                state: 'completed',
                completedAt: Date.now(),
                migratedThreadCount: threads.length,
                migratedMessageCount,
                lastError: null,
            }, { merge: true }),
            appStateRef.set({
                activeThreadId: legacy.activeThreadId ?? null,
                updatedAt: Date.now(),
                migrationVersion: MIGRATION_VERSION,
                migrationState: 'completed',
                threads: FieldValue.delete(),
                projects: FieldValue.delete(),
            }, { merge: true }),
        ]);
        return {
            uid,
            migratedThreadCount: threads.length,
            migratedMessageCount,
            migratedProjectCount: projects.length,
        };
    }
    catch (error) {
        await migrationRef.set({
            version: MIGRATION_VERSION,
            state: 'failed',
            completedAt: Date.now(),
            lastError: error instanceof Error ? error.message : String(error),
        }, { merge: true });
        throw error;
    }
};
const main = async () => {
    const options = normalizeArgs();
    const userDocs = options.uid
        ? [userDocRef(options.uid)]
        : await getUserRefsForBulkMigration(options.limit ?? 1000);
    let migratedUsers = 0;
    let skippedUsers = 0;
    for (const userRef of userDocs) {
        try {
            const result = await migrateUser(userRef.id, options.force);
            if ('skipped' in result) {
                skippedUsers += 1;
                console.log(JSON.stringify(result));
            }
            else {
                migratedUsers += 1;
                console.log(JSON.stringify(result));
            }
        }
        catch (error) {
            console.error(JSON.stringify({
                uid: userRef.id,
                error: error instanceof Error ? error.message : String(error),
            }));
            throw error;
        }
    }
    console.log(JSON.stringify({
        ok: true,
        migratedUsers,
        skippedUsers,
    }));
};
void main();
