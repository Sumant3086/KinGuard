import client from './client';

export const getDashboard       = async ()                         => { const { data } = await client.get('/am/dashboard');                                             return data; };
export const getNotifications   = async ()                         => { const { data } = await client.get('/am/notifications');                                         return data; };
export const getBatches         = async ()                         => { const { data } = await client.get('/am/batches');                                               return data; };
export const getBatchStores     = async (batchId)                  => { const { data } = await client.get(`/am/batches/${batchId}/stores`);                             return data; };
export const getStoreRecords    = async (batchId, storeId)         => { const { data } = await client.get(`/am/batches/${batchId}/stores/${storeId}/records`);          return data; };
export const updateRecord       = async (id, payload)              => { const { data } = await client.patch(`/am/records/${id}`, payload);                              return data; };
export const approveStore       = async (batchId, storeId, payload)=> { const { data } = await client.post(`/am/batches/${batchId}/stores/${storeId}/approve`, payload);return data; };
export const returnStore        = async (batchId, storeId, payload)=> { const { data } = await client.post(`/am/batches/${batchId}/stores/${storeId}/return`,  payload);return data; };
