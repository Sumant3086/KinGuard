import client from './client';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache';

async function withCache(key, ttlMs, fetcher) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await fetcher();
  cacheSet(key, data, ttlMs);
  return data;
}

// Dashboard and batch list are stable within a short window — cache to avoid
// redundant round-trips when the AM navigates between pages in the same session.
export const getDashboard = () =>
  withCache('am:dashboard', 60_000, async () => {
    const { data } = await client.get('/am/dashboard');
    return data;
  });

export const getBatches = () =>
  withCache('am:batches', 60_000, async () => {
    const { data } = await client.get('/am/batches');
    return data;
  });

// Per-batch/store data and review actions are always fetched fresh
export const getNotifications = async () => { const { data } = await client.get('/am/notifications');                                         return data; };
export const getBatchStores   = async (batchId)                   => { const { data } = await client.get(`/am/batches/${batchId}/stores`);                             return data; };
export const getStoreRecords  = async (batchId, storeId)          => { const { data } = await client.get(`/am/batches/${batchId}/stores/${storeId}/records`);          return data; };
export const updateRecord     = async (id, payload)               => { const { data } = await client.patch(`/am/records/${id}`, payload);                              return data; };
export const approveStore = async (batchId, storeId, payload) => {
  const { data } = await client.post(`/am/batches/${batchId}/stores/${storeId}/approve`, payload);
  cacheInvalidate('am:dashboard', 'am:batches');
  return data;
};

export const returnStore = async (batchId, storeId, payload) => {
  const { data } = await client.post(`/am/batches/${batchId}/stores/${storeId}/return`, payload);
  cacheInvalidate('am:dashboard', 'am:batches');
  return data;
};
