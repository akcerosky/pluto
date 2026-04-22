import { AI_RATE_LIMIT_MAX_REQUESTS, AI_RATE_LIMIT_WINDOW_MS, checkAndRecordAiRateLimit } from './aiRateLimit.js';
const createFakeDb = () => {
    const store = new Map();
    const makeRef = (path) => ({ path });
    return {
        collection: (name) => ({
            doc: (id) => makeRef(`${name}/${id}`),
        }),
        runTransaction: async (callback) => callback({
            get: async (ref) => ({
                exists: store.has(ref.path),
                data: () => store.get(ref.path),
            }),
            set: (ref, data, options) => {
                store.set(ref.path, options?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : data);
            },
        }),
    };
};
test('allows first 20 requests in a minute and rejects the 21st', async () => {
    const db = createFakeDb();
    const now = 100_000;
    for (let i = 0; i < AI_RATE_LIMIT_MAX_REQUESTS; i += 1) {
        const result = await checkAndRecordAiRateLimit('uid1', { db: db, now: now + i });
        expect(result.allowed).toBe(true);
    }
    const blocked = await checkAndRecordAiRateLimit('uid1', {
        db: db,
        now: now + AI_RATE_LIMIT_MAX_REQUESTS,
    });
    expect(blocked).toMatchObject({
        allowed: false,
        count: AI_RATE_LIMIT_MAX_REQUESTS,
        limit: AI_RATE_LIMIT_MAX_REQUESTS,
        windowMs: AI_RATE_LIMIT_WINDOW_MS,
    });
});
test('prunes old timestamps outside the sliding window', async () => {
    const db = createFakeDb();
    const now = 200_000;
    for (let i = 0; i < AI_RATE_LIMIT_MAX_REQUESTS; i += 1) {
        await checkAndRecordAiRateLimit('uid1', { db: db, now: now + i });
    }
    const afterWindow = await checkAndRecordAiRateLimit('uid1', {
        db: db,
        now: now + AI_RATE_LIMIT_WINDOW_MS + 1,
    });
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.count).toBe(1);
});
