import { AI_REQUEST_LOCK_MS, acquireAiRequest, completeAiRequest, failAiRequest, getAiRequestCacheDocId, } from './aiRequestCache.js';
const createFakeDb = () => {
    const store = new Map();
    const makeRef = (path) => ({
        path,
        async set(data, options) {
            store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
        },
    });
    const db = {
        store,
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
    return db;
};
test('completed duplicate returns cached response', async () => {
    const db = createFakeDb();
    const now = 10_000;
    const first = await acquireAiRequest('uid1', 'request-1', { db: db, now });
    expect(first.state).toBe('claimed');
    if (first.state !== 'claimed')
        throw new Error('expected claim');
    await completeAiRequest(first.cacheKey, { answer: 'cached' }, { db: db, now: now + 100 });
    const second = await acquireAiRequest('uid1', 'request-1', { db: db, now: now + 200 });
    expect(second).toMatchObject({
        state: 'completed',
        response: { answer: 'cached' },
    });
});
test('in-flight duplicate returns already in-flight while lock is active', async () => {
    const db = createFakeDb();
    const now = 20_000;
    await acquireAiRequest('uid1', 'request-2', { db: db, now });
    const duplicate = await acquireAiRequest('uid1', 'request-2', {
        db: db,
        now: now + AI_REQUEST_LOCK_MS - 1,
    });
    expect(duplicate.state).toBe('in_flight');
});
test('stale lock can be reclaimed after 120 seconds', async () => {
    const db = createFakeDb();
    const now = 30_000;
    await acquireAiRequest('uid1', 'request-3', { db: db, now });
    const reclaimed = await acquireAiRequest('uid1', 'request-3', {
        db: db,
        now: now + AI_REQUEST_LOCK_MS + 1,
    });
    expect(reclaimed.state).toBe('claimed');
});
test('document id uses uid plus 16 character request hash', () => {
    expect(getAiRequestCacheDocId('userA', 'same-request')).toMatch(/^userA_[a-f0-9]{16}$/);
    expect(getAiRequestCacheDocId('userA', 'same-request')).toBe(getAiRequestCacheDocId('userA', 'same-request'));
});
test('permanent failures are cached briefly', async () => {
    const db = createFakeDb();
    const now = 40_000;
    const claim = await acquireAiRequest('uid1', 'request-4', { db: db, now });
    if (claim.state !== 'claimed')
        throw new Error('expected claim');
    await failAiRequest(claim.cacheKey, 'permanent', { code: 'resource-exhausted', message: 'Too many requests.' }, { db: db, now: now + 1 });
    const duplicate = await acquireAiRequest('uid1', 'request-4', {
        db: db,
        now: now + 2,
    });
    expect(duplicate).toMatchObject({
        state: 'permanent_failure',
        failure: { code: 'resource-exhausted', message: 'Too many requests.' },
    });
});
