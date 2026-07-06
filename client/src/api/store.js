import client from './client';

export async function getDashboard() {
  const { data } = await client.get('/store/dashboard');
  return data;
}

export async function getBatches() {
  const { data } = await client.get('/store/batches');
  return data;
}

export async function getInventory(search, status, batchId) {
  const { data } = await client.get('/store/inventory', {
    params: { search, status, batchId },
  });
  // Returns { records, isLocked }
  return data;
}

export async function updateRecord(id, physicalQuantity, remarks) {
  const { data } = await client.patch(`/store/inventory/${id}`, {
    physicalQuantity,
    remarks,
  });
  return data;
}

export async function submitInventory(batchId) {
  const { data } = await client.post('/store/inventory/submit', { batchId });
  return data;
}

export async function downloadInventory() {
  const response = await client.get('/store/inventory/download', {
    responseType: 'blob',
  });
  return response.data;
}
