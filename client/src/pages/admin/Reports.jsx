import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminReports() {
  const [records, setRecords] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ storeId: '', status: 'SUBMITTED', discrepancy: '' });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [storesData] = await Promise.all([adminApi.getStores()]);
      setStores(storesData);
      await loadReport();
    } finally {
      setLoading(false);
    }
  }

  async function loadReport() {
    setLoading(true);
    try {
      const data = await adminApi.getReconciliationReport(filters);
      setRecords(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    try {
      const blob = await adminApi.downloadReconciliationReport(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reconciliation_report.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed');
    }
  }

  return (
    <AdminLayout>
      <h2>Reconciliation Reports</h2>

      <div className="card">
        <div className="filters">
          <select value={filters.storeId} onChange={(e) => setFilters({ ...filters, storeId: e.target.value })}>
            <option value="">All Stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeCode} - {store.storeName}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="SUBMITTED">Submitted</option>
          </select>
          <select value={filters.discrepancy} onChange={(e) => setFilters({ ...filters, discrepancy: e.target.value })}>
            <option value="">All Discrepancies</option>
            <option value="matched">Matched</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>
          <button onClick={loadReport} className="btn btn-primary">
            Load Report
          </button>
          <button onClick={handleDownload} className="btn btn-success">
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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Inventory Date</th>
                <th>Material Code</th>
                <th>Material Name</th>
                <th>System Qty</th>
                <th>Physical Qty</th>
                <th>Difference</th>
                <th>Remarks</th>
                <th>Submitted By</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.store.storeCode}</td>
                  <td>{new Date(record.batch.inventoryDate).toLocaleDateString()}</td>
                  <td>{record.materialCode}</td>
                  <td>{record.materialName}</td>
                  <td>{record.systemQuantity}</td>
                  <td>{record.physicalQuantity}</td>
                  <td>
                    <span className={
                      record.difference === 0 ? 'badge badge-matched' :
                      record.difference < 0 ? 'badge badge-shortage' :
                      'badge badge-excess'
                    }>
                      {record.difference}
                    </span>
                  </td>
                  <td>{record.remarks || '-'}</td>
                  <td>{record.submitter?.name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
