import client from './client';
import { get as cacheGet, set as cacheSet } from './cache';

export async function getDashboard() {
  const key = 'store:dashboard';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/store/dashboard');
  cacheSet(key, data, 30_000);
  return data;
}

export async function getBatches() {
  const { data } = await client.get('/store/batches');
  return data;
}

export async function getInventory(search, status, batchId) {
  // Do not cache inventory — it changes as user types and saves
  const { data } = await client.get('/store/inventory', {
    params: { search, status, batchId },
  });
  // Returns { records, isLocked }
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
  return data;
}

export async function downloadInventory(batchId) {
  const response = await client.get('/store/inventory/download', {
    params: batchId ? { batchId } : {},
    responseType: 'blob',
  });
  return response.data;
}
