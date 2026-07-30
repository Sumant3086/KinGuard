import { logger } from '../config/logger.js';

const store = new Map();
const MAX_ENTRIES = 10_000; // defensive cap — all keys are derived from user IDs so this is never hit in practice

export function sGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) { store.delete(key); return undefined; }
  return e.data;
}

export function sSet(key, data, ttlMs = 60_000) {
  if (store.size >= MAX_ENTRIES) {
    logger.warn('Server cache full — skipping write', { maxEntries: MAX_ENTRIES, key });
    return;
  }
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
