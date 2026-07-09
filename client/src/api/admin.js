import client from './client';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache';

export async function getDashboard() {
  const key = 'admin:dashboard';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/dashboard');
  cacheSet(key, data, 30_000);
  return data;
}

export async function getStores() {
  const key = 'admin:stores';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/stores');
  cacheSet(key, data, 60_000);
  return data;
}

export async function createStore(storeData) {
  const { data } = await client.post('/admin/stores', storeData);
  cacheInvalidate('admin:stores', 'admin:dashboard');
  return data;
}

export async function updateStore(id, storeData) {
  const { data } = await client.patch(`/admin/stores/${id}`, storeData);
  cacheInvalidate('admin:stores', 'admin:dashboard');
  return data;
}

export async function deleteStore(id) {
  const { data } = await client.delete(`/admin/stores/${id}`);
  cacheInvalidate('admin:stores', 'admin:dashboard');
  return data;
}

export async function forceDeleteStore(id) {
  const { data } = await client.delete(`/admin/stores/${id}/force`);
  cacheInvalidate('admin:stores', 'admin:dashboard');
  return data;
}

export async function bulkDeleteStores(ids, force = false) {
  const { data } = await client.delete('/admin/stores/bulk', { data: { ids, force } });
  cacheInvalidate('admin:stores', 'admin:dashboard');
  return data;
}

export async function deleteUser(id) {
  const { data } = await client.delete(`/admin/users/${id}`);
  cacheInvalidate('admin:users');
  return data;
}

export async function deleteBatch(id) {
  const { data } = await client.delete(`/admin/batches/${id}`);
  cacheInvalidate('admin:batches', 'admin:dashboard', 'admin:uploads');
  return data;
}

export async function unlockStoreForBatch(batchId, storeId) {
  const { data } = await client.post(`/admin/batches/${batchId}/unlock-store`, { storeId });
  cacheInvalidate('admin:dashboard');
  return data;
}

export async function overrideRecord(id, payload) {
  const { data } = await client.patch(`/admin/inventory/${id}/override`, payload);
  cacheInvalidate('admin:dashboard');
  return data;
}

export async function exportAuditLogs(filters) {
  const response = await client.get('/admin/audit-logs/export', { params: filters, responseType: 'blob' });
  return response.data;
}

export async function getUsers() {
  const key = 'admin:users';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/users');
  cacheSet(key, data, 60_000);
  return data;
}

export async function createUser(userData) {
  const { data } = await client.post('/admin/users', userData);
  cacheInvalidate('admin:users');
  return data;
}

export async function updateUser(id, userData) {
  const { data } = await client.patch(`/admin/users/${id}`, userData);
  cacheInvalidate('admin:users');
  return data;
}

export async function uploadInventory(file, inventoryDate, submissionDeadline) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('inventoryDate', inventoryDate);
  if (submissionDeadline) formData.append('submissionDeadline', submissionDeadline);

  const { data } = await client.post('/admin/uploads', formData);
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches');
  return data;
}

export async function previewUpload(file, inventoryDate) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('inventoryDate', inventoryDate);

  const { data } = await client.post('/admin/uploads/preview', formData);
  return data;
}

export async function downloadSampleTemplate() {
  const response = await client.get('/admin/uploads/template', { responseType: 'blob' });
  return response.data;
}

export async function getUploads() {
  const key = 'admin:uploads';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/uploads');
  cacheSet(key, data, 30_000);
  return data;
}

export async function getInventory(filters) {
  // Do not cache — paginated and filtered, always needs fresh data
  const { data } = await client.get('/admin/inventory', { params: filters });
  return data;
}

export async function downloadInventoryExportPDF(filters) {
  const response = await client.get('/admin/inventory/export-pdf', { params: filters, responseType: 'blob' });
  return response.data;
}

export async function getBatchExportPDF(batchId) {
  const response = await client.get(`/admin/batches/${batchId}/export-pdf`, { responseType: 'blob' });
  return response.data;
}

export async function downloadInventoryExport(filters) {
  const response = await client.get('/admin/inventory/export', {
    params: filters,
    responseType: 'blob',
  });
  return response.data;
}

export async function getReconciliationReport(filters) {
  // Do not cache — filtered report, always needs fresh data
  const { data } = await client.get('/admin/reports/reconciliation', {
    params: filters,
  });
  return data;
}

export async function downloadReconciliationReport(filters) {
  const response = await client.get('/admin/reports/reconciliation/download', {
    params: filters,
    responseType: 'blob',
  });
  return response.data;
}

export async function downloadReconciliationReportPDF(filters) {
  const response = await client.get('/admin/reports/reconciliation/download-pdf', {
    params: filters,
    responseType: 'blob',
  });
  return response.data;
}

export async function sendBatchReminders(batchId) {
  const { data } = await client.post(`/admin/batches/${batchId}/send-reminders`);
  return data;
}

export async function getAuditLogs(action, limit) {
  const key = `admin:audit-logs:${limit ?? 'all'}:${action ?? 'all'}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/audit-logs', {
    params: { action, limit },
  });
  cacheSet(key, data, 60_000);
  return data;
}

export async function getBatches() {
  const key = 'admin:batches';
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/batches');
  cacheSet(key, data, 30_000);
  return data;
}

export async function updateBatch(id, data) {
  const { data: res } = await client.patch(`/admin/batches/${id}`, data);
  cacheInvalidate('admin:batches', 'admin:dashboard');
  return res;
}

export async function grantStoreExtension(payload) {
  const { data } = await client.post('/admin/batches/extend', payload);
  cacheInvalidate('admin:batches');
  return data;
}

export async function getBatchExport(batchId) {
  const response = await client.get(`/admin/batches/${batchId}/export`, { responseType: 'blob' });
  return response.data;
}

export async function getTrends(cycles = 6) {
  const key = `admin:trends:${cycles}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const { data } = await client.get('/admin/analytics/trends', { params: { cycles } });
  cacheSet(key, data, 120_000);
  return data;
}

export async function getStoreDrilldown(storeId, batchId) {
  // Do not cache drilldowns — they are on-demand detail views
  const { data } = await client.get(`/admin/stores/${storeId}/drilldown`, { params: { batchId } });
  return data;
}

export async function getNotifications() {
  // Never cache — must always reflect current server state
  const { data } = await client.get('/admin/notifications');
  return data;
}

export async function uploadInventoryForce(file, inventoryDate, submissionDeadline) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('inventoryDate', inventoryDate);
  if (submissionDeadline) formData.append('submissionDeadline', submissionDeadline);
  const { data } = await client.post('/admin/uploads?force=true', formData);
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches');
  return data;
}

