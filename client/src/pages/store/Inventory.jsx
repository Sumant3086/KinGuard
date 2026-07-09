import { useState, useEffect, useRef, useCallback } from 'react';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';
import { useToast } from '../../context/ToastContext';

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
  const [records, setRecords]           = useState([]);
  const [batches, setBatches]           = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [isLocked, setIsLocked]         = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editedRecords, setEditedRecords] = useState({});
  const [savingRecords, setSavingRecords] = useState(new Set());
  const [savedRecords, setSavedRecords]   = useState(new Set());
  const [errorRecords, setErrorRecords]   = useState(new Map());
  const [submitting, setSubmitting]     = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [searchInput, setSearchInput]   = useState('');

  const debounceTimers    = useRef({});
  const editedRecordsRef  = useRef({});
  const editTimestampRef  = useRef({});
  const blankRowRefs      = useRef({});
  const batchesReadyRef   = useRef(false);

  useEffect(() => { loadBatches(); }, []);

  // Debounce search: only send API request 400ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!batchesReadyRef.current) return;
    loadInventory();
  }, [search, statusFilter, selectedBatch]);

  useEffect(() => {
    return () => { Object.values(debounceTimers.current).forEach(clearTimeout); };
  }, []);

  async function loadBatches() {
    try {
      const data = await storeApi.getBatches();
      setBatches(data);
      batchesReadyRef.current = true;
      if (data.length > 0) {
        setSelectedBatch(data[0].id.toString());
      } else {
        loadInventory();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory cycles. Please refresh the page.');
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      return parseFloat((phys - (isNaN(sys) ? 0 : sys)).toFixed(4));
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
    const blank = records.find(r =>
      r.status === 'PENDING' &&
      r.physicalQuantity === null &&
      !editedRecords[r.id]?.physicalQuantity
    );
    if (blank) {
      const el = blankRowRefs.current[blank.id];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }
  }

  async function handleSubmit() {
    if (!selectedBatch) {
      toast.warning('Please select a specific date before submitting');
      return;
    }
    const batchId = parseInt(selectedBatch);
    if (Object.keys(editedRecordsRef.current).length > 0) {
      toast.warning('Please wait for all changes to save before submitting');
      return;
    }
    if (!confirm('Submit your inventory? All pending items will become read-only. Your manager will be notified.')) return;
    try {
      setSubmitting(true);
      const res = await storeApi.submitInventory(batchId);
      setSubmitResult(res);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit inventory');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    try {
      const blob = await storeApi.downloadInventory(selectedBatch || undefined);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'inventory.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to download');
    }
  }

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
            <h2>Inventory Submitted!</h2>
            <p>{submitResult.recordCount} items counted &amp; submitted successfully. Your manager has been notified.</p>
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
                      <th>Material Name</th>
                      <th>System Stock</th>
                      <th>Physical Stock</th>
                      <th>Gap</th>
                      <th>Remarks</th>
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
              Download My Report
            </button>
          </div>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      {/* ── Entry progress bar ── */}
      {totalPending > 0 && !isLocked && (
        <div className="inv-progress-bar">
          <div className="inv-progress-left">
            <span className="inv-progress-fraction">
              <strong>{enteredCount}</strong> / {totalPending}
            </span>
            <span className="inv-progress-label">items counted &amp; saved</span>
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
                <button className="btn-jump" onClick={jumpToNextBlank}>Jump to next</button>
              </>
            ) : (
              <span className="inv-all-entered">All entered</span>
            )}
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-header" style={{ marginTop: 24 }}>
        <div>
          <h2>Inventory Entry</h2>
          {selectedBatch && batches.length > 0 && (() => {
            const b = batches.find(b => b.id.toString() === selectedBatch);
            return b ? (
              <p>{new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            ) : null;
          })()}
        </div>
        <div className="actions" style={{ margin: 0 }}>
          {totalPending > 0 && !isLocked && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || hasUnsavedChanges || isSaving}
                className="btn btn-success"
                title={hasUnsavedChanges || isSaving ? 'Wait for all changes to save first' : ''}
              >
                {submitting ? 'Submitting…' : `Submit All (${totalPending} pending)`}
              </button>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Once submitted, your manager will be notified</span>
            </div>
          )}
          <button onClick={handleDownload} className="btn btn-ghost btn-sm">
            Download
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {isLocked && (
        <div className="lock-banner">
          <span className="lock-banner-icon">🔒</span>
          <div>
            <p>Your inventory is locked.</p>
            <span>Contact your administrator to make changes or request an extension.</span>
          </div>
        </div>
      )}

      {(hasUnsavedChanges || isSaving) && (
        <div className="autosave-notice">
          <div className="autosave-dot" />
          {isSaving ? 'Saving changes…' : 'Changes save automatically when you click Save'}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="inv-filters">
        <div className="filter-group">
          <span className="filter-label">Cycle / Date</span>
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
            Select any past cycle to view historical records (read-only)
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
              placeholder="Search materials…"
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
        <div className="loading"><div className="loading-spinner" />Loading inventory…</div>
      ) : records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p>No items assigned to your store for this cycle.</p>
          </div>
        </div>
      ) : (
        <div className="inv-table-card">
          <div className="table-container">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Material Name</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>System Stock</th>
                  <th style={{ textAlign: 'right' }}>Physical Stock</th>
                  <th>Gap</th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th className="save-col-header"></th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => {
                  const isPending  = record.status === 'PENDING';
                  const isEditable = isPending && !isLocked;
                  const saveState  = getSaveState(record.id);
                  const isEditing  = !!editedRecords[record.id];
                  const isBlank    = isPending && record.physicalQuantity === null && !editedRecords[record.id]?.physicalQuantity;
                  const instantDiff = getInstantDiff(record);

                  return (
                    <tr
                      key={record.id}
                      className={[
                        isBlank   ? 'row-blank'   : '',
                        isEditing ? 'row-editing'  : '',
                        saveState === 'saved' ? 'row-flash-saved' : '',
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

                      {/* Remarks */}
                      <td>
                        {isEditable ? (
                          <div className="remark-wrap">
                            <div style={{ marginBottom: 4 }}>
                              <select
                                value={getFieldValue(record, 'shrinkageCategory')}
                                onChange={e => updateField(record.id, 'shrinkageCategory', e.target.value)}
                                className="remark-select"
                                style={{ width: '100%', fontSize: 12 }}
                              >
                                <option value="">Category…</option>
                                <option value="THEFT">Theft</option>
                                <option value="DAMAGE">Damage</option>
                                <option value="EXPIRED">Expired</option>
                                <option value="COUNTING_ERROR">Counting Error</option>
                                <option value="TRANSFER">Transfer</option>
                                <option value="SAMPLE_USE">Sample Use</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <input
                              type="text"
                              value={getFieldValue(record, 'remarks')}
                              onChange={e => updateField(record.id, 'remarks', e.target.value)}
                              placeholder="Add remark…"
                              className="inline-input remark-input"
                            />
                            <select
                              className="remark-select"
                              onChange={e => {
                                if (e.target.value) {
                                  updateField(record.id, 'remarks', e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              title="Quick select remark"
                            >
                              <option value="">▼</option>
                              <option value="Damaged items removed">Damaged items removed</option>
                              <option value="Stock expired">Stock expired</option>
                              <option value="Theft suspected">Theft suspected</option>
                              <option value="Counting error corrected">Counting error corrected</option>
                              <option value="Transfer to another store">Transfer to another store</option>
                              <option value="Display sample used">Display sample used</option>
                            </select>
                          </div>
                        ) : (
                          <span className="remark-text">{record.remarks || '—'}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge badge-${record.status.toLowerCase()}`}>
                          {record.status === 'PENDING' ? 'Pending' : 'Submitted'}
                        </span>
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
