import { AI_RATE_LIMIT_MAX_REQUESTS, AI_RATE_LIMIT_WINDOW_MS, checkAndRecordAiRateLimit } from './aiRateLimit.js';

const createFakeDb = () => {
  const store = new Map<string, Record<string, unknown>>();
  const makeRef = (path: string) => ({ path });
  return {
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${name}/${id}`),
    }),
    runTransaction: async <T>(callback: (transaction: {
      get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
    }) => Promise<T>) =>
      callback({
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
    const result = await checkAndRecordAiRateLimit('uid1', { db: db as never, now: now + i });
    expect(result.allowed).toBe(true);
  }

  const blocked = await checkAndRecordAiRateLimit('uid1', {
    db: db as never,
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
    await checkAndRecordAiRateLimit('uid1', { db: db as never, now: now + i });
  }

  const afterWindow = await checkAndRecordAiRateLimit('uid1', {
    db: db as never,
    now: now + AI_RATE_LIMIT_WINDOW_MS + AI_RATE_LIMIT_MAX_REQUESTS + 1,
  });

  expect(afterWindow.allowed).toBe(true);
  expect(afterWindow.count).toBe(1);
});
