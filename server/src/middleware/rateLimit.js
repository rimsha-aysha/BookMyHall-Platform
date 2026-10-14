// Small in-memory rate limiter for sensitive endpoints (login, registration),
// to slow down password guessing. Counts requests per client IP in a fixed
// window. In-memory is enough for one server instance per installation.
// Behind Render's proxy the real IP comes from X-Forwarded-For (app.js sets
// "trust proxy").
export const rateLimit = ({ windowMs, max, message }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429);
      return next(new Error(message));
    }
    return next();
  };
};
