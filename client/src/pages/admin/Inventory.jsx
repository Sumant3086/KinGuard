import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import { useToast } from '../../context/ToastContext';

export default function AdminInventory() {
  const toast = useToast();
  const [records, setRecords]       = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [stores, setStores]         = useState([]);
  const [batches, setBatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [searchParams]              = useSearchParams();

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

  // On mount: load stores + batches, then auto-load the latest batch's records
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [storesData, batchList] = await Promise.all([
          adminApi.getStores(),
          adminApi.getBatches(),
        ]);
        setStores(storesData);
        setBatches(batchList);

        // Build initial filters — prefer URL params, else default to latest batch
        const initFilters = {
          storeId:     searchParams.get('storeId')     || '',
          status:      searchParams.get('status')      || '',
          search:      searchParams.get('search')      || '',
          discrepancy: searchParams.get('discrepancy') || '',
          batchId:     searchParams.get('batchId')     || (batchList.length > 0 ? String(batchList[0].id) : ''),
        };
        setFilters(initFilters);

        // Immediately load records with the resolved filters
        if (initFilters.batchId || initFilters.storeId || initFilters.discrepancy || initFilters.status) {
          await fetchInventory(initFilters, 1);
        }
      } catch (err) {
        console.error('Failed to initialise inventory page:', err);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    }
    init();
  }, []); // eslint-disable-line

  async function fetchInventory(currentFilters, page) {
    setLoading(true);
    try {
      const data = await adminApi.getInventory({
        ...currentFilters,
        page,
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
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function applyFilters() {
    await fetchInventory(filters, 1);
  }

  async function handleDownloadExcel() {
    try {
      const blob = await adminApi.downloadInventoryExport(filters);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Download failed');
    }
  }

  function openOverride(record) {
    setOverrideRecord(record);
    setOverrideForm({
      physicalQuantity:  record.physicalQuantity !== null && record.physicalQuantity !== undefined
                          ? String(record.physicalQuantity) : '',
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
      const payload = {
        physicalQuantity:  overrideForm.physicalQuantity !== '' ? parseFloat(overrideForm.physicalQuantity) : null,
        remarks:           overrideForm.remarks || null,
        shrinkageCategory: overrideForm.shrinkageCategory || null,
        status:            overrideForm.status,
      };
      await adminApi.overrideRecord(overrideRecord.id, payload);
      setOverrideRecord(null);
      await fetchInventory(filters, pagination.page);
    } catch (err) {
      setOverrideError(err.response?.data?.error || 'Override failed');
    } finally {
      setOverriding(false);
    }
  }

  function changePage(p) { fetchInventory(filters, p); }

  const selectedBatch = batches.find(b => String(b.id) === filters.batchId);

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Inventory Submissions</h2>
          <p>
            {selectedBatch
              ? `Cycle: ${new Date(selectedBatch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${pagination.totalRecords.toLocaleString()} record(s)`
              : 'View and filter inventory records across all stores and cycles'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDownloadExcel} className="btn btn-success">↓ Excel</button>
          <button
            onClick={async () => {
              try {
                const blob = await adminApi.downloadInventoryExportPDF(filters);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `KinGuard_Inventory_${new Date().toISOString().split('T')[0]}.pdf`;
                a.click(); window.URL.revokeObjectURL(url);
                toast.success('PDF downloaded');
              } catch (err) { toast.error(err.response?.data?.error || 'PDF download failed'); }
            }}
            className="btn btn-sm"
            style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}
          >
            ↓ PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="filters" style={{ flexWrap: 'wrap', gap: '10px' }}>
          {/* Cycle / Batch */}
          <select
            value={filters.batchId}
            onChange={e => handleFilterChange('batchId', e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">All Cycles</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>
                {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {b === batches[0] ? ' (latest)' : ''}
              </option>
            ))}
          </select>

          {/* Store */}
          <select value={filters.storeId} onChange={e => handleFilterChange('storeId', e.target.value)}>
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
          </select>

          {/* Status */}
          <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
            <option value="">All Status</option>
            <option value="PENDING">Pending (not counted)</option>
            <option value="SUBMITTED">Submitted (counted)</option>
          </select>

          {/* Discrepancy */}
          <select value={filters.discrepancy} onChange={e => handleFilterChange('discrepancy', e.target.value)}>
            <option value="">All Variances</option>
            <option value="matched">Matched</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>

          {/* Search */}
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
        <div className="loading"><div className="spinner" />Loading submissions…</div>
      ) : records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>{initialized ? 'No records match the current filters.' : 'Select filters and click Apply.'}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Material Name</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>System Stock</th>
                    <th style={{ textAlign: 'right' }}>Physical Stock</th>
                    <th>Variance</th>
                    <th>Remarks</th>
                    <th>Status</th>
                    <th>Flag</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(record => (
                    <tr key={record.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--vi-light)' }}>
                        {record.store.storeCode}
                      </td>
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
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={record.remarks || ''}>
                        {record.remarks || '—'}
                      </td>
                      <td>
                        <span className={`badge badge-${record.status.toLowerCase()}`}>
                          {record.status === 'PENDING' ? 'Pending' : 'Counted'}
                        </span>
                      </td>
                      <td>
                        {record.isRepeat && <span className="badge badge-repeat" title="Shortage in previous cycles">🔁</span>}
                      </td>
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
            <button onClick={() => changePage(pagination.page - 1)} disabled={pagination.page === 1 || loading} className="btn btn-secondary">
              Previous
            </button>
            <span style={{ margin: '0 15px', fontSize: 13, color: 'var(--t3)' }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.totalRecords.toLocaleString()} records)
            </span>
            <button onClick={() => changePage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading} className="btn btn-secondary">
              Next
            </button>
          </div>
        </>
      )}

      {/* ── Override modal ── */}
      {overrideRecord && (
        <div className="modal" onClick={() => !overriding && setOverrideRecord(null)}>
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

            {overrideError && (
              <div className="alert alert-error" style={{ marginBottom: 14, fontSize: 13 }}>{overrideError}</div>
            )}

            <form onSubmit={handleOverrideSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Physical Stock (override)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={overrideForm.physicalQuantity}
                    onChange={e => setOverrideForm({ ...overrideForm, physicalQuantity: e.target.value })}
                    placeholder="Leave blank to clear"
                    disabled={overriding}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={overrideForm.status}
                    onChange={e => setOverrideForm({ ...overrideForm, status: e.target.value })}
                    disabled={overriding}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="SUBMITTED">Submitted (counted)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Remarks</label>
                <input
                  type="text"
                  value={overrideForm.remarks}
                  onChange={e => setOverrideForm({ ...overrideForm, remarks: e.target.value })}
                  placeholder="Admin correction note…"
                  disabled={overriding}
                />
              </div>
              <div className="form-group">
                <label>
                  Shrinkage Category{' '}
                  <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={overrideForm.shrinkageCategory}
                  onChange={e => setOverrideForm({ ...overrideForm, shrinkageCategory: e.target.value })}
                  placeholder="e.g. Theft, Damage, Admin Error…"
                  disabled={overriding}
                />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 14 }}>
                ⚠ This action is recorded in the audit trail with your employee ID.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setOverrideRecord(null)} disabled={overriding}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={overriding}
                  style={{ background: 'rgba(139,92,246,0.85)' }}
                >
                  {overriding ? 'Saving…' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
