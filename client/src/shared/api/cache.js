// Module-level TTL cache. Lives for the duration of the browser tab session.
// Cleared on logout to prevent cross-user data leaks.
const store = new Map();

export function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) { store.delete(key); return undefined; }
  return entry.data;
}

export function set(key, data, ttlMs) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function invalidate(...keys) {
  keys.forEach(k => store.delete(k));
}

export function clear() {
  store.clear();
}

// Sweep expired entries every 2 minutes so the Map doesn't grow unbounded
// on long-running admin sessions. Entry expiry on read already prevents
// stale data being served, but unreachable entries would otherwise leak.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expires) store.delete(k);
  }
}, 120_000);
