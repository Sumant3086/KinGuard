import client from './client';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache';

async function withCache(key, ttlMs, fetcher) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await fetcher();
  cacheSet(key, data, ttlMs);
  return data;
}

export function getDashboard() {
  return withCache('store:dashboard', 120_000, async () => {
    const { data } = await client.get('/store/dashboard');
    return data;
  });
}

export function getBatches() {
  return withCache('store:batches', 60_000, async () => {
    const { data } = await client.get('/store/batches');
    return data;
  });
}

export async function getInventory(search, status, batchId, page = 1, pageSize = 100) {
  // Not cached — changes as the user types and saves
  const { data } = await client.get('/store/inventory', {
    params: { search, status, batchId, page, pageSize },
  });
  return data;
}

export async function updateRecord(id, physicalQuantity, systemQuantity, remarks, shrinkageCategory) {
  const { data } = await client.patch(`/store/inventory/${id}`, {
    physicalQuantity,
    systemQuantity,
    remarks,
    shrinkageCategory,
  });
  return data;
}

export async function submitInventory(batchId) {
  const { data } = await client.post('/store/inventory/submit', { batchId });
  cacheInvalidate('store:batches', 'store:dashboard');
  return data;
}

export async function downloadInventory(batchId) {
  const response = await client.get('/store/inventory/download', {
    params: batchId ? { batchId } : {},
    responseType: 'blob',
  });
  return response.data;
}

export async function getNotifications() {
  const { data } = await client.get('/store/notifications');
  return data;
}
