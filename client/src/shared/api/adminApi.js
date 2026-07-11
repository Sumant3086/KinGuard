import client from './client';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache';

// ── Cache TTLs (centralised) ───────────────────────────────────────────────
const TTL = {
  DASHBOARD:  120_000, // 2 min — matches server-side 2-min cache
  STORES:      60_000, // 1 min
  USERS:       60_000, // 1 min
  BATCHES:     30_000, // 30 s
  UPLOADS:     30_000, // 30 s
  AUDIT_LOGS:  60_000, // 1 min
  TRENDS:     120_000, // 2 min
};

/** Return cached value if fresh; otherwise fetch, cache, and return. */
async function withCache(key, ttl, fetcher) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const data = await fetcher();
  cacheSet(key, data, ttl);
  return data;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export function getDashboard() {
  return withCache('admin:dashboard', TTL.DASHBOARD,
    async () => { const { data } = await client.get('/admin/dashboard'); return data; });
}

// ── Stores ─────────────────────────────────────────────────────────────────
export function getStores() {
  return withCache('admin:stores', TTL.STORES,
    async () => { const { data } = await client.get('/admin/stores'); return data; });
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

// ── Users ──────────────────────────────────────────────────────────────────
export async function getUsers() {
  const { data } = await client.get('/admin/users');
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

export async function deleteUser(id) {
  const { data } = await client.delete(`/admin/users/${id}`);
  cacheInvalidate('admin:users');
  return data;
}

export async function approveUser(id) {
  const { data } = await client.post(`/admin/users/${id}/approve`);
  cacheInvalidate('admin:users', 'admin:stores', 'admin:dashboard');
  return data;
}

export async function rejectUser(id, reason) {
  const { data } = await client.post(`/admin/users/${id}/reject`, { reason });
  cacheInvalidate('admin:users', 'admin:dashboard');
  return data;
}

export async function bulkReviewUsers(action, userIds, reason) {
  const { data } = await client.post('/admin/users/bulk-review', { action, userIds, reason });
  cacheInvalidate('admin:users', 'admin:dashboard');
  return data;
}

export async function bulkDeleteUsers(userIds) {
  const { data } = await client.post('/admin/users/bulk-delete', { userIds });
  cacheInvalidate('admin:users', 'admin:dashboard');
  return data;
}

export async function previewUserBatchImport(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/admin/users/batch-import/preview', form);
  return data;
}

export async function commitUserBatchImport(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/admin/users/batch-import/commit', form);
  cacheInvalidate('admin:users', 'admin:stores', 'admin:dashboard');
  return data;
}

export async function getPlantsWithoutUsers() {
  const { data } = await client.get('/admin/users/plants-without-users');
  return data;
}

export async function batchCreateUsersForPlants(plants) {
  const { data } = await client.post('/admin/users/batch-create-for-plants', { plants });
  cacheInvalidate('admin:users', 'admin:stores', 'admin:dashboard');
  return data;
}

// ── Uploads / Inventory cycles ─────────────────────────────────────────────
export function getUploads() {
  return withCache('admin:uploads', TTL.UPLOADS,
    async () => { const { data } = await client.get('/admin/uploads'); return data; });
}

export async function uploadInventory(file, inventoryDate, submissionDeadline) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  if (submissionDeadline) form.append('submissionDeadline', submissionDeadline);
  const { data } = await client.post('/admin/uploads', form);
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches', 'admin:stores', 'admin:trends:8');
  return data;
}

export async function uploadInventoryForce(file, inventoryDate, submissionDeadline) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  if (submissionDeadline) form.append('submissionDeadline', submissionDeadline);
  const { data } = await client.post('/admin/uploads?force=true', form);
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches', 'admin:stores', 'admin:trends:8');
  return data;
}

export async function previewUpload(file, inventoryDate) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  const { data } = await client.post('/admin/uploads/preview', form);
  return data;
}

