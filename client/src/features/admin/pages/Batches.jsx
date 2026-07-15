import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDate, fmtISO } from '../../../shared/utils/dateUtils';

// Format a date for a datetime-local input in the USER'S timezone.
// (toISOString() would inject UTC into a field the browser treats as local time.)
function toLocalInputValue(dateStr) {
  const d = new Date(dateStr);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const CycleIcon = (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

export default function Batches() {
  const toast = useToast();
  const { download: downloadFile } = useDownload();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [batches, setBatches]   = useState([]);
  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');

  // Deadline editing
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [deadlineInput, setDeadlineInput]     = useState('');
  const [savingDeadline, setSavingDeadline]   = useState(false);

  // Extend modal
  const [extendModal, setExtendModal] = useState(null);
  const [extStoreId, setExtStoreId]   = useState('');
  const [extDeadline, setExtDeadline] = useState('');
  const [extNote, setExtNote]         = useState('');
  const [savingExt, setSavingExt]     = useState(false);

  // Unlock modal
  const [unlockModal, setUnlockModal]     = useState(null);
  const [unlockStoreId, setUnlockStoreId] = useState('');
  const [unlocking, setUnlocking]         = useState(false);

  // WhatsApp modal (lazy-loads users on open)
  const [users, setUsers]                 = useState([]);
  const [whatsAppModal, setWhatsAppModal] = useState(null);
  const [waStoreId, setWaStoreId]         = useState('');

  const [emailReminding, setEmailReminding] = useState(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget]         = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingBatch, setDeletingBatch]       = useState(false);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoadError('');
    setLoading(true);
    try {
      const [b, s] = await Promise.race([
        Promise.all([adminApi.getBatches(), adminApi.getStores()]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
        ),
      ]);
      setBatches(b);
      setStores(s);
      setLoading(false);
    } catch (e) {
      console.error('Load cycles:', e);
      setLoadError('Could not load cycles. Please refresh.');
      setLoading(false);
      toast.error('Could not load cycles. Please refresh.');
    }
  }

  async function loadUsersIfNeeded() {
    if (users.length === 0) {
      try { setUsers(await adminApi.getUsers()); } catch { /* non-fatal */ }
    }
  }

  async function handleSaveDeadline(batchId) {
    setSavingDeadline(true);
    try {
      const newDeadline = deadlineInput ? new Date(deadlineInput).toISOString() : null;
      await adminApi.updateBatch(batchId, { submissionDeadline: newDeadline });
      // Optimistic update
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, submissionDeadline: newDeadline } : b));
      setEditingDeadline(null);
      load(); // background sync
    } catch (e) {
      console.error('Update deadline:', e);
      toast.error('Could not update deadline. Try again.');
    } finally { setSavingDeadline(false); }
  }

  async function handleGrantExtension() {
    if (!extStoreId || !extDeadline) { toast.warning('Please select a store and a deadline'); return; }
    setSavingExt(true);
    const storeId = parseInt(extStoreId);
    const newDeadline = new Date(extDeadline).toISOString();
    try {
      await adminApi.grantStoreExtension({ batchId: extendModal.batchId, storeId, newDeadline, note: extNote || undefined });
      // Optimistic update — add/replace the extension in local state
      setBatches(prev => prev.map(b => {
        if (b.id !== extendModal.batchId) return b;
        const exts = (b.deadlineExtensions || []).filter(e => e.storeId !== storeId);
        return { ...b, deadlineExtensions: [...exts, { storeId, newDeadline }] };
      }));
      setExtendModal(null);
      setExtStoreId(''); setExtDeadline(''); setExtNote('');
      load(); // background sync
    } catch (e) {
      console.error('Grant extension:', e);
      toast.error('Could not give extension. Try again.');
    } finally { setSavingExt(false); }
  }

  async function handleUnlockStore() {
    if (!unlockStoreId) { toast.warning('Select a store first'); return; }
    setUnlocking(true);
    try {
      const res = await adminApi.unlockStoreForBatch(unlockModal.batchId, parseInt(unlockStoreId));
      toast.success(`Done — manager can now re-count and submit again`);
      setUnlockModal(null);
      setUnlockStoreId('');
      load(); // background sync
    } catch (e) {
      console.error('Unlock store:', e);
      toast.error('Could not unlock. Try again.');
    } finally { setUnlocking(false); }
  }

  async function confirmDeleteBatch() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeletingBatch(true);
    // Optimistic remove
    setBatches(prev => prev.filter(b => b.id !== target.id));
    setDeleteTarget(null);
    try {
      await adminApi.deleteBatch(target.id);
      toast.success('Cycle deleted');
    } catch (e) {
      console.error('Delete cycle:', e);
      toast.error('Could not delete cycle. Try again.');
      load();
    } finally { setDeletingBatch(false); }
  }

  const handleBatchExport = (batchId, inventoryDate) =>
    downloadFile(adminApi.getBatchExport, `KinGuard_Cycle_${fmtISO(inventoryDate)}.xlsx`, batchId);

  const handleBatchExportPDF = (batchId, inventoryDate) =>
    downloadFile(adminApi.getBatchExportPDF, `KinGuard_Cycle_${fmtISO(inventoryDate)}.pdf`, batchId);

  async function handleSendEmailReminders(batchId) {
    setEmailReminding(batchId);
    try {
      const res = await adminApi.sendBatchReminders(batchId);
      if (res.sent > 0) {
        toast.success(res.message || `Reminder sent to ${res.sent} manager(s)`);
      } else {
        toast.error(res.message || 'Could not send email reminders');
      }
    } catch (e) {
      console.error('Send email reminders:', e);
      toast.error('Could not send reminders. Try again.');
    } finally { setEmailReminding(null); }
  }

  function sendWhatsAppReminder(store, inventoryDate, deadline) {
    const mgr = users.find(u => u.storeId === store.id && u.role === 'STORE_MANAGER' && u.isActive);
    if (!mgr?.phone) { toast.warning(`${store.storeName} has no phone number. Add it in Users.`); return; }
    const digits = mgr.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) { toast.warning(`${store.storeName} has an invalid phone number. Fix it in Users.`); return; }
    const safeName = mgr.name.replace(/[<>&"]/g, '');
    const dlStr    = deadline ? `before ${fmtDate(deadline, 'time')}` : 'as soon as possible';
    const msg = `Hi ${safeName},\n\nThis is a reminder from *KinMarché L&P*.\n\nYour inventory count for *${fmtDate(inventoryDate, 'long')}* is still pending. Please log in and complete your submission ${dlStr}.\n\nThank you.`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  const subtitle = loading
    ? 'Loading cycles…'
    : loadError
      ? 'Failed to load cycles — see below'
      : batches.length === 0
        ? 'No cycles yet — upload a master file to start the first cycle.'
        : `${batches.length} inventory cycle${batches.length !== 1 ? 's' : ''} · Manage deadlines, unlock submissions, and export data.`;

  return (
    <AdminLayout>
      <PageHeader title="Inventory Cycles" subtitle={subtitle} />

      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : loadError ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', color: 'var(--red)' }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--t1)' }}>Failed to Load Cycles</h3>
          <p style={{ color: 'var(--t3)', marginBottom: 16 }}>{loadError}</p>
          <button onClick={load} className="btn btn-primary">Retry</button>
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={CycleIcon}
          title="No Inventory Cycles"
          description="Upload a master Excel file to create your first inventory cycle and assign items to stores."
          help="Navigate to Upload → Select your master file → Items will be assigned to all stores."
        />
      ) : (
        <div className="card">

          {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
          <div className="batch-cards">
            {batches.map(b => {
              const stats  = b.stats || {};
              const total  = stats.totalRecords   || 0;
              const sub    = stats.submittedCount || 0;
              const pend   = stats.pendingCount   || 0;
              const pct    = total > 0 ? Math.round((sub / total) * 100) : 0;
              const passed = b.submissionDeadline && new Date() > new Date(b.submissionDeadline);

              return (
                <div key={b.id} className="batch-card">
                  {/* Header row */}
                  <div className="batch-card-top">
                    <span className="batch-card-date">{fmtDate(b.inventoryDate)}</span>
                    <span className="badge badge-pending">{total} records</span>
                  </div>

                  {/* File + uploader */}
                  <div className="batch-card-file" title={b.originalFileName}>
                    {b.originalFileName}
                  </div>
                  <div className="batch-card-meta">Uploaded by {b.uploader?.name || '—'}</div>

                  {/* Progress */}
                  <div className="batch-card-progress-row">
                    <div className="batch-card-bar">
                      <div className="batch-card-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--vi)' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{sub}/{total}</span>
                  </div>
                  {pend > 0 && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: -4 }}>{pend} pending</div>}

                  {/* Deadline */}
                  <div className="batch-card-deadline">
                    <span style={{ color: 'var(--t3)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Deadline</span>
                    {editingDeadline === b.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                        <input
                          type="datetime-local"
                          value={deadlineInput}
                          onChange={e => setDeadlineInput(e.target.value)}
                          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', flex: 1, minWidth: 0 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveDeadline(b.id)} disabled={savingDeadline}>{savingDeadline ? '…' : 'Save'}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingDeadline(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ color: passed ? 'var(--red)' : b.submissionDeadline ? 'var(--t2)' : 'var(--t3)', fontSize: 13 }}>
                        {b.submissionDeadline ? fmtDate(b.submissionDeadline, 'time') : 'No deadline set'}
                        {passed && <span className="badge badge-shortage" style={{ marginLeft: 6, fontSize: 10 }}>Past Due</span>}
                      </span>
                    )}
                  </div>

                  {/* Action buttons — 3-column grid */}
                  <div className="batch-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingDeadline(b.id); setDeadlineInput(b.submissionDeadline ? toLocalInputValue(b.submissionDeadline) : ''); }}>Set Deadline</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setExtendModal({ batchId: b.id })}>Extend</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setUnlockModal({ batchId: b.id })}>Unlock</button>
                    <button className="btn btn-success btn-sm" onClick={() => handleBatchExport(b.id, b.inventoryDate)}>Excel</button>
                    <button className="btn btn-sm" onClick={() => handleBatchExportPDF(b.id, b.inventoryDate)} style={{ background: 'rgba(185,28,28,0.10)', color: '#991b1b', border: '1px solid rgba(185,28,28,0.28)' }}>PDF</button>
                    <button className="btn btn-sm" onClick={() => handleSendEmailReminders(b.id)} disabled={emailReminding === b.id} style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.22)' }}>{emailReminding === b.id ? '…' : 'Email'}</button>
                    <button className="btn btn-sm" onClick={() => { loadUsersIfNeeded(); setWhatsAppModal({ batchId: b.id, inventoryDate: b.inventoryDate, deadline: b.submissionDeadline }); }} style={{ background: 'rgba(37,211,102,0.09)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.22)' }}>WhatsApp</button>
                    <button className="btn btn-sm btn-wide" onClick={() => { setDeleteTarget(b); setDeleteConfirmText(''); }} style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontSize: 11 }}>Delete Cycle</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (>768px) ────────────────────────────── */}
          <div className="table-wrap batch-table-desktop">
            <table className="scorecard">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">File</th>
                  <th scope="col">Uploaded By</th>
                  <th scope="col" style={{ textAlign: 'center' }}>Records</th>
                  <th scope="col" style={{ minWidth: 160 }}>Progress</th>
                  <th scope="col">Submission Deadline</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => {
                  const stats  = b.stats || {};
                  const total  = stats.totalRecords   || 0;
                  const sub    = stats.submittedCount || 0;
                  const pend   = stats.pendingCount   || 0;
                  const pct    = total > 0 ? Math.round((sub / total) * 100) : 0;
                  const passed = b.submissionDeadline && new Date() > new Date(b.submissionDeadline);

                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDate(b.inventoryDate)}</td>
                      <td style={{ fontSize: 11, color: 'var(--t3)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.originalFileName}>
                        {b.originalFileName}
                      </td>
                      <td style={{ fontSize: 12 }}>{b.uploader?.name || '—'}</td>
                      <td style={{ textAlign: 'center' }}><span className="badge badge-pending">{total}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--vi)', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{sub}/{total}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{pend} pending</div>
                      </td>
                      <td>
                        {editingDeadline === b.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="datetime-local"
                              value={deadlineInput}
                              onChange={e => setDeadlineInput(e.target.value)}
                              style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)' }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => handleSaveDeadline(b.id)} disabled={savingDeadline}>{savingDeadline ? '…' : 'Save'}</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingDeadline(null)}>✕</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: passed ? 'var(--red)' : b.submissionDeadline ? 'var(--t2)' : 'var(--t3)' }}>
                            {b.submissionDeadline ? fmtDate(b.submissionDeadline, 'time') : 'No deadline'}
                            {passed && <span className="badge badge-shortage" style={{ marginLeft: 6, fontSize: 10 }}>Past Due</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingDeadline(b.id); setDeadlineInput(b.submissionDeadline ? toLocalInputValue(b.submissionDeadline) : ''); }}>Deadline</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setExtendModal({ batchId: b.id })}>Extend Store</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setUnlockModal({ batchId: b.id })} title="Reset a store's submission so they can re-count">Unlock Store</button>
                          <button className="btn btn-success btn-sm" onClick={() => handleBatchExport(b.id, b.inventoryDate)}>Excel</button>
                          <button className="btn btn-sm" onClick={() => handleBatchExportPDF(b.id, b.inventoryDate)} style={{ background: 'rgba(185,28,28,0.10)', color: '#991b1b', border: '1px solid rgba(185,28,28,0.28)' }}>PDF</button>
                          <button className="btn btn-sm" onClick={() => handleSendEmailReminders(b.id)} disabled={emailReminding === b.id} title="Send email reminder to all pending store managers" style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.22)' }}>{emailReminding === b.id ? '…' : 'Email'}</button>
                          <button className="btn btn-sm" onClick={() => { loadUsersIfNeeded(); setWhatsAppModal({ batchId: b.id, inventoryDate: b.inventoryDate, deadline: b.submissionDeadline }); }} style={{ background: 'rgba(37,211,102,0.09)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.22)' }}>WhatsApp</button>
                          <button className="btn btn-sm" onClick={() => { setDeleteTarget(b); setDeleteConfirmText(''); }} style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontSize: 11 }} title="Permanently delete this cycle and all its records">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Extend deadline modal */}
      {extendModal && (
        <Modal onClose={() => setExtendModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Extend Deadline for Store</h3>
              <button className="close-btn" onClick={() => setExtendModal(null)}>&times;</button>
            </div>
            <div className="form-group">
              <label htmlFor="ext-plant">Store</label>
              <select id="ext-plant" value={extStoreId} onChange={e => setExtStoreId(e.target.value)}>
                <option value="">Select store…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ext-deadline">New Deadline</label>
              <input id="ext-deadline" type="datetime-local" value={extDeadline} onChange={e => setExtDeadline(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="ext-note">Note <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(optional)</span></label>
              <input id="ext-note" type="text" value={extNote} onChange={e => setExtNote(e.target.value)} placeholder="Reason for extension…" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setExtendModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGrantExtension} disabled={savingExt}>{savingExt ? 'Saving…' : 'Grant Extension'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Unlock modal */}
      {unlockModal && (
        <Modal onClose={() => !unlocking && setUnlockModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unlock Store Submission</h3>
              <button className="close-btn" onClick={() => setUnlockModal(null)} disabled={unlocking}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
              Resetting a store&apos;s submission clears all physical counts and remarks, returning records to <strong>Pending</strong> status. The store manager can then re-count and re-submit.
            </p>
            <div className="form-group">
              <label htmlFor="ul-plant">Store to unlock</label>
              <select id="ul-plant" value={unlockStoreId} onChange={e => setUnlockStoreId(e.target.value)} disabled={unlocking}>
                <option value="">Select store…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setUnlockModal(null)} disabled={unlocking}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUnlockStore} disabled={unlocking || !unlockStoreId}>{unlocking ? 'Unlocking…' : 'Unlock & Reset'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal onClose={() => !deletingBatch && setDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Delete Cycle</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)} disabled={deletingBatch}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              This permanently deletes <strong>{deleteTarget.stats?.totalRecords ?? 0}</strong> inventory record(s) from the cycle dated <strong>{fmtDate(deleteTarget.inventoryDate, 'long')}</strong>. This cannot be undone.
            </div>
            <div className="form-group">
              <label htmlFor="batch-del-confirm" style={{ fontSize: 12 }}>Type <strong>DELETE</strong> to confirm</label>
              <input id="batch-del-confirm" type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE" autoFocus disabled={deletingBatch} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deletingBatch}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteBatch} disabled={deletingBatch || deleteConfirmText !== 'DELETE'}>
                {deletingBatch ? 'Deleting…' : 'Delete Cycle'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* WhatsApp modal */}
      {whatsAppModal && (
        <Modal onClose={() => { setWhatsAppModal(null); setWaStoreId(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>WhatsApp Reminder</h3>
              <button className="close-btn" onClick={() => { setWhatsAppModal(null); setWaStoreId(''); }}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
              Select a store to open WhatsApp with a pre-written reminder for the store manager. The manager must have a phone number registered in User Management.
            </p>
            <div className="form-group">
              <label htmlFor="wa-plant">Store</label>
              <select id="wa-plant" value={waStoreId} onChange={e => setWaStoreId(e.target.value)}>
                <option value="">Select store…</option>
                {stores.map(s => {
                  const mgr = users.find(u => u.storeId === s.id && u.role === 'STORE_MANAGER' && u.isActive);
                  return <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}{mgr?.phone ? ` · ${mgr.phone}` : ' · (no phone on file)'}</option>;
                })}
              </select>
            </div>
            {waStoreId && (() => {
              const mgr = users.find(u => u.storeId === parseInt(waStoreId) && u.role === 'STORE_MANAGER' && u.isActive);
              return (
                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)', marginBottom: 16, fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
                  <div><strong>Manager:</strong> {mgr?.name || <span style={{ color: 'var(--t4)' }}>No active manager found</span>}</div>
                  <div><strong>Phone:</strong> {mgr?.phone || <span style={{ color: 'var(--red)' }}>Not set — add in Users → Edit</span>}</div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => { setWhatsAppModal(null); setWaStoreId(''); }}>Cancel</button>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(37,211,102,0.10)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.22)', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
                disabled={!waStoreId}
                onClick={() => {
                  const store = stores.find(s => String(s.id) === waStoreId);
                  if (!store) return;
                  sendWhatsAppReminder(store, whatsAppModal.inventoryDate, whatsAppModal.deadline);
                  setWhatsAppModal(null);
                  setWaStoreId('');
                }}
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
