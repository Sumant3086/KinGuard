import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import StoreLayout from '../layout/StoreLayout';
import ConfirmModal from '../../../shared/components/ui/ConfirmModal';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as storeApi from '../../../shared/api/storeApi';
import { useToast } from '../../../shared/context/ToastContext';

// Category -> Issue Detail sub-reasons mapping
const ISSUE_REASONS = {
  Dented: [
    'Minor dent to packaging, product is ok',
    'Moderate dent to packaging, product with lesser impact',
    'Direct dent to product, product not ok',
    'Dented due to warehouse handling error',
    'Dented during transit/shipping',
  ],
  Expiry: [
    'Product has passed the expiry date',
    'Product has passed the particular date',
    'Expired stock identified during stock take',
    'Expired stock designated for return to vendor',
    'Expired stock designated for disposal',
  ],
  Damage: [
    'Physical breakage of product/component',
    'Physical scratches/abrasions on product/packaging',
    'Water exposure damage',
    'Fire/smoke exposure damage',
    'Electrical malfunction/damage',
    'Manufacturing defect identified',
    'Damage incurred during customer return process',
    'Unsaleable due to damage',
  ],
  'In Transit': [
    'Overage, Shortage, Damage (OS&D) report for transit damage',
    'Damage/issue due to cargo shift during transport',
    'Environmental exposure during transit (e.g., temperature, humidity)',
    'Pilferage suspected during transit',
    'Damage incurred due to transport accident',
    'Discrepancy between physical count and shipping documentation',
  ],
  Other: [
    'Quality control hold, pending further inspection/decision',
    'Incorrect labeling identified on product/packaging',
    'Product subject to manufacturer recall',
    'Product deemed obsolete, no longer marketable',
    'Inventory adjustment due to system error/discrepancy',
    'Stock designated for donation',
    'Stock designated for sampling/testing',
    'Stock shared to national employees',
  ],
};

const CATEGORIES = Object.keys(ISSUE_REASONS);

const IconSave = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconRetry = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
  </svg>
);

