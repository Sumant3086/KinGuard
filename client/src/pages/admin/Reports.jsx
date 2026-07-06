import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminReports() {
  const [records, setRecords] = useState([]);
  const [stores, setStores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ storeId: '', status: 'SUBMITTED', discrepancy: '' });

  useEffect(() => {
    adminApi.getStores().then(setStores).catch(() => {}).finally(() => setLoading(false));
  }, []);

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
      alert(err.response?.data?.error || 'Download failed');
    }
  }

  return (
    <AdminLayout title="Reports">
      <div className="page-header">
        <h2>Reconciliation Reports</h2>
      </div>

      <div className="card">
        <div className="filters">
          <div className="filter-group">
            <span className="filter-label">Store</span>
            <select value={filters.storeId} onChange={(e) => setFilters({ ...filters, storeId: e.target.value })}>
              <option value="">All Stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeCode} — {store.storeName}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SUBMITTED">Submitted</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Discrepancy</span>
            <select value={filters.discrepancy} onChange={(e) => setFilters({ ...filters, discrepancy: e.target.value })}>
              <option value="">All</option>
              <option value="matched">Matched</option>
              <option value="shortage">Shortage</option>
              <option value="excess">Excess</option>
            </select>
          </div>
          <button onClick={loadReport} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            Load Report
          </button>
          <button onClick={handleDownload} className="btn btn-success" style={{ alignSelf: 'flex-end' }}>
            Download Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="loading-spinner" />Loading…</div>
      ) : records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <p>No records found. Apply filters and click Load Report.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Date</th>
                  <th>Material Name</th>
                  <th>Material Description</th>
                  <th>SYS</th>
                  <th>Sold</th>
                  <th>Diff</th>
                  <th>Remarks</th>
                  <th>Submitted By</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.store.storeCode}</td>
                    <td>{new Date(record.batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ fontWeight: 600 }}>{record.materialCode}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{record.materialName}</td>
                    <td>{record.systemQuantity}</td>
                    <td>{record.physicalQuantity ?? '—'}</td>
                    <td>
                      {record.difference !== null ? (
                        <span className={
                          record.difference === 0 ? 'badge badge-matched' :
                          record.difference < 0   ? 'badge badge-shortage' :
                          'badge badge-excess'
                        }>
                          {record.difference > 0 ? '+' : ''}{record.difference}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{record.remarks || '—'}</td>
                    <td>{record.submitter?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
