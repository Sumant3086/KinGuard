import client from './client';

export async function getDashboard() {
  const { data } = await client.get('/admin/dashboard');
  return data;
}

export async function getStores() {
  const { data } = await client.get('/admin/stores');
  return data;
}

export async function createStore(storeData) {
  const { data } = await client.post('/admin/stores', storeData);
  return data;
}

export async function updateStore(id, storeData) {
  const { data } = await client.patch(`/admin/stores/${id}`, storeData);
  return data;
}

export async function getUsers() {
  const { data } = await client.get('/admin/users');
  return data;
}

export async function createUser(userData) {
  const { data } = await client.post('/admin/users', userData);
  return data;
}

export async function updateUser(id, userData) {
  const { data } = await client.patch(`/admin/users/${id}`, userData);
  return data;
}

export async function uploadInventory(file, inventoryDate, submissionDeadline) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('inventoryDate', inventoryDate);
  if (submissionDeadline) formData.append('submissionDeadline', submissionDeadline);

  const { data } = await client.post('/admin/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function previewUpload(file, inventoryDate) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('inventoryDate', inventoryDate);

  const { data } = await client.post('/admin/uploads/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getUploads() {
  const { data } = await client.get('/admin/uploads');
  return data;
}

export async function getInventory(filters) {
  const { data } = await client.get('/admin/inventory', { params: filters });
  return data;
}

export async function downloadInventoryExport(filters) {
  const response = await client.get('/admin/inventory/export', {
    params: filters,
    responseType: 'blob',
  });
  return response.data;
}

export async function getReconciliationReport(filters) {
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

export async function getAuditLogs(action, limit) {
  const { data } = await client.get('/admin/audit-logs', {
    params: { action, limit },
  });
  return data;
}
