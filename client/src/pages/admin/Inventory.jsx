import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminInventory() {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ storeId: '', status: '', search: '', discrepancy: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [storesData] = await Promise.all([
        adminApi.getStores(),
      ]);
      setStores(storesData);
      await loadInventory();
    } finally {
      setLoading(false);
    }
  }

  async function loadInventory() {
    setLoading(true);
    try {
      const data = await adminApi.getInventory({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      setRecords(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters({ ...filters, [key]: value });
  }

  async function applyFilters() {
    setPagination({ ...pagination, page: 1 });
    await loadInventory();
  }

  async function handleDownloadExcel() {
    try {
      const blob = await adminApi.downloadInventoryExport(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to download Excel');
    }
  }

  async function changePage(newPage) {
    setPagination({ ...pagination, page: newPage });
    await loadInventory();
  }

  return (
    <AdminLayout>
      <h2>Inventory Records</h2>

      <div className="card">
        <div className="filters">
          <select value={filters.storeId} onChange={(e) => handleFilterChange('storeId', e.target.value)}>
            <option value="">All Stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeCode} - {store.storeName}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="SUBMITTED">Submitted</option>
          </select>
          <select value={filters.discrepancy} onChange={(e) => handleFilterChange('discrepancy', e.target.value)}>
            <option value="">All Discrepancies</option>
            <option value="matched">Matched</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>
          <input
            type="text"
            placeholder="Search materials..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
          <button onClick={applyFilters} className="btn btn-primary">
            Apply Filters
          </button>
          <button onClick={handleDownloadExcel} className="btn btn-success">
            Download Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : records.length === 0 ? (
        <div className="card">
          <p>No records found.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>System Qty</th>
                  <th>Physical Qty</th>
                  <th>Difference</th>
                  <th>Remarks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.store.storeCode}</td>
                    <td>{record.materialCode}</td>
                    <td>{record.materialName}</td>
                    <td>{record.systemQuantity}</td>
                    <td>{record.physicalQuantity ?? '-'}</td>
                    <td>
                      {record.difference !== null ? (
                        <span className={
                          record.difference === 0 ? 'badge badge-matched' :
                          record.difference < 0 ? 'badge badge-shortage' :
                          'badge badge-excess'
                        }>
                          {record.difference}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={record.remarks || ''}>
                      {record.remarks || '-'}
                    </td>
                    <td>
                      <span className={`badge badge-${record.status.toLowerCase()}`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="pagination">
            <button 
              onClick={() => changePage(pagination.page - 1)} 
              disabled={pagination.page === 1}
              className="btn btn-secondary"
            >
              Previous
            </button>
            <span style={{ margin: '0 15px' }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalRecords} total records)
            </span>
            <button 
              onClick={() => changePage(pagination.page + 1)} 
              disabled={pagination.page === pagination.totalPages}
              className="btn btn-secondary"
            >
              Next
            </button>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
