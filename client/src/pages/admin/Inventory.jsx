import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminInventory() {
  const [records, setRecords] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ storeId: '', status: '', search: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [recordsData, storesData] = await Promise.all([
        adminApi.getInventory(filters),
        adminApi.getStores(),
      ]);
      setRecords(recordsData);
      setStores(storesData);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key, value) {
    setFilters({ ...filters, [key]: value });
  }

  async function applyFilters() {
    setLoading(true);
    try {
      const data = await adminApi.getInventory(filters);
      setRecords(data);
    } finally {
      setLoading(false);
    }
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
          <input
            type="text"
            placeholder="Search materials..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
          <button onClick={applyFilters} className="btn btn-primary">
            Apply Filters
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
      )}
    </AdminLayout>
  );
}
