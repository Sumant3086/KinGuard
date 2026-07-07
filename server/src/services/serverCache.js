const store = new Map();

export function sGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) { store.delete(key); return undefined; }
  return e.data;
}

export function sSet(key, data, ttlMs) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function sInvalidate(...keys) {
  keys.forEach(k => store.delete(k));
}