// ── Inventory records ──────────────────────────────────────────────────────
export async function getInventory(filters) {
  const { data } = await client.get('/admin/inventory', { params: filters });
  return data;
}

export async function overrideRecord(id, payload) {
  const { data } = await client.patch(`/admin/inventory/${id}/override`, payload);
  cacheInvalidate('admin:dashboard');
  return data;
}

// ── Batches ────────────────────────────────────────────────────────────────
export async function getBatches() {
  const { data } = await client.get('/admin/batches');
  return data;
}

export async function updateBatch(id, payload) {
  const { data } = await client.patch(`/admin/batches/${id}`, payload);
  cacheInvalidate('admin:batches', 'admin:dashboard');
  return data;
}

export async function deleteBatch(id) {
  const { data } = await client.delete(`/admin/batches/${id}`);
  cacheInvalidate('admin:batches', 'admin:dashboard', 'admin:uploads');
  return data;
}

export async function grantStoreExtension(payload) {
  const { data } = await client.post('/admin/batches/extend', payload);
  cacheInvalidate('admin:batches');
  return data;
}

export async function unlockStoreForBatch(batchId, storeId) {
  const { data } = await client.post(`/admin/batches/${batchId}/unlock-store`, { storeId });
  cacheInvalidate('admin:dashboard');
  return data;
}

export async function sendBatchReminders(batchId) {
  const { data } = await client.post(`/admin/batches/${batchId}/send-reminders`);
  return data;
}

// ── Reports ────────────────────────────────────────────────────────────────
export async function getReconciliationReport(filters) {
  const { data } = await client.get('/admin/reports/reconciliation', { params: filters });
  return data;
}

// ── Audit logs ─────────────────────────────────────────────────────────────
export function getAuditLogs(action, limit) {
  const key = `admin:audit-logs:${limit ?? 'all'}:${action ?? 'all'}`;
  return withCache(key, TTL.AUDIT_LOGS,
    async () => {
      const { data } = await client.get('/admin/audit-logs', { params: { action, limit } });
      return data;
    });
}

// ── Analytics ──────────────────────────────────────────────────────────────
export function getTrends(cycles = 6) {
  return withCache(`admin:trends:${cycles}`, TTL.TRENDS,
    async () => {
      const { data } = await client.get('/admin/analytics/trends', { params: { cycles } });
      return data;
    });
}

export async function getStoreDrilldown(storeId, batchId) {
  const { data } = await client.get(`/admin/stores/${storeId}/drilldown`, { params: { batchId } });
  return data;
}

// ── Notifications ──────────────────────────────────────────────────────────
export async function getNotifications() {
  const { data } = await client.get('/admin/notifications');
  return data;
}

// ── Downloads (blob responses) ─────────────────────────────────────────────
export const downloadSampleTemplate       = ()        => client.get('/admin/uploads/template',                    { responseType: 'blob' }).then(r => r.data);
export const downloadInventoryExport      = (filters) => client.get('/admin/inventory/export',                    { params: filters, responseType: 'blob' }).then(r => r.data);
export const downloadInventoryExportPDF   = (filters) => client.get('/admin/inventory/export-pdf',                { params: filters, responseType: 'blob' }).then(r => r.data);
export const downloadReconciliationReport    = (filters) => client.get('/admin/reports/reconciliation/download',     { params: filters, responseType: 'blob' }).then(r => r.data);
export const downloadReconciliationReportPDF = (filters) => client.get('/admin/reports/reconciliation/download-pdf', { params: filters, responseType: 'blob' }).then(r => r.data);
export const getBatchExport               = (id)      => client.get(`/admin/batches/${id}/export`,                { responseType: 'blob' }).then(r => r.data);
export const getBatchExportPDF            = (id)      => client.get(`/admin/batches/${id}/export-pdf`,            { responseType: 'blob' }).then(r => r.data);
export const exportAuditLogs              = (filters) => client.get('/admin/audit-logs/export',                   { params: filters, responseType: 'blob' }).then(r => r.data);
