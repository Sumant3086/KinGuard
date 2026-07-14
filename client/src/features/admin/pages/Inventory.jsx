import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDate, fmtISO } from '../../../shared/utils/dateUtils';

const EmptyIcon = (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </svg>
);

export default function Inventory() {
  const toast = useToast();
  const { downloading: dlExcel, download: downloadExcel } = useDownload();
  const { downloading: dlPdf,   download: downloadPdf   } = useDownload();
  const [searchParams] = useSearchParams();

  const [records, setRecords]           = useState([]);
  const [pagination, setPagination]     = useState({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [stores, setStores]             = useState([]);
  const [batches, setBatches]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [initialized, setInitialized]   = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(null);

  const [filters, setFilters] = useState({
    storeId:     searchParams.get('storeId')     || '',
    status:      searchParams.get('status')      || '',
    search:      searchParams.get('search')      || '',
    discrepancy: searchParams.get('discrepancy') || '',
    batchId:     searchParams.get('batchId')     || '',
  });

  // Override modal
  const [overrideRecord, setOverrideRecord] = useState(null);
  const [overrideForm, setOverrideForm]     = useState({ physicalQuantity: '', remarks: '', shrinkageCategory: '', status: '' });
  const [overriding, setOverriding]         = useState(false);
  const [overrideError, setOverrideError]   = useState('');

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [storesData, batchList] = await Promise.all([adminApi.getStores(), adminApi.getBatches()]);
        setStores(storesData);
        setBatches(batchList);

        const initFilters = {
          storeId:     searchParams.get('storeId')     || '',
          status:      searchParams.get('status')      || '',
          search:      searchParams.get('search')      || '',
          discrepancy: searchParams.get('discrepancy') || '',
          batchId:     searchParams.get('batchId')     || (batchList.length > 0 ? String(batchList[0].id) : ''),
        };
        setFilters(initFilters);

        if (initFilters.batchId || initFilters.storeId || initFilters.discrepancy || initFilters.status || initFilters.search) {
          setAppliedFilters(initFilters);
          await fetchInventory(initFilters, 1);
        }
      } catch {
        // errors from individual API calls are surfaced via toast inside fetchInventory
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchInventory(currentFilters, page) {
    setLoading(true);
    try {
      const data = await adminApi.getInventory({ ...currentFilters, page, pageSize: pagination.pageSize });
      setRecords(data.data);
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  async function applyFilters() {
    setAppliedFilters(filters);
    await fetchInventory(filters, 1);
  }

  const activeFilters = appliedFilters || filters;
  const today = fmtISO(new Date());

  const handleDownloadExcel = () =>
    downloadExcel(adminApi.downloadInventoryExport, `KinGuard_Inventory_${today}.xlsx`, activeFilters);

  const handleDownloadPdf = () =>
    downloadPdf(adminApi.downloadInventoryExportPDF, `KinGuard_Inventory_${today}.pdf`, activeFilters);

  function openOverride(record) {
    setOverrideRecord(record);
    setOverrideForm({
      physicalQuantity:  record.physicalQuantity != null ? String(record.physicalQuantity) : '',
      remarks:           record.remarks || '',
      shrinkageCategory: record.shrinkageCategory || '',
      status:            record.status,
    });
    setOverrideError('');
  }

  async function handleOverrideSubmit(e) {
    e.preventDefault();
    setOverrideError('');
    setOverriding(true);
    try {
      const updated = await adminApi.overrideRecord(overrideRecord.id, {
        physicalQuantity:  overrideForm.physicalQuantity !== '' ? parseFloat(overrideForm.physicalQuantity) : null,
        remarks:           overrideForm.remarks || null,
        shrinkageCategory: overrideForm.shrinkageCategory || null,
        status:            overrideForm.status,
      });
      // Update just this record in local state — no full page refetch needed
      setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
      setOverrideRecord(null);
    } catch (err) {
      setOverrideError(err.response?.data?.error || 'Override failed');
    } finally {
      setOverriding(false);
    }
  }

  const changePage = p => fetchInventory(activeFilters, p);

  const selectedBatch = batches.find(b => String(b.id) === filters.batchId);
  const subtitle = selectedBatch
    ? `Cycle: ${fmtDate(selectedBatch.inventoryDate, 'long')} · ${pagination.totalRecords.toLocaleString()} record(s)`
    : 'View and filter inventory submissions across all stores and cycles.';

  return (
    <AdminLayout>
      <PageHeader
        title="Inventory Submissions"
        subtitle={subtitle}
        actions={
          <>
            <button onClick={handleDownloadExcel} disabled={dlExcel} className="btn btn-success">
              {dlExcel ? '…' : '↓'} Excel
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={dlPdf}
              className="btn btn-sm"
              style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}
            >
              {dlPdf ? '…' : '↓'} PDF
            </button>
          </>
        }
      />

      {/* Filters */}
      <div className="filter-card">
        <div className="filters" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <select value={filters.batchId} onChange={e => handleFilterChange('batchId', e.target.value)} style={{ minWidth: 180 }}>
            <option value="">All Cycles</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>
                {fmtDate(b.inventoryDate)}{b === batches[0] ? ' (latest)' : ''}
              </option>
            ))}
          </select>

          <select value={filters.storeId} onChange={e => handleFilterChange('storeId', e.target.value)}>
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
          </select>

          <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="SUBMITTED">Submitted</option>
          </select>

          <select value={filters.discrepancy} onChange={e => handleFilterChange('discrepancy', e.target.value)}>
            <option value="">All Variances</option>
            <option value="matched">Matched</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>

          <input
            type="text"
            placeholder="Search material code or name…"
            value={filters.search}
            onChange={e => handleFilterChange('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
            style={{ minWidth: 200 }}
          />

          <button onClick={applyFilters} className="btn btn-primary" disabled={loading}>
            {loading && initialized ? 'Loading…' : 'Apply Filters'}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && !initialized ? (
        <SkeletonTable rows={8} cols={8} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={EmptyIcon}
          title={initialized ? 'No Records Found' : 'Ready to Search'}
          description={initialized
            ? 'No records match the current filters. Try adjusting your search criteria.'
            : 'Select filters and click "Apply Filters" to view inventory records.'}
          action={initialized ? (
            <button
              className="btn btn-secondary"
              onClick={() => {
                const cleared = { storeId: '', status: '', search: '', discrepancy: '', batchId: batches.length > 0 ? String(batches[0].id) : '' };
                setFilters(cleared);
                setAppliedFilters(cleared);
                fetchInventory(cleared, 1);
              }}
            >
              Clear All Filters
            </button>
          ) : undefined}
        />
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
            <div className="inv-cards" style={{ padding: 12 }}>
              {records.map(record => (
                <div key={record.id} className="inv-card">
                  <div className="inv-card-top">
                    <span className="inv-card-store">{record.store.storeCode}</span>
                    <div className="inv-card-badges">
                      <span className={`badge badge-${record.status.toLowerCase()}`}>
                        {record.status === 'PENDING' ? 'Pending' : 'Counted'}
                      </span>
                      {record.isRepeat && <span className="badge badge-repeat" title="Shortage in previous cycles">Repeat</span>}
                    </div>
                  </div>
                  <div className="inv-card-material">{record.materialCode}</div>
                  <div className="inv-card-desc">{record.materialName}</div>
                  <div className="inv-card-qty-row">
                    <span>Sys: <strong>{record.systemQuantity}</strong></span>
                    <span>Phys: <strong>{record.physicalQuantity ?? '—'}</strong></span>
                    {record.difference !== null ? (
                      <span className={record.difference === 0 ? 'badge badge-matched' : record.difference < 0 ? 'badge badge-shortage' : 'badge badge-excess'}>
                        {record.difference > 0 ? '+' : ''}{record.difference}
                      </span>
                    ) : null}
                  </div>
                  {record.remarks && (
                    <div className="inv-card-remarks" title={record.remarks}>Remarks: {record.remarks}</div>
                  )}
                  <button
                    onClick={() => openOverride(record)}
                    className="btn btn-sm"
                    style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--violet)', border: '1px solid rgba(139,92,246,0.22)', fontSize: 11, width: '100%' }}
                  >
                    Override
                  </button>
                </div>
              ))}
            </div>

            {/* ── Desktop table (>768px) ────────────────────────────── */}
            <div className="table-container inv-table-desktop">
              <table className="table-sticky table-sortable table-hover">
                <thead>
                  <tr>
                    <th scope="col" className="th-sortable">Store</th>
                    <th scope="col" className="th-sortable">Material Name</th>
                    <th scope="col">Description</th>
                    <th scope="col" style={{ textAlign: 'right' }} className="th-sortable">System Stock</th>
                    <th scope="col" style={{ textAlign: 'right' }} className="th-sortable">Physical Stock</th>
                    <th scope="col" className="th-sortable">Variance</th>
                    <th scope="col">Remarks</th>
                    <th scope="col">Status</th>
                    <th scope="col">Flag</th>
                    <th scope="col">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(record => (
                    <tr key={record.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--vi-light)' }}>{record.store.storeCode}</td>
                      <td style={{ fontWeight: 600 }}>{record.materialCode}</td>
                      <td style={{ color: 'var(--t3)', fontSize: 12 }}>{record.materialName}</td>
                      <td style={{ textAlign: 'right', color: 'var(--t2)' }}>{record.systemQuantity}</td>
                      <td style={{ textAlign: 'right' }}>{record.physicalQuantity ?? '—'}</td>
                      <td>
                        {record.difference !== null ? (
                          <span className={record.difference === 0 ? 'badge badge-matched' : record.difference < 0 ? 'badge badge-shortage' : 'badge badge-excess'}>
                            {record.difference > 0 ? '+' : ''}{record.difference}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={record.remarks || ''}>{record.remarks || '—'}</td>
                      <td>
                        <span className={`badge badge-${record.status.toLowerCase()}`}>
                          {record.status === 'PENDING' ? 'Pending' : 'Counted'}
                        </span>
                      </td>
                      <td>{record.isRepeat && <span className="badge badge-repeat" title="Shortage in previous cycles">Repeat</span>}</td>
                      <td>
                        <button
                          onClick={() => openOverride(record)}
                          className="btn btn-sm"
                          style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--violet)', border: '1px solid rgba(139,92,246,0.22)', fontSize: 11 }}
                        >
                          Override
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: 'var(--t3)' }}>Loading…</div>}

          <div className="pagination">
            <button onClick={() => changePage(pagination.page - 1)} disabled={pagination.page === 1 || loading} className="btn btn-secondary">Previous</button>
            <span style={{ margin: '0 15px', fontSize: 13, color: 'var(--t3)' }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalRecords.toLocaleString()} records)
            </span>
            <button onClick={() => changePage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} className="btn btn-secondary">Next</button>
          </div>
        </>
      )}

      {/* Override modal */}
      {overrideRecord && (
        <Modal onClose={() => !overriding && setOverrideRecord(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Admin Override</h3>
              <button className="close-btn" onClick={() => setOverrideRecord(null)} disabled={overriding}>&times;</button>
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--t3)' }}>
              <strong style={{ color: 'var(--t1)' }}>{overrideRecord.materialCode}</strong> — {overrideRecord.materialName}
              <br />
              Store: <strong style={{ color: 'var(--vi-light)' }}>{overrideRecord.store.storeCode}</strong>
              {' · '}System Stock: <strong>{overrideRecord.systemQuantity}</strong>
              {' · '}Current Physical Stock: <strong>{overrideRecord.physicalQuantity ?? '—'}</strong>
            </div>

            {overrideError && <div className="alert alert-error" style={{ marginBottom: 14, fontSize: 13 }}>{overrideError}</div>}

            <form onSubmit={handleOverrideSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ov-qty">Physical Stock (override)</label>
                  <input id="ov-qty" type="number" step="0.0001" value={overrideForm.physicalQuantity} onChange={e => setOverrideForm(f => ({ ...f, physicalQuantity: e.target.value }))} placeholder="Leave blank to clear" disabled={overriding} />
                </div>
                <div className="form-group">
                  <label htmlFor="ov-status">Status</label>
                  <select id="ov-status" value={overrideForm.status} onChange={e => setOverrideForm(f => ({ ...f, status: e.target.value }))} disabled={overriding}>
                    <option value="PENDING">Pending</option>
                    <option value="SUBMITTED">Submitted</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ov-remarks">Remarks</label>
                <input id="ov-remarks" type="text" value={overrideForm.remarks} onChange={e => setOverrideForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Admin correction note…" disabled={overriding} />
              </div>
              <div className="form-group">
                <label htmlFor="ov-shrinkage">Shrinkage Category <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(optional)</span></label>
                <input id="ov-shrinkage" type="text" value={overrideForm.shrinkageCategory} onChange={e => setOverrideForm(f => ({ ...f, shrinkageCategory: e.target.value }))} placeholder="e.g. Theft, Damage, Admin Error…" disabled={overriding} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 14 }}>
                ⚠ This override will be recorded in the audit trail with your employee ID.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setOverrideRecord(null)} disabled={overriding}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={overriding} style={{ background: 'rgba(139,92,246,0.85)' }}>
                  {overriding ? 'Saving…' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
