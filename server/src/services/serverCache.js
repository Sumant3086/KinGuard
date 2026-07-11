const store = new Map();

export function sGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) { store.delete(key); return undefined; }
  return e.data;
}

export function sSet(key, data, ttlMs = 60_000) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function sInvalidate(...keys) {
  keys.forEach(k => store.delete(k));
}

// Sweep stale entries every 5 minutes so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expires) store.delete(k);
  }
}, 300_000).unref();
