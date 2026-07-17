import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { useToast } from '../../../shared/context/ToastContext';
import * as amApi from '../../../shared/api/amApi';
import { fmtDate } from '../../../shared/utils/dateUtils';

const STATUS_LABEL  = { PENDING_REVIEW: 'Awaiting Review', APPROVED: 'Approved', RETURNED: 'Returned' };
const STATUS_COLOR  = { PENDING_REVIEW: '#d97706', APPROVED: '#16a34a', RETURNED: '#dc2626' };
const CATEGORIES    = ['Theft', 'Damage', 'Expiry', 'Miscount', 'Transfer', 'Supplier', 'Other'];

export default function AMReview() {
  const { batchId } = useParams();
  const navigate    = useNavigate();
  const toast       = useToast();

  const [stores,      setStores]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null); // { storeId, storeName, storeCode }
  const [batchDate,   setBatchDate]   = useState('');
  const [records,     setRecords]     = useState([]);
  const [review,      setReview]      = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [editedRecs,  setEditedRecs]  = useState({});
  const [remarks,     setRemarks]     = useState('');
  const [returnReason,setReturnReason]= useState('');
  const [showReturn,  setShowReturn]  = useState(false);
  const [working,     setWorking]     = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      amApi.getBatchStores(batchId),
      amApi.getBatches(),
    ]).then(([s, batches]) => {
      if (!live) return;
      setStores(s);
      const batch = batches.find(b => String(b.id) === String(batchId));
      if (batch?.inventoryDate) setBatchDate(fmtDate(batch.inventoryDate, 'long'));
    })
      .catch(e => { if (!live) return; console.error('AM batch stores:', e); toast.error('Could not load stores.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [batchId, toast]);

  const openStore = useCallback(async (store) => {
    setSelected(store);
    setRecords([]);        // clear stale records immediately so old store's data never shows
    setReview(null);
    setEditedRecs({});
    setRemarks(store.reviewRemarks || '');
    setShowReturn(false);
    setReturnReason('');
    setLoadingRecs(true);
    let live = true;
    try {
      const { records: recs, review: rev } = await amApi.getStoreRecords(batchId, store.id);
      if (live) { setRecords(recs); setReview(rev); }
    } catch (e) {
      if (live) { console.error('AM store records:', e); toast.error('Could not load records.'); }
    } finally {
      if (live) setLoadingRecs(false);
    }
  }, [batchId, toast]);

  function editField(id, field, value) {
    setEditedRecs(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  }

  async function saveEdit(record) {
    const edits = editedRecs[record.id];
    if (!edits) return;
    try {
      const updated = await amApi.updateRecord(record.id, edits);
      setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
      setEditedRecs(prev => { const n = { ...prev }; delete n[record.id]; return n; });
      toast.success('Record updated');
    } catch (e) {
      console.error('AM update record:', e);
      toast.error('Could not save change.');
    }
  }

  async function handleApprove() {
    setWorking(true);
    try {
      await amApi.approveStore(batchId, selected.id, { remarks });
      toast.success(`${selected.storeName} approved — passed to Admin`);
      setStores(prev => prev.map(s => s.id === selected.id ? { ...s, reviewStatus: 'APPROVED', reviewRemarks: remarks } : s));
      setReview({ status: 'APPROVED', remarks });
      setEditedRecs({});
    } catch (e) {
      console.error('AM approve:', e);
      toast.error('Could not approve. Try again.');
    } finally { setWorking(false); }
  }

  async function handleReturn() {
    if (!returnReason.trim()) { toast.warning('Please enter a reason for returning.'); return; }
    setWorking(true);
    try {
      await amApi.returnStore(batchId, selected.id, { remarks: returnReason });
      toast.success(`${selected.storeName} sent back for recount`);
      setStores(prev => prev.map(s => s.id === selected.id ? { ...s, reviewStatus: 'RETURNED', reviewRemarks: returnReason } : s));
      setSelected(prev => ({ ...prev, reviewStatus: 'RETURNED', allSubmitted: false }));
      setReview({ status: 'RETURNED', remarks: returnReason });
      setEditedRecs({});
      setRecords([]);
      setShowReturn(false);
      setReturnReason('');
    } catch (e) {
      console.error('AM return:', e);
      toast.error('Could not return. Try again.');
    } finally { setWorking(false); }
  }

  return (
    <AMLayout>
      <PageHeader
        title="Review Submissions"
        subtitle={batchDate ? `Cycle: ${batchDate}` : 'Loading…'}
      >
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/am/review')}>← Back to cycles</button>
      </PageHeader>

      <div className={`am-review-grid ${selected ? 'has-selection' : 'no-selection'}`}>

        {/* Store list */}
        <div className="card am-review-store-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--red-border)' }}>
            Your Stores ({stores.length})
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)' }}>Loading…</div>
          ) : stores.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
              No stores have submitted for this cycle yet.
            </div>
          ) : stores.map(store => (
            <button
              key={store.id}
              onClick={() => openStore(store)}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px',
                background: selected?.id === store.id ? 'rgba(29,78,216,0.08)' : 'none',
                border: 'none', borderBottom: '1px solid var(--red-border)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx1)' }}>{store.storeName}</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{store.storeCode} · {store.submitted}/{store.total} submitted</div>
              {store.reviewStatus && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                  background: `${STATUS_COLOR[store.reviewStatus]}20`,
                  color: STATUS_COLOR[store.reviewStatus],
                  border: `1px solid ${STATUS_COLOR[store.reviewStatus]}40`,
                  alignSelf: 'flex-start', marginTop: 2,
                }}>
                  {STATUS_LABEL[store.reviewStatus]}
                </span>
              )}
              {!store.allSubmitted && !store.reviewStatus && (
                <span style={{ fontSize: 10, color: 'var(--tx3)', fontStyle: 'italic' }}>Not yet submitted</span>
              )}
            </button>
          ))}
        </div>

        {/* Records panel */}
        {selected && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--red-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx1)' }}>{selected.storeName}</div>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{selected.storeCode}</div>
              </div>
              {review && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: `${STATUS_COLOR[review.status]}20`, color: STATUS_COLOR[review.status],
                  border: `1px solid ${STATUS_COLOR[review.status]}40`,
                }}>
                  {STATUS_LABEL[review.status]}
                </span>
              )}
            </div>

            {loadingRecs ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)' }}>Loading records…</div>
            ) : (
              <>
                {/* Records table */}
                <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 80 }}>Item Code</th>
                        <th style={{ minWidth: 120 }}>Name</th>
                        <th style={{ textAlign: 'right', minWidth: 64 }}>System</th>
                        <th style={{ textAlign: 'right', minWidth: 80 }}>Physical</th>
                        <th style={{ textAlign: 'right', minWidth: 72 }}>Variance</th>
                        <th style={{ minWidth: 100 }}>Category</th>
                        <th style={{ minWidth: 110 }}>Remarks</th>
                        {review?.status !== 'APPROVED' && <th style={{ minWidth: 52 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => {
                        const edited = editedRecs[r.id] || {};
                        const qty    = edited.physicalQuantity !== undefined ? edited.physicalQuantity : r.physicalQuantity;
                        const cat    = edited.shrinkageCategory !== undefined ? edited.shrinkageCategory : r.shrinkageCategory;
                        const rem    = edited.remarks !== undefined ? edited.remarks : r.remarks;
                        const diff   = qty !== null && qty !== undefined ? qty - r.systemQuantity : r.difference;
                        const hasDiff= diff !== null && diff !== 0;
                        const dirty  = !!editedRecs[r.id];

                        return (
                          <tr key={r.id} style={{ background: hasDiff && diff < 0 ? 'rgba(220,38,38,0.04)' : 'none' }}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.materialCode}</td>
                            <td>{r.materialName}</td>
                            <td style={{ textAlign: 'right' }}>{r.systemQuantity}</td>
                            <td style={{ textAlign: 'right' }}>
                              {review?.status !== 'APPROVED' ? (
                                <input
                                  type="number" min="0" step="0.01"
                                  value={qty ?? ''}
                                  onChange={e => editField(r.id, 'physicalQuantity', e.target.value === '' ? null : parseFloat(e.target.value))}
                                  style={{ width: 70, textAlign: 'right', padding: '3px 6px', fontSize: 12, border: '1px solid var(--red-border)', borderRadius: 6 }}
                                />
                              ) : (qty ?? '—')}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : 'var(--tx3)' }}>
                              {diff !== null ? `${diff > 0 ? '+' : ''}${typeof diff === 'number' ? diff.toFixed(2).replace(/\.00$/, '') : diff}` : '—'}
                            </td>
                            <td>
                              {review?.status !== 'APPROVED' ? (
                                <select
                                  value={cat || ''}
                                  onChange={e => editField(r.id, 'shrinkageCategory', e.target.value || null)}
                                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--red-border)', borderRadius: 6 }}
                                >
                                  <option value="">—</option>
                                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              ) : (cat || '—')}
                            </td>
                            <td>
                              {review?.status !== 'APPROVED' ? (
                                <input
                                  type="text"
                                  value={rem || ''}
                                  onChange={e => editField(r.id, 'remarks', e.target.value || null)}
                                  placeholder="Add note…"
                                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--red-border)', borderRadius: 6, width: 120 }}
                                />
                              ) : (rem || '—')}
                            </td>
                            {review?.status !== 'APPROVED' && (
                              <td>
                                {dirty && (
                                  <button
                                    className="btn btn-sm"
                                    style={{ fontSize: 10, padding: '3px 8px' }}
                                    onClick={() => saveEdit(r)}
                                  >Save</button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Review actions */}
                {(!review || review.status === 'PENDING_REVIEW' || review.status === 'RETURNED') && selected.allSubmitted && (
                  <div style={{ padding: 16, borderTop: '1px solid var(--red-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>
                        Your Remarks (optional for approval, required for return)
                      </label>
                      <textarea
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                        placeholder="Add remarks about this submission…"
                        rows={2}
                        style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--red-border)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                      <button className="btn btn-success" onClick={handleApprove} disabled={working} style={{ flex: '1 1 auto', minHeight: 44 }}>
                        {working ? '…' : '✓ Approve & Pass to Admin'}
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)', flex: '0 0 auto', minHeight: 44 }}
                        onClick={() => setShowReturn(v => !v)}
                      >
                        ↩ Return for Recount
                      </button>
                    </div>

                    {showReturn && (
                      <div style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Return Reason (required)</div>
                        <textarea
                          value={returnReason}
                          onChange={e => setReturnReason(e.target.value)}
                          placeholder="Explain what needs to be recounted…"
                          rows={2}
                          style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid rgba(220,38,38,0.30)', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <button
                          className="btn btn-sm"
                          style={{ background: '#dc2626', color: '#fff', border: 'none', alignSelf: 'flex-start' }}
                          onClick={handleReturn}
                          disabled={working}
                        >
                          {working ? '…' : 'Confirm Return'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {review?.status === 'APPROVED' && (
                  <div style={{ padding: 14, borderTop: '1px solid var(--red-border)', background: 'rgba(22,163,74,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#16a34a', fontSize: 18 }}>✓</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#16a34a' }}>Approved — passed to Admin</div>
                      {review.remarks && <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>{review.remarks}</div>}
                    </div>
                  </div>
                )}

                {!selected.allSubmitted && (
                  <div style={{ padding: 14, borderTop: '1px solid var(--red-border)', color: 'var(--tx3)', fontSize: 13, fontStyle: 'italic' }}>
                    Store manager has not submitted yet.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AMLayout>
  );
}
