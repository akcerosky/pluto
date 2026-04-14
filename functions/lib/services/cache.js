const responseCache = new Map();
export const getCachedValue = (key) => {
    const cached = responseCache.get(key);
    if (!cached)
        return null;
    if (cached.expiresAt < Date.now()) {
        responseCache.delete(key);
        return null;
    }
    return cached.value;
};
export const setCachedValue = (key, value, ttlMs) => {
    responseCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
};
