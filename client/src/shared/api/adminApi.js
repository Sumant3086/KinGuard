import client from './client';
import { get as cacheGet, set as cacheSet, invalidate as cacheInvalidate } from './cache';

// ── Cache TTLs (centralised) ───────────────────────────────────────────────
const TTL = {
  DASHBOARD:  120_000, // 2 min — reduced from 5 min so data feels fresh
  STORES:     180_000, // 3 min
  USERS:      120_000, // 2 min
  BATCHES:     60_000, // 1 min
  UPLOADS:     60_000, // 1 min
  AUDIT_LOGS: 120_000, // 2 min
  TRENDS:     300_000, // 5 min
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
export function getUsers() {
  return withCache('admin:users', TTL.USERS,
    async () => { const { data } = await client.get('/admin/users'); return data; });
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
  const { data } = await client.post('/admin/users/batch-import/preview', form, { timeout: FILE_TIMEOUT });
  return data;
}

export async function commitUserBatchImport(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/admin/users/batch-import/commit', form, { timeout: FILE_TIMEOUT });
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

// File-processing requests can take up to 2 minutes — match server fileTimeout
const FILE_TIMEOUT = 120_000;

export async function uploadInventory(file, inventoryDate, submissionDeadline) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  if (submissionDeadline) form.append('submissionDeadline', submissionDeadline);
  const { data } = await client.post('/admin/uploads', form, { timeout: FILE_TIMEOUT });
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches', 'admin:stores', 'admin:trends:8');
  return data;
}

export async function uploadInventoryForce(file, inventoryDate, submissionDeadline) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  if (submissionDeadline) form.append('submissionDeadline', submissionDeadline);
  const { data } = await client.post('/admin/uploads?force=true', form, { timeout: FILE_TIMEOUT });
  cacheInvalidate('admin:dashboard', 'admin:uploads', 'admin:batches', 'admin:stores', 'admin:trends:8');
  return data;
}

export async function previewUpload(file, inventoryDate) {
  const form = new FormData();
  form.append('file', file);
  form.append('inventoryDate', inventoryDate);
  const { data } = await client.post('/admin/uploads/preview', form, { timeout: FILE_TIMEOUT });
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
export function getBatches() {
  return withCache('admin:batches-client', 60_000,
    async () => { const { data } = await client.get('/admin/batches'); return data; });
}

export async function updateBatch(id, payload) {
  const { data } = await client.patch(`/admin/batches/${id}`, payload);
  cacheInvalidate('admin:batches-client', 'admin:dashboard');
  return data;
}

export async function deleteBatch(id) {
  const { data } = await client.delete(`/admin/batches/${id}`);
  cacheInvalidate('admin:batches-client', 'admin:dashboard', 'admin:uploads');
  return data;
}

export async function grantStoreExtension(payload) {
  const { data } = await client.post('/admin/batches/extend', payload);
  cacheInvalidate('admin:batches-client');
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

// ── Area Manager Management ────────────────────────────────────────────────
export function getAreaManagers() {
  return withCache('admin:area-managers', 120_000,
    async () => { const { data } = await client.get('/admin/area-managers'); return data; });
}
export async function assignStoreAM(storeId, areaManagerId) {
  const { data } = await client.patch(`/admin/stores/${storeId}/assign-am`, { areaManagerId });
  cacheInvalidate('admin:area-managers', 'admin:stores');
  return data;
}
export async function batchAssignAMStores(amId, storeIds) {
  const { data } = await client.patch(`/admin/area-managers/${amId}/stores`, { storeIds });
  cacheInvalidate('admin:area-managers', 'admin:stores');
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
// Large exports can take time — use 120s to match the server fileTimeout.
const DL = { responseType: 'blob', timeout: FILE_TIMEOUT };
export const downloadSampleTemplate          = ()        => client.get('/admin/uploads/template',                    { ...DL }).then(r => r.data);
export const downloadInventoryExport         = (filters) => client.get('/admin/inventory/export',                    { ...DL, params: filters }).then(r => r.data);
export const downloadInventoryExportPDF      = (filters) => client.get('/admin/inventory/export-pdf',                { ...DL, params: filters }).then(r => r.data);
export const downloadReconciliationReport    = (filters) => client.get('/admin/reports/reconciliation/download',     { ...DL, params: filters }).then(r => r.data);
export const downloadReconciliationReportPDF = (filters) => client.get('/admin/reports/reconciliation/download-pdf', { ...DL, params: filters }).then(r => r.data);
export const getBatchExport                  = (id)      => client.get(`/admin/batches/${id}/export`,                { ...DL }).then(r => r.data);
export const getBatchExportPDF               = (id)      => client.get(`/admin/batches/${id}/export-pdf`,            { ...DL }).then(r => r.data);
export const exportAuditLogs                 = (filters) => client.get('/admin/audit-logs/export',                   { ...DL, params: filters }).then(r => r.data);
