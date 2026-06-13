// Tiny in-memory rate limiter for sensitive endpoints (admin login).
//
// Zero-dependency: a fixed-window counter keyed by client IP, scoped to one
// process. State resets on restart — fine for a single-container deployment
// whose only goal is to blunt online password brute-forcing. Each limiter owns
// its own bucket map.

export function makeRateLimiter({ max = 10, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  return {
    // Count one hit against `key`. Returns { allowed, retryAfterMs }.
    check(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b || now - b.start > windowMs) {
        b = { start: now, count: 0 };
        buckets.set(key, b);
      }
      b.count += 1;
      // Opportunistic cleanup so the map can't grow without bound.
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k);
      }
      const allowed = b.count <= max;
      return { allowed, retryAfterMs: allowed ? 0 : b.start + windowMs - now };
    },
    // Clear a key's bucket (call on success so a legit user isn't penalised).
    reset(key) {
      buckets.delete(key);
    },
  };
}

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
