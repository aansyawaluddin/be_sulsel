const cache = new Map();

export const getCache = (key) => {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        cache.delete(key);
        return null;
    }
    return item.data;
};

export const setCache = (key, data, ttlSeconds = 30) => {
    cache.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000
    });
};

export const deleteCache = (key) => {
    cache.delete(key);
};

export const deleteCacheByPrefix = (prefix) => {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) cache.delete(key);
    }
};