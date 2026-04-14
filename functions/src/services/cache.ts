const responseCache = new Map<string, { value: unknown; expiresAt: number }>();

export const getCachedValue = <T>(key: string): T | null => {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return cached.value as T;
};

export const setCachedValue = (key: string, value: unknown, ttlMs: number) => {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};
