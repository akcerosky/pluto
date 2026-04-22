import {
  GEMINI_503_SPIKE_THRESHOLD,
  GEMINI_503_WINDOW_MS,
  getGemini503WindowBucket,
  recordGemini503,
} from './gemini503Monitor.js';

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
        set: (ref, data) => {
          store.set(ref.path, data);
        },
      }),
  };
};

test('503 monitor emits spike state at threshold with affected users', async () => {
  const db = createFakeDb();
  const now = 300_000;
  let result = await recordGemini503('uid0', 'request0', { db: db as never, now });

  for (let i = 1; i < GEMINI_503_SPIKE_THRESHOLD; i += 1) {
    result = await recordGemini503(`uid${i % 3}`, `request${i}`, {
      db: db as never,
      now: now + i,
    });
  }

  expect(result.count).toBe(GEMINI_503_SPIKE_THRESHOLD);
  expect(result.shouldAlert).toBe(true);
  expect(result.affectedUids.sort()).toEqual(['uid0', 'uid1', 'uid2']);
});

test('503 monitor resets when the five minute bucket changes', async () => {
  const db = createFakeDb();
  const now = 600_000;
  await recordGemini503('uid1', 'request1', { db: db as never, now });
  const next = await recordGemini503('uid2', 'request2', {
    db: db as never,
    now: now + GEMINI_503_WINDOW_MS,
  });

  expect(next.count).toBe(1);
  expect(next.windowBucket).toBe(getGemini503WindowBucket(now + GEMINI_503_WINDOW_MS));
  expect(next.affectedUids).toEqual(['uid2']);
});
