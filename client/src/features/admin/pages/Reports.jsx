import { useState, useEffect } from 'react';
import AdminLayout from '../layout/AdminLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { LoadingCard } from '../../../shared/components/ui/LoadingCard';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as adminApi from '../../../shared/api/adminApi';
import * as cache from '../../../shared/api/cache';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDate, fmtISO } from '../../../shared/utils/dateUtils';

const STORES_KEY  = 'admin:stores';
const STORES_TTL  = 60_000;
const BATCHES_KEY = 'admin:batches';
const BATCHES_TTL = 30_000;

const ReportIcon = (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

export default function Reports() {
  const toast = useToast();
  const { downloading: dlExcel, download: downloadExcel } = useDownload();
  const { downloading: dlPdf,   download: downloadPdf   } = useDownload();

  const [records, setRecords]   = useState([]);
  const [stores, setStores]     = useState(() => cache.get(STORES_KEY)  ?? []);
  const [batches, setBatches]   = useState(() => cache.get(BATCHES_KEY) ?? []);
  const [loading, setLoading]   = useState(false);
  const [filters, setFilters]   = useState({ batchId: '', storeId: '', status: 'SUBMITTED', discrepancy: '' });
  const [includeInactive, setIncludeInactive] = useState(false);
  // Track params used for the current result set so downloads always match what's on screen
  const [loadedParams, setLoadedParams] = useState(null);

  useEffect(() => {
    const tasks = [];
    if (!cache.get(STORES_KEY))  tasks.push(adminApi.getStores().then(d  => { cache.set(STORES_KEY,  d, STORES_TTL);  setStores(d);  }));
    if (!cache.get(BATCHES_KEY)) tasks.push(adminApi.getBatches().then(d => { cache.set(BATCHES_KEY, d, BATCHES_TTL); setBatches(d); }));
    if (tasks.length) Promise.all(tasks).catch(() => toast.error('Failed to load stores or cycles. Please refresh.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function buildParams() {
    return { ...filters, includeInactive: includeInactive ? 'true' : 'false' };
  }

  async function loadReport() {
    setLoading(true);
    const params = buildParams();
    try {
      setRecords(await adminApi.getReconciliationReport(params));
      setLoadedParams(params);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load report. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const today = fmtISO(new Date());
  const activeParams = loadedParams || buildParams();

  const handleDownloadExcel = () =>
    downloadExcel(adminApi.downloadReconciliationReport, `KinGuard_Reconciliation_${today}.xlsx`, activeParams);

  const handleDownloadPdf = () =>
    downloadPdf(adminApi.downloadReconciliationReportPDF, `KinGuard_Reconciliation_${today}.pdf`, activeParams);

  return (
    <AdminLayout>
      <PageHeader
        title="Reconciliation Report"
        subtitle="Filter and export submitted inventory reconciliation data"
        actions={
          <>
            <button onClick={handleDownloadExcel} className="btn btn-success" disabled={dlExcel || records.length === 0}>
              {dlExcel ? '…' : '↓'} Excel
            </button>
            <button
              onClick={handleDownloadPdf}
              className="btn btn-sm"
              disabled={dlPdf || records.length === 0}
              style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.22)', padding: '8px 14px', fontSize: 13, fontWeight: 600 }}
            >
              {dlPdf ? '…' : '↓'} PDF
            </button>
          </>
        }
      />

      <div className="filter-card">
        <div className="filters">
          <div className="filter-group">
            <span className="filter-label">Cycle</span>
            <select value={filters.batchId} onChange={e => setFilters(f => ({ ...f, batchId: e.target.value }))}>
              <option value="">All Cycles</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>{fmtDate(b.inventoryDate)}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Store</span>
            <select value={filters.storeId} onChange={e => setFilters(f => ({ ...f, storeId: e.target.value }))}>
              <option value="">All Stores</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="PENDING">Awaiting Count</option>
              <option value="SUBMITTED">Counted</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Discrepancy</span>
            <select value={filters.discrepancy} onChange={e => setFilters(f => ({ ...f, discrepancy: e.target.value }))}>
              <option value="">All</option>
              <option value="matched">Matched</option>
              <option value="shortage">Shortage</option>
              <option value="excess">Excess</option>
            </select>
          </div>
          <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)', cursor: 'pointer', paddingBottom: 3 }}>
              <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} style={{ cursor: 'pointer' }} />
              Include inactive stores
            </label>
          </div>
          <button onClick={loadReport} className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={loading}>
            {loading ? 'Loading…' : 'Load Report'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingCard rows={3} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ReportIcon}
          title="No Report Data"
          description={'Select a cycle and click "Load Report" to view reconciliation data.'}
          help="Apply filters above and click Load Report to generate reconciliation data."
        />
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8, paddingLeft: 2 }}>
            {records.length.toLocaleString()} record{records.length !== 1 ? 's' : ''} found
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col">Date</th>
                    <th scope="col">Material</th>
                    <th scope="col">Description</th>
                    <th scope="col" style={{ textAlign: 'right' }}>System</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Physical</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Remarks</th>
                    <th scope="col">Submitted By</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(record => (
                    <tr key={record.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{record.store.storeCode}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(record.batch.inventoryDate)}</td>
                      <td style={{ fontWeight: 600 }}>{record.materialCode}</td>
                      <td style={{ color: 'var(--t3)', fontSize: 12 }}>{record.materialName}</td>
                      <td style={{ textAlign: 'right', color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{record.systemQuantity}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{record.physicalQuantity ?? '—'}</td>
                      <td>
                        {record.difference !== null ? (
                          <span className={record.difference === 0 ? 'badge badge-matched' : record.difference < 0 ? 'badge badge-shortage' : 'badge badge-excess'}>
                            {record.difference > 0 ? '+' : ''}{record.difference}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--t3)' }}>{record.remarks || '—'}</td>
                      <td style={{ fontSize: 12 }}>{record.submitter?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
