import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminInventory() {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    storeId:     searchParams.get('storeId')     || '',
    status:      searchParams.get('status')      || '',
    search:      searchParams.get('search')      || '',
    discrepancy: searchParams.get('discrepancy') || '',
    batchId:     searchParams.get('batchId')     || '',
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setLoading(true);
      const storesData = await adminApi.getStores();
      setStores(storesData);
    } catch (err) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  }

  // Auto-load if URL has filter params
  useEffect(() => {
    if (searchParams.get('storeId') || searchParams.get('discrepancy') || searchParams.get('status')) {
      loadInventory(1);
    }
  }, []); // eslint-disable-line

  async function loadInventory(page) {
    setLoading(true);
    const pageNum = page ?? pagination.page;
    try {
      const data = await adminApi.getInventory({
        ...filters,
        page: pageNum,
        pageSize: pagination.pageSize,
      });
      setRecords(data.data);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters({ ...filters, [key]: value });
  }

  async function applyFilters() {
    setPagination(prev => ({ ...prev, page: 1 }));
    await loadInventory(1);
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

  function changePage(newPage) {
    loadInventory(newPage);
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Inventory Submissions</h2>
          <p>View and filter submitted inventory records across all stores</p>
        </div>
      </div>

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
            <option value="PENDING">Awaiting Count</option>
            <option value="SUBMITTED">Counted</option>
          </select>
          <select value={filters.discrepancy} onChange={(e) => handleFilterChange('discrepancy', e.target.value)}>
            <option value="">All Variances</option>
            <option value="matched">Matched</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>
          <input
            type="text"
            placeholder="Search materials..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && applyFilters()}
          />
          <button onClick={applyFilters} className="btn btn-primary">
            Apply Filters
          </button>
          <button onClick={handleDownloadExcel} className="btn btn-success">
            Download Report (Excel)
          </button>
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div className="loading">Loading...</div>
      ) : records.length === 0 ? (
        <div className="card">
          <p>No records found. Click &quot;Apply Filters&quot; to load inventory submissions.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Material Name</th>
                    <th>Material Description</th>
                    <th>System Qty</th>
                    <th>Counted</th>
                    <th>Variance</th>
                    <th>Remarks</th>
                    <th>Status</th>
                    <th>Flag</th>
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
                            {record.difference > 0 ? '+' : ''}{record.difference}
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={record.remarks || ''}>
                        {record.remarks || '-'}
                      </td>
                      <td>
                        <span className={`badge badge-${record.status.toLowerCase()}`}>
                          {record.status === 'PENDING' ? 'Awaiting Count' : 'Counted'}
                        </span>
                      </td>
                      <td>
                        {record.isRepeat && (
                          <span className="badge badge-repeat" title="Appeared in shortage in previous cycles">
                            🔁 Repeat
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {loading && <div className="loading" style={{ marginTop: '10px' }}>Loading...</div>}

          <div className="pagination">
            <button
              onClick={() => changePage(pagination.page - 1)}
              disabled={pagination.page === 1 || loading}
              className="btn btn-secondary"
            >
              Previous
            </button>
            <span style={{ margin: '0 15px' }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalRecords} total records)
            </span>
            <button
              onClick={() => changePage(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages || loading}
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
