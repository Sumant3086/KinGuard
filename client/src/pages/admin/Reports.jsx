import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import * as cache from '../../api/cache';
import { useToast } from '../../context/ToastContext';

const STORES_KEY = 'admin:stores';
const STORES_TTL = 60_000;

export default function AdminReports() {
  const toast = useToast();
  const [records, setRecords]   = useState([]);
  const [stores, setStores]     = useState(() => cache.get(STORES_KEY) ?? []);
  const [loading, setLoading]   = useState(false);
  const [dlExcel, setDlExcel]   = useState(false);
  const [dlPdf, setDlPdf]       = useState(false);
  const [filters, setFilters]   = useState({ storeId: '', status: 'SUBMITTED', discrepancy: '' });
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    if (cache.get(STORES_KEY)) return;
    adminApi.getStores()
      .then(d => { cache.set(STORES_KEY, d, STORES_TTL); setStores(d); })
      .catch(() => {});
  }, []);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await adminApi.getReconciliationReport({
        ...filters,
        includeInactive: includeInactive ? 'true' : undefined,
      });
      setRecords(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load report. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadExcel() {
    setDlExcel(true);
    try {
      const blob = await adminApi.downloadReconciliationReport({
        ...filters,
        includeInactive: includeInactive ? 'true' : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KinMarche_Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel report downloaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Excel download failed');
    } finally { setDlExcel(false); }
  }

  async function handleDownloadPDF() {
    setDlPdf(true);
    try {
      const blob = await adminApi.downloadReconciliationReportPDF({
        ...filters,
        includeInactive: includeInactive ? 'true' : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KinMarche_Reconciliation_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF report downloaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'PDF download failed');
    } finally { setDlPdf(false); }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Reconciliation Report</h2>
          <p>Filter and export submitted inventory reconciliation data</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDownloadExcel} className="btn btn-success" disabled={dlExcel}>
            {dlExcel ? '…' : '↓'} Excel
          </button>
          <button
            onClick={handleDownloadPDF}
            className="btn btn-sm"
            disabled={dlPdf}
            style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.22)', padding: '8px 14px', fontSize: 13, fontWeight: 600 }}
          >
            {dlPdf ? '…' : '↓'} PDF
          </button>
        </div>
      </div>

      <div className="filter-card">
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
              <option value="PENDING">Awaiting Count</option>
              <option value="SUBMITTED">Counted</option>
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
          <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)', cursor: 'pointer', paddingBottom: 3 }}>
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={e => setIncludeInactive(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Include inactive stores
            </label>
          </div>
          <button onClick={loadReport} className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={loading}>
            {loading ? 'Loading...' : 'Load Report'}
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
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Date</th>
                  <th>Material Name</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>System Stock</th>
                  <th style={{ textAlign: 'right' }}>Physical Stock</th>
                  <th>Variance</th>
                  <th>Remarks</th>
                  <th>Submitted By</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{record.store.storeCode}</td>
                    <td>{new Date(record.batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ fontWeight: 600 }}>{record.materialCode}</td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>{record.materialName}</td>
                    <td style={{ textAlign: 'right', color: 'var(--t2)' }}>{record.systemQuantity}</td>
                    <td style={{ textAlign: 'right' }}>{record.physicalQuantity ?? '—'}</td>
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
                    <td style={{ fontSize: 12, color: 'var(--t3)' }}>{record.remarks || '—'}</td>
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
