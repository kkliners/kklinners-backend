// Tiny in-memory limiter. Keyed by something the caller chooses (not the IP, which is shared
// behind proxies), so one noisy payment reference can't hammer Paystack.
const rateLimit = ({ windowMs, max, key, message = "Too many tries. Please wait a moment." }) => {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, list] of hits) {
      const fresh = list.filter((t) => t > cutoff);
      fresh.length ? hits.set(k, fresh) : hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    if (!k) return next();
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => t > now - windowMs);
    if (list.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ success: false, message });
    }
    list.push(now);
    hits.set(k, list);
    return next();
  };
};

module.exports = rateLimit;
