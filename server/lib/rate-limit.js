// Sliding window limiter. Enough for a shared sales-app password on a public
// endpoint; not a substitute for a reverse-proxy limit in production.

function createRateLimiter({ windowMs, max }) {
    const hits = new Map();

    function prune(now) {
        hits.forEach((times, key) => {
            const kept = times.filter((t) => now - t < windowMs);
            if (kept.length) hits.set(key, kept);
            else hits.delete(key);
        });
    }

    function isLimited(key) {
        const now = Date.now();
        if (hits.size > 500) prune(now);
        const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
        if (times.length >= max) {
            hits.set(key, times);
            return true;
        }
        times.push(now);
        hits.set(key, times);
        return false;
    }

    return { isLimited };
}

module.exports = { createRateLimiter };