export default function StoreInventory() {
  const toast = useToast();
  const { download: downloadFile } = useDownload();
  const [searchParams] = useSearchParams();
  const urlBatchId = searchParams.get('batchId') ?? '';

  const [records, setRecords]           = useState([]);
  const [batches, setBatches]           = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(urlBatchId);
  const [isLocked, setIsLocked]         = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editedRecords, setEditedRecords] = useState({});
  const [savingRecords, setSavingRecords] = useState(new Set());
  const [savedRecords, setSavedRecords]   = useState(new Set());
  const [errorRecords, setErrorRecords]   = useState(new Map());
  const [submitting, setSubmitting]     = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [searchInput, setSearchInput]   = useState('');
  // Track which records have "custom reason" mode active for the Other category
  const [otherCustomIds, setOtherCustomIds] = useState(new Set());
  const search = useDebounce(searchInput, 400);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const debounceTimers    = useRef({});
  const editedRecordsRef  = useRef({});
  const editTimestampRef  = useRef({});
  const blankRowRefs      = useRef({});
  const batchesReadyRef   = useRef(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);

  useEffect(() => { loadBatches(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation for inventory table
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only handle when no input is focused
      if (document.activeElement.tagName === 'INPUT' || 
          document.activeElement.tagName === 'SELECT' ||
          document.activeElement.tagName === 'TEXTAREA') {
        return;
      }

      const pendingRows = records.filter(r => r.status === 'PENDING' && !isLocked);
      
      if (e.key === 'j' && selectedRowIndex < pendingRows.length - 1) {
        // Navigate down
        e.preventDefault();
        const newIndex = selectedRowIndex + 1;
        setSelectedRowIndex(newIndex);
        const record = pendingRows[newIndex];
        const el = blankRowRefs.current[record.id];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (e.key === 'k' && selectedRowIndex > 0) {
        // Navigate up
        e.preventDefault();
        const newIndex = selectedRowIndex - 1;
        setSelectedRowIndex(newIndex);
        const record = pendingRows[newIndex];
        const el = blankRowRefs.current[record.id];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (e.key === 'Enter' && selectedRowIndex >= 0 && selectedRowIndex < pendingRows.length) {
        // Focus on physical quantity input
        e.preventDefault();
        const record = pendingRows[selectedRowIndex];
        const el = blankRowRefs.current[record.id];
        if (el) el.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [records, selectedRowIndex, isLocked]);

  useEffect(() => {
    if (!batchesReadyRef.current) return;
    loadInventory();
  }, [search, statusFilter, selectedBatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  async function loadBatches() {
    try {
      const data = await storeApi.getBatches();
      setBatches(data);
      batchesReadyRef.current = true;
      if (data.length > 0) {
        // Honour a batchId from the URL (e.g. navigated from the older-batch alert
        // on the dashboard); otherwise default to the most recent batch.
        const urlId = urlBatchId && data.find(b => b.id.toString() === urlBatchId)
          ? urlBatchId
          : data[0].id.toString();
        setSelectedBatch(urlId);
      } else {
        loadInventory();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory cycles. Please refresh.');
      setLoading(false);
    }
  }

  async function loadInventory() {
    try {
      setLoading(true);
      const res = await storeApi.getInventory(search, statusFilter, selectedBatch);
      const { records: recs, isLocked: locked } = res;
      setRecords(recs);
      setIsLocked(locked);
      editedRecordsRef.current = {};
      setEditedRecords({});
      setSavingRecords(new Set());
      setSavedRecords(new Set());
      setErrorRecords(new Map());
      setOtherCustomIds(new Set());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  function updateField(recordId, field, value) {
    const next = {
      ...editedRecordsRef.current,
      [recordId]: { ...(editedRecordsRef.current[recordId] || {}), [field]: value },
    };
    editedRecordsRef.current = next;
    editTimestampRef.current[recordId] = Date.now();
    setEditedRecords(next);
    setSavedRecords(prev => { const s = new Set(prev); s.delete(recordId); return s; });
    setErrorRecords(prev => { const m = new Map(prev); m.delete(recordId); return m; });
    debouncedSave(recordId);
  }

  const debouncedSave = useCallback((recordId) => {
    if (debounceTimers.current[recordId]) clearTimeout(debounceTimers.current[recordId]);
    debounceTimers.current[recordId] = setTimeout(() => saveRecord(recordId), 700);
  }, []);

  function saveNow(recordId) {
    if (debounceTimers.current[recordId]) {
      clearTimeout(debounceTimers.current[recordId]);
      delete debounceTimers.current[recordId];
    }
    saveRecord(recordId);
  }

  async function saveRecord(recordId) {
    const edits = editedRecordsRef.current[recordId];
    if (!edits) return;
    const savedAt = editTimestampRef.current[recordId];

    setSavingRecords(prev => new Set(prev).add(recordId));
    setErrorRecords(prev => { const m = new Map(prev); m.delete(recordId); return m; });

    try {
      const updated = await storeApi.updateRecord(recordId, edits.physicalQuantity, edits.systemQuantity, edits.remarks, edits.shrinkageCategory);
      setRecords(prev => prev.map(r => r.id === parseInt(recordId) ? updated : r));
      setSavedRecords(prev => new Set(prev).add(recordId));
      setSavingRecords(prev => { const s = new Set(prev); s.delete(recordId); return s; });

      if (editTimestampRef.current[recordId] === savedAt) {
        const cleared = { ...editedRecordsRef.current };
        delete cleared[recordId];
        editedRecordsRef.current = cleared;
        setEditedRecords(cleared);
      }

      setTimeout(() => setSavedRecords(prev => { const s = new Set(prev); s.delete(recordId); return s; }), 2000);
    } catch (err) {
      setSavingRecords(prev => { const s = new Set(prev); s.delete(recordId); return s; });
      setErrorRecords(prev => new Map(prev).set(recordId, err.response?.data?.error || 'Save failed'));
    }
  }

  function getFieldValue(record, field) {
    if (editedRecords[record.id] && editedRecords[record.id][field] !== undefined) {
      return editedRecords[record.id][field];
    }
    return record[field] ?? '';
  }

  // Returns instant local diff from typed values (no API wait)
  function getInstantDiff(record) {
    const edited = editedRecords[record.id];
    const physRaw = edited?.physicalQuantity !== undefined ? edited.physicalQuantity : record.physicalQuantity;
    const sysRaw  = edited?.systemQuantity  !== undefined ? edited.systemQuantity   : record.systemQuantity;
    const phys = parseFloat(physRaw);
    const sys  = parseFloat(sysRaw);
    if (!isNaN(phys) && physRaw !== '' && physRaw !== null) {
      // Fall back to the server-stored system quantity when the typed value is empty/NaN
      const effectiveSys = isNaN(sys) ? (record.systemQuantity ?? 0) : sys;
      return parseFloat((phys - effectiveSys).toFixed(4));
    }
    return record.difference;
  }

  function getSaveState(recordId) {
    if (savingRecords.has(recordId)) return 'saving';
    if (savedRecords.has(recordId))  return 'saved';
    if (errorRecords.has(recordId))  return 'error';
    if (editedRecords[recordId])     return 'unsaved';
    return null;
  }

  function jumpToNextBlank() {
    const blank = records.find(r => {
      if (r.status !== 'PENDING' || r.physicalQuantity !== null) return false;
      const edited = editedRecords[r.id]?.physicalQuantity;
      // Treat undefined and empty string as blank, but '0' is a valid entry
      return edited === undefined || edited === '';
    });
    if (blank) {
      const el = blankRowRefs.current[blank.id];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }
  }

  async function handleSubmit() {
    if (!selectedBatch) {
      toast.warning('Select an inventory cycle before submitting.');
      return;
    }
    if (Object.keys(editedRecordsRef.current).length > 0) {
      toast.warning('Wait for all changes to finish saving before submitting.');
      return;
    }

    // Client-side validation before hitting the server
    const pending = records.filter(r => r.status === 'PENDING');
    const missingPhysical = pending.filter(r => r.physicalQuantity === null);
    if (missingPhysical.length > 0) {
      toast.error(`Physical count missing for ${missingPhysical.length} item(s). Enter all quantities before submitting.`);
      return;
    }
    const discrepant = pending.filter(r => r.difference !== null && r.difference !== 0);
    const missingCategory = discrepant.filter(r => !r.shrinkageCategory);
    if (missingCategory.length > 0) {
      toast.error(`${missingCategory.length} item(s) with variances require a category selection.`);
      return;
    }
    const missingDetail = discrepant.filter(r => !r.remarks || r.remarks.trim() === '');
    if (missingDetail.length > 0) {
      toast.error(`${missingDetail.length} item(s) with variances are missing issue details.`);
      return;
    }

    setShowSubmitConfirm(true);
  }

  async function executeSubmit() {
    const batchId = parseInt(selectedBatch);
    try {
      setSubmitting(true);
      const res = await storeApi.submitInventory(batchId);
      setSubmitResult(res);
      toast.success('Inventory submitted successfully.', 5000);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit inventory');
    } finally {
      setSubmitting(false);
    }
  }

  const handleDownload = () =>
    downloadFile(storeApi.downloadInventory, 'inventory.xlsx', selectedBatch || undefined);

  const pendingRecords = records.filter(r => r.status === 'PENDING');
  const enteredCount   = pendingRecords.filter(r => {
    // If the user has an active edit, that overrides the saved value
    if (editedRecords[r.id] && editedRecords[r.id].physicalQuantity !== undefined) {
      const editedQty = editedRecords[r.id].physicalQuantity;
      return editedQty !== '' && editedQty !== null;
    }
    return r.physicalQuantity !== null;
  }).length;
  const totalPending    = pendingRecords.length;
  const progressPct     = totalPending > 0 ? Math.round((enteredCount / totalPending) * 100) : 100;
  const blankCount      = totalPending - enteredCount;
  const hasUnsavedChanges = Object.keys(editedRecords).length > 0;
  const isSaving          = savingRecords.size > 0;

  // ── Post-submit summary ────────────────────────────────────
  if (submitResult) {
    const recs     = submitResult.records || [];
    const matched  = recs.filter(r => r.difference === 0).length;
    const shortage = recs.filter(r => r.difference !== null && r.difference < 0).length;
    const excess   = recs.filter(r => r.difference !== null && r.difference > 0).length;
    const nonZero  = recs.filter(r => r.difference !== null && r.difference !== 0)
                        .sort((a, b) => a.difference - b.difference);
    return (
      <StoreLayout>
        <div className="submit-summary">
          <div className="submit-summary-header">
            <div className="submit-success-icon">✓</div>
            <h2>Submission Complete</h2>
            <p>{submitResult.recordCount} item{submitResult.recordCount !== 1 ? 's' : ''} submitted. Your administrator has been notified.</p>
          </div>
          <div className="summary-metrics">
            <div className="summary-metric matched">
              <h4>Matched</h4>
              <div className="metric-value">{matched}</div>
            </div>
            <div className="summary-metric shortage">
              <h4>Shortage</h4>
              <div className="metric-value">{shortage}</div>
            </div>
            <div className="summary-metric excess">
              <h4>Excess</h4>
              <div className="metric-value">{excess}</div>
            </div>
          </div>
          {nonZero.length > 0 && (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: 16 }}>Discrepancy Details</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item Code</th>
                      <th scope="col">Book Stock</th>
                      <th scope="col">Your Count</th>
                      <th scope="col">Variance</th>
                      <th scope="col">Category</th>
                      <th scope="col">Issue Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonZero.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.materialCode}</td>
                        <td>{r.systemQuantity}</td>
                        <td>{r.physicalQuantity}</td>
                        <td>
                          <span className={r.difference < 0 ? 'badge badge-shortage' : 'badge badge-excess'}>
                            {r.difference > 0 ? '+' : ''}{r.difference}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{r.shrinkageCategory || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--t3)' }}>{r.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="actions" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => { setSubmitResult(null); loadInventory(); }}>
              View Submitted Records
            </button>
            <button className="btn btn-secondary" onClick={handleDownload}>
              Download Reconciliation Report
            </button>
          </div>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <ConfirmModal
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => { setShowSubmitConfirm(false); executeSubmit(); }}
        title="Submit Inventory"
        message="Once submitted, all items become read-only and your administrator will be notified. This action cannot be undone."
        confirmText="Submit"
        cancelText="Go Back"
        type="warning"
      />
      {/* ── Entry progress bar ── */}
      {totalPending > 0 && !isLocked && (
        <div className="inv-progress-bar">
          <div className="inv-progress-left">
            <span className="inv-progress-fraction">
              <strong>{enteredCount}</strong> / {totalPending}
            </span>
            <span className="inv-progress-label">items counted</span>
          </div>
          <div className="inv-progress-track-wrap">
            <div className="inv-progress-track">
              <div
                className={`inv-progress-fill${progressPct < 50 ? ' warn' : ''}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="inv-progress-pct">{progressPct}%</span>
          </div>
          <div className="inv-progress-right">
            {blankCount > 0 ? (
              <>
                <span className="inv-blank-count">{blankCount} blank</span>
                <button className="btn-jump" onClick={jumpToNextBlank}>Jump to Next Blank</button>
              </>
            ) : (
              <span className="inv-all-entered">All Filled</span>
            )}
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-header" style={{ marginTop: 24 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2>Inventory Count</h2>
          {selectedBatch && batches.length > 0 && (() => {
            const b = batches.find(b => b.id.toString() === selectedBatch);
            return b ? (
              <p>{new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            ) : null;
          })()}
        </div>
        <div className="page-actions" style={{ margin: 0 }}>
          {totalPending > 0 && !isLocked && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || hasUnsavedChanges || isSaving}
                className="btn btn-success"
                title={hasUnsavedChanges || isSaving ? 'Wait for all changes to save first' : ''}
              >
                {submitting ? 'Submitting…' : `Submit Count (${totalPending} items)`}
              </button>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Once submitted, your administrator will be notified.</span>
            </div>
          )}
          {batches.length > 0 && (
            <button onClick={handleDownload} className="btn btn-ghost btn-sm">
              Download Report
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {isLocked && (
        <div className="lock-banner">
          <span className="lock-banner-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
          <div>
            <p>This count cycle is locked — deadline has passed.</p>
            <span>Contact your administrator to request an extension or unlock this cycle.</span>
          </div>
        </div>
      )}

      {(hasUnsavedChanges || isSaving) && (
        <div className="autosave-notice">
          <div className="autosave-dot" />
          {isSaving ? 'Saving…' : 'Changes pending — saving automatically.'}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="inv-filters">
        <div className="filter-group">
          <span className="filter-label">Inventory Cycle</span>
          <select
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <option value="">All Cycles</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>
                {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}({b.pendingCount} pending, {b.submittedCount} submitted)
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, display: 'block' }}>
            Select a past cycle to view read-only historical records.
          </span>
        </div>
        <div className="filter-group">
          <span className="filter-label">Search</span>
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by material code or name…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Status</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="SUBMITTED">Submitted</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : batches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
              <line x1="16" y1="21" x2="16" y2="14"/><line x1="8" y1="21" x2="8" y2="14"/>
              <line x1="12" y1="7" x2="12" y2="3"/><line x1="9" y1="3" x2="15" y2="3"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Inventory Cycles Assigned</h3>
          <p className="empty-state-description">
            No inventory cycles have been assigned to your store.
            You will be notified when a cycle is uploaded and ready for counting.
          </p>
          <div className="empty-state-help">
            If you believe this is an error, contact your administrator.
          </div>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Items for This Cycle</h3>
          <p className="empty-state-description">
            No inventory items are assigned to your store for the selected cycle.
            Try selecting a different cycle above.
          </p>
        </div>
      ) : (
        <div className="inv-table-card">
          {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
          <div className="store-inv-cards">
            {records.map(record => {
              const isPending  = record.status === 'PENDING';
              const isEditable = isPending && !isLocked;
              const saveState  = getSaveState(record.id);
              const instantDiff = getInstantDiff(record);
              const cat = getFieldValue(record, 'shrinkageCategory');
              const hasDiscrepancy = instantDiff !== null && instantDiff !== 0;

              return (
                <div key={record.id} className="store-inv-card">
                  <div className="store-inv-card-top">
                    <div>
                      <span className="store-inv-code">{record.materialCode}</span>
                      {' '}
                      <span className="store-inv-name">{record.materialName}</span>
                    </div>
                    {record.status === 'PENDING' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'rgba(217,119,6,0.13)', color: '#92400e', border: '1.5px solid rgba(217,119,6,0.30)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>Pending</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'rgba(22,163,74,0.13)', color: '#15803d', border: '1.5px solid rgba(22,163,74,0.30)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>Submitted</span>
                    )}
                  </div>
                  <div className="store-inv-sys">Book Stock: {record.systemQuantity}</div>

                  {isEditable ? (
                    <input
                      ref={el => { blankRowRefs.current[record.id] = el; }}
                      type="number"
                      step="0.01"
                      min="0"
                      value={getFieldValue(record, 'physicalQuantity')}
                      onChange={e => updateField(record.id, 'physicalQuantity', e.target.value)}
                      placeholder="Enter count…"
                      className="qty-input"
                    />
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>Your Count: <strong>{record.physicalQuantity ?? '—'}</strong>
                      {instantDiff !== null && (
                        <span style={{ marginLeft: 8 }} className={`badge diff-badge ${instantDiff === 0 ? 'badge-matched' : instantDiff < 0 ? 'badge-shortage' : 'badge-excess'}`}>
                          {instantDiff > 0 ? '+' : ''}{instantDiff}
                        </span>
                      )}
                    </div>
                  )}

                  {isEditable && instantDiff !== null && (
                    <span className={`badge diff-badge ${instantDiff === 0 ? 'badge-matched' : instantDiff < 0 ? 'badge-shortage' : 'badge-excess'}`} style={{ alignSelf: 'flex-start' }}>
                      {instantDiff > 0 ? '+' : ''}{instantDiff}
                    </span>
                  )}

                  {isEditable && (
                    <select
                      value={getFieldValue(record, 'shrinkageCategory')}
                      onChange={e => {
                        updateField(record.id, 'shrinkageCategory', e.target.value);
                        updateField(record.id, 'remarks', '');
                      }}
                      className="remark-select"
                    >
                      <option value="">Select category…</option>
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}

                  {isEditable && cat && (() => {
                    const remarks = getFieldValue(record, 'remarks');
                    const presets = ISSUE_REASONS[cat] || [];
                    const isPreset = presets.includes(remarks);
                    const isCustom = otherCustomIds.has(record.id) || (cat === 'Other' && remarks !== '' && !isPreset);

                    if (cat === 'Other') {
                      return (
                        <>
                          <select
                            value={isCustom ? '__CUSTOM__' : remarks}
                            onChange={e => {
                              if (e.target.value === '__CUSTOM__') {
                                setOtherCustomIds(prev => new Set(prev).add(record.id));
                                if (isPreset) updateField(record.id, 'remarks', '');
                              } else {
                                setOtherCustomIds(prev => { const s = new Set(prev); s.delete(record.id); return s; });
                                updateField(record.id, 'remarks', e.target.value);
                              }
                            }}
                            className="remark-select"
                          >
                            <option value="">Select issue detail…</option>
                            {presets.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                            <option disabled>──────────────</option>
                            <option value="__CUSTOM__">Type a custom reason…</option>
                          </select>
                          {isCustom && (
                            <input
                              type="text"
                              value={!isPreset ? remarks : ''}
                              onChange={e => updateField(record.id, 'remarks', e.target.value)}
                              placeholder="Type custom reason…"
                              className="inline-input remark-input"
                            />
                          )}
                        </>
                      );
                    }
                    return (
                      <select
                        value={remarks}
                        onChange={e => updateField(record.id, 'remarks', e.target.value)}
                        className="remark-select"
                      >
                        <option value="">Select issue detail…</option>
                        {presets.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    );
                  })()}

                  {isEditable && hasDiscrepancy && !cat && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>Select a category above to add issue detail.</div>
                  )}

                  <div className="store-inv-card-actions">
                    {saveState === 'saving' && <span className="save-spinner" title="Saving…" />}
                    {saveState === 'saved' && <span className="save-check" title="Saved"><IconCheck /></span>}
                    {saveState === 'unsaved' && isEditable && (
                      <button className="btn-row-save" onClick={() => saveNow(record.id)} title="Save now">
                        <IconSave /> Save
                      </button>
                    )}
                    {saveState === 'error' && (
                      <button className="btn-row-save btn-row-retry" onClick={() => saveNow(record.id)} title={errorRecords.get(record.id)}>
                        <IconRetry /> Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (>768px) ────────────────────────────── */}
          <div className="table-container store-inv-table-desktop">
            <table className="inv-table table-sticky table-hover">
              <thead>
                <tr>
                  <th scope="col">Item Code</th>
                  <th scope="col">Item Name</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Book Stock</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Your Count</th>
                  <th scope="col">Variance</th>
                  <th scope="col">Category</th>
                  <th scope="col">Issue Detail</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="save-col-header"></th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => {
                  const isPending  = record.status === 'PENDING';
                  const isEditable = isPending && !isLocked;
                  const saveState  = getSaveState(record.id);
                  const isEditing  = !!editedRecords[record.id];
                  // Treat undefined and '' as blank — but '0' is a valid count (same rule as jumpToNextBlank)
                  const editedPhys = editedRecords[record.id]?.physicalQuantity;
                  const isBlank    = isPending && record.physicalQuantity === null && (editedPhys === undefined || editedPhys === '');
                  const instantDiff = getInstantDiff(record);
                  const isSelected = selectedRowIndex >= 0 && records.filter(r => r.status === 'PENDING' && !isLocked)[selectedRowIndex]?.id === record.id;

                  return (
                    <tr
                      key={record.id}
                      className={[
                        isBlank   ? 'row-blank'   : '',
                        isEditing ? 'row-editing'  : '',
                        saveState === 'saved' ? 'row-flash-saved' : '',
                        isSelected ? 'row-selected' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {/* Material Name */}
                      <td>
                        <span className="mat-name">{record.materialCode}</span>
                      </td>

                      {/* Description */}
                      <td>
                        <span className="mat-desc">{record.materialName}</span>
                      </td>

                      {/* System Stock (editable when pending) */}
                      <td style={{ textAlign: 'right' }}>
                        {isEditable ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={getFieldValue(record, 'systemQuantity')}
                            onChange={e => updateField(record.id, 'systemQuantity', e.target.value)}
                            placeholder="0"
                            className="qty-input qty-input-sys"
                          />
                        ) : (
                          <span className="qty-sys">{record.systemQuantity}</span>
                        )}
                      </td>

                      {/* Physical Stock (editable when pending) */}
                      <td style={{ textAlign: 'right' }}>
                        {isEditable ? (
                          <input
                            ref={el => { blankRowRefs.current[record.id] = el; }}
                            type="number"
                            step="0.01"
                            min="0"
                            value={getFieldValue(record, 'physicalQuantity')}
                            onChange={e => updateField(record.id, 'physicalQuantity', e.target.value)}
                            placeholder="0"
                            className="qty-input"
                          />
                        ) : (
                          <span className="qty-val">{record.physicalQuantity ?? '—'}</span>
                        )}
                      </td>

                      {/* Gap (Diff) — updates instantly as user types */}
                      <td>
                        {instantDiff !== null ? (
                          <span
                            key={`${record.id}-${instantDiff}`}
                            className={`badge diff-badge ${
                              instantDiff === 0 ? 'badge-matched' :
                              instantDiff < 0   ? 'badge-shortage' :
                              'badge-excess'
                            }`}
                          >
                            {instantDiff > 0 ? '+' : ''}{instantDiff}
                          </span>
                        ) : (
                          <span className="diff-empty">—</span>
                        )}
                      </td>

                      {/* Category */}
                      <td>
                        {isEditable ? (
                          <select
                            value={getFieldValue(record, 'shrinkageCategory')}
                            onChange={e => {
                              updateField(record.id, 'shrinkageCategory', e.target.value);
                              // Clear issue detail when category changes
                              updateField(record.id, 'remarks', '');
                            }}
                            className="remark-select"
                            style={{ width: '100%', minWidth: 110, fontSize: 12 }}
                          >
                            <option value="">Select category…</option>
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="remark-text">{record.shrinkageCategory || '—'}</span>
                        )}
                      </td>

                      {/* Issue Detail — dropdown for every category; Other also shows custom input */}
                      <td>
                        {isEditable ? (() => {
                          const cat = getFieldValue(record, 'shrinkageCategory');
                          if (!cat) {
                            return <span style={{ fontSize: 11, color: 'var(--t4)' }}>Select a category first.</span>;
                          }

                          const remarks   = getFieldValue(record, 'remarks');
                          const presets   = ISSUE_REASONS[cat] || [];
                          const isPreset  = presets.includes(remarks);

                          // Custom mode: user clicked "Type custom" OR existing value isn't a preset
                          const isCustom  = otherCustomIds.has(record.id) ||
                                            (cat === 'Other' && remarks !== '' && !isPreset);

                          if (cat === 'Other') {
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 180 }}>
                                <select
                                  value={isCustom ? '__CUSTOM__' : remarks}
                                  onChange={e => {
                                    if (e.target.value === '__CUSTOM__') {
                                      setOtherCustomIds(prev => new Set(prev).add(record.id));
                                      // Clear remarks so custom input starts blank
                                      if (isPreset) updateField(record.id, 'remarks', '');
                                    } else {
                                      setOtherCustomIds(prev => {
                                        const s = new Set(prev); s.delete(record.id); return s;
                                      });
                                      updateField(record.id, 'remarks', e.target.value);
                                    }
                                  }}
                                  className="remark-select"
                                  style={{ width: '100%', fontSize: 12 }}
                                >
                                  <option value="">Select issue detail…</option>
                                  {presets.map(reason => (
                                    <option key={reason} value={reason}>{reason}</option>
                                  ))}
                                  <option disabled style={{ color: 'var(--t4)' }}>──────────────</option>
                                  <option value="__CUSTOM__">✏ Type a custom reason…</option>
                                </select>
                                {isCustom && (
                                  <input
                                    type="text"
                                    value={!isPreset ? remarks : ''}
                                    onChange={e => updateField(record.id, 'remarks', e.target.value)}
                                    placeholder="Type custom reason…"
                                    className="inline-input remark-input"
                                    style={{ width: '100%', fontSize: 12 }}
                                    autoFocus
                                  />
                                )}
                              </div>
                            );
                          }

                          return (
                            <select
                              value={remarks}
                              onChange={e => updateField(record.id, 'remarks', e.target.value)}
                              className="remark-select"
                              style={{ width: '100%', minWidth: 160, fontSize: 12 }}
                            >
                              <option value="">Select issue detail…</option>
                              {presets.map(reason => (
                                <option key={reason} value={reason}>{reason}</option>
                              ))}
                            </select>
                          );
                        })() : (
                          <span className="remark-text" title={record.remarks || ''}>
                            {record.remarks || '—'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {record.status === 'PENDING' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: 'rgba(217,119,6,0.13)', color: '#92400e', border: '1.5px solid rgba(217,119,6,0.30)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0, animation: 'pulse 2s ease-in-out infinite' }} />
                            Pending
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: 'rgba(22,163,74,0.13)', color: '#15803d', border: '1.5px solid rgba(22,163,74,0.30)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="10" height="10" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Submitted
                          </span>
                        )}
                      </td>

                      {/* Save controls */}
                      <td className="save-col">
                        {saveState === 'saving' && (
                          <span className="save-spinner" title="Saving…" />
                        )}
                        {saveState === 'saved' && (
                          <span className="save-check" title="Saved">
                            <IconCheck />
                          </span>
                        )}
                        {saveState === 'unsaved' && isEditable && (
                          <button
                            className="btn-row-save"
                            onClick={() => saveNow(record.id)}
                            title="Save this row now"
                          >
                            <IconSave /> Save
                          </button>
                        )}
                        {saveState === 'error' && (
                          <button
                            className="btn-row-save btn-row-retry"
                            onClick={() => saveNow(record.id)}
                            title={errorRecords.get(record.id)}
                          >
                            <IconRetry /> Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="inv-table-footer">
            <span>{records.length} record{records.length !== 1 ? 's' : ''}</span>
            {hasUnsavedChanges && (
              <span className="footer-unsaved-count">
                {Object.keys(editedRecords).length} unsaved
              </span>
            )}
          </div>
        </div>
      )}
    </StoreLayout>
  );
}
