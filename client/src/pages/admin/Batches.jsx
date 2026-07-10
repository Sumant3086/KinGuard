import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import { useToast } from '../../context/ToastContext';

export default function AdminBatches() {
  const toast = useToast();
  const [batches, setBatches]   = useState([]);
  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);

  // Deadline edit
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [deadlineInput, setDeadlineInput]     = useState('');
  const [savingDeadline, setSavingDeadline]   = useState(false);

  // Extension modal
  const [extendModal, setExtendModal] = useState(null);
  const [extStoreId, setExtStoreId]   = useState('');
  const [extDeadline, setExtDeadline] = useState('');
  const [extNote, setExtNote]         = useState('');
  const [savingExt, setSavingExt]     = useState(false);

  // Unlock modal
  const [unlockModal, setUnlockModal]   = useState(null);
  const [unlockStoreId, setUnlockStoreId] = useState('');
  const [unlocking, setUnlocking]       = useState(false);
  const [users, setUsers]               = useState([]);
  const [whatsAppModal, setWhatsAppModal] = useState(null);
  const [waStoreId, setWaStoreId]         = useState('');
  const [emailReminding, setEmailReminding] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [b, s, u] = await Promise.all([adminApi.getBatches(), adminApi.getStores(), adminApi.getUsers()]);
      setBatches(b);
      setStores(s);
      setUsers(u);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load cycles. Please refresh.');
    } finally { setLoading(false); }
  }

  async function handleSaveDeadline(batchId) {
    setSavingDeadline(true);
    try {
      await adminApi.updateBatch(batchId, { submissionDeadline: deadlineInput || null });
      await load();
      setEditingDeadline(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update deadline');
    } finally { setSavingDeadline(false); }
  }

  async function handleGrantExtension() {
    if (!extStoreId || !extDeadline) { toast.warning('Plant and deadline are required'); return; }
    setSavingExt(true);
    try {
      await adminApi.grantStoreExtension({
        batchId: extendModal.batchId,
        storeId: parseInt(extStoreId),
        newDeadline: extDeadline,
        note: extNote || undefined,
      });
      await load();
      setExtendModal(null);
      setExtStoreId(''); setExtDeadline(''); setExtNote('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to grant extension');
    } finally { setSavingExt(false); }
  }

  async function handleUnlockStore() {
    if (!unlockStoreId) { toast.warning('Select a plant to unlock'); return; }
    setUnlocking(true);
    try {
      const res = await adminApi.unlockStoreForBatch(unlockModal.batchId, parseInt(unlockStoreId));
      toast.success(`${res.count} record(s) reset to pending. The plant manager can now re-count.`);
      await load();
      setUnlockModal(null);
      setUnlockStoreId('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Unlock failed');
    } finally { setUnlocking(false); }
  }

  async function handleDeleteBatch(batch) {
    const confirmed = prompt(
      `DELETE CYCLE: ${new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n` +
      `File: ${batch.originalFileName}\n` +
      `Records: ${batch.stats?.totalRecords ?? '?'}\n\n` +
      `This permanently deletes all inventory records and cannot be undone.\n\n` +
      `Type DELETE to confirm:`
    );
    if (confirmed !== 'DELETE') {
      if (confirmed !== null) toast.warning('Confirmation text did not match. Deletion cancelled.');
      return;
    }
    try {
      await adminApi.deleteBatch(batch.id);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete cycle');
    }
  }

  async function handleBatchExport(batchId, inventoryDate) {
    try {
      const blob = await adminApi.getBatchExport(batchId);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_Cycle_${String(inventoryDate).split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Export failed');
    }
  }

  async function handleBatchExportPDF(batchId, inventoryDate) {
    try {
      const blob = await adminApi.getBatchExportPDF(batchId);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_Cycle_${new Date(inventoryDate).toISOString().split('T')[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e) {
      toast.error(e.response?.data?.error || 'PDF export failed');
    }
  }

  async function handleSendEmailReminders(batchId) {
    setEmailReminding(batchId);
    try {
      const res = await adminApi.sendBatchReminders(batchId);
      toast.success(res.message || `Reminder sent to ${res.sent} manager(s)`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send email reminders');
    } finally { setEmailReminding(null); }
  }

  function sendWhatsAppReminder(store, inventoryDate, deadline) {
    const mgr = users.find(u => u.storeId === store.id && u.role === 'STORE_MANAGER' && u.isActive);
    if (!mgr?.phone) {
      toast.warning(`No phone number for ${store.storeName}. Add one in Users → Edit.`);
      return;
    }
    const dateStr = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const dlStr   = deadline
      ? `before ${new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'as soon as possible';
    const msg = `Hi ${mgr.name},\n\nThis is a reminder from *KinMarché L&P*.\n\nYour inventory count for *${dateStr}* is still pending. Please log in and complete your submission ${dlStr}.\n\nThank you.`;
    window.open(`https://wa.me/${mgr.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Inventory Cycles</h2>
          <p>
            {batches.length === 0
              ? 'No cycles yet — upload a master file to start the first cycle.'
              : `${batches.length} cycle${batches.length !== 1 ? 's' : ''} · manage deadlines, unlock submissions, export data`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '40px 20px' }}>
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-text" style={{ width: '60%', margin: '0 auto' }} />
        </div>
      ) : batches.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Inventory Cycles</h3>
          <p className="empty-state-description">
            Upload a master Excel file to create your first inventory cycle and assign items to plants.
          </p>
          <div className="empty-state-help">
            Go to Upload → Select Excel file → All plants will receive their assigned inventory
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="scorecard">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>File</th>
                  <th>Uploaded By</th>
                  <th style={{ textAlign: 'center' }}>Records</th>
                  <th style={{ minWidth: 160 }}>Progress</th>
                  <th>Submission Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => {
                  const stats  = b.stats || {};
                  const total  = stats.totalRecords || 0;
                  const sub    = stats.submittedCount || 0;
                  const pend   = stats.pendingCount || 0;
                  const pct    = total > 0 ? Math.round((sub / total) * 100) : 0;
                  const passed = b.submissionDeadline && new Date() > new Date(b.submissionDeadline);

                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--t3)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.originalFileName}>
                        {b.originalFileName}
                      </td>
                      <td style={{ fontSize: 12 }}>{b.uploader?.name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-pending">{total}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--sb-bg)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
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
                            <button className="btn btn-primary btn-sm" onClick={() => handleSaveDeadline(b.id)} disabled={savingDeadline}>
                              {savingDeadline ? '…' : 'Save'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingDeadline(null)}>✕</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: passed ? 'var(--red)' : b.submissionDeadline ? 'var(--t2)' : 'var(--t3)' }}>
                            {b.submissionDeadline
                              ? new Date(b.submissionDeadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                              : 'No deadline'}
                            {passed && <span className="badge badge-shortage" style={{ marginLeft: 6, fontSize: 10 }}>Past Due</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {/* Edit deadline */}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEditingDeadline(b.id);
                              setDeadlineInput(b.submissionDeadline ? new Date(b.submissionDeadline).toISOString().slice(0, 16) : '');
                            }}
                          >
                            Deadline
                          </button>

                          {/* Extend for specific store */}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExtendModal({ batchId: b.id })}
                          >
                            Extend Plant
                          </button>

                          {/* Unlock store submission */}
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setUnlockModal({ batchId: b.id, batchDate: b.inventoryDate })}
                            title="Reset a plant's submission so they can re-count"
                          >
                            Unlock Plant
                          </button>

                          {/* Export Excel */}
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleBatchExport(b.id, b.inventoryDate)}
                          >
                            Excel
                          </button>

                          {/* Export PDF */}
                          <button
                            className="btn btn-sm"
                            onClick={() => handleBatchExportPDF(b.id, b.inventoryDate)}
                            style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.25)' }}
                          >
                            PDF
                          </button>

                          {/* Email reminder */}
                          <button
                            className="btn btn-sm"
                            onClick={() => handleSendEmailReminders(b.id)}
                            disabled={emailReminding === b.id}
                            title="Send email reminder to all pending store managers"
                            style={{ background: 'rgba(59,130,246,0.09)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.22)' }}
                          >
                            {emailReminding === b.id ? '…' : 'Email'}
                          </button>

                          {/* WhatsApp reminder */}
                          <button
                            className="btn btn-sm"
                            onClick={() => setWhatsAppModal({ batchId: b.id, inventoryDate: b.inventoryDate, deadline: b.submissionDeadline })}
                            title="Send WhatsApp reminder to a store manager"
                            style={{ background: 'rgba(37,211,102,0.09)', color: '#16a34a', border: '1px solid rgba(37,211,102,0.22)' }}
                          >
                            WhatsApp
                          </button>

                          {/* Delete cycle */}
                          <button
                            className="btn btn-sm"
                            onClick={() => handleDeleteBatch(b)}
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontSize: 11 }}
                            title="Permanently delete this cycle and all its records"
                          >
                            Delete
                          </button>
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

      {/* ── Extension modal ── */}
      {extendModal && (
        <div className="modal" onClick={() => setExtendModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Extend Deadline for Plant</h3>
              <button className="close-btn" onClick={() => setExtendModal(null)}>&times;</button>
            </div>
            <div className="form-group">
              <label>Plant</label>
              <select value={extStoreId} onChange={e => setExtStoreId(e.target.value)}>
                <option value="">Select plant…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>New Deadline</label>
              <input type="datetime-local" value={extDeadline} onChange={e => setExtDeadline(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Note <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(optional)</span></label>
              <input type="text" value={extNote} onChange={e => setExtNote(e.target.value)} placeholder="Reason for extension…" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setExtendModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGrantExtension} disabled={savingExt}>
                {savingExt ? 'Saving…' : 'Grant Extension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unlock store submission modal ── */}
      {unlockModal && (
        <div className="modal" onClick={() => !unlocking && setUnlockModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unlock Plant Submission</h3>
              <button className="close-btn" onClick={() => setUnlockModal(null)} disabled={unlocking}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
              Resetting a plant's submission clears their sold quantities and remarks, putting all their records back to <strong>Pending</strong>. The plant manager can then re-count and re-submit.
            </p>
            <div className="form-group">
              <label>Plant to unlock</label>
              <select value={unlockStoreId} onChange={e => setUnlockStoreId(e.target.value)} disabled={unlocking}>
                <option value="">Select plant…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setUnlockModal(null)} disabled={unlocking}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleUnlockStore}
                disabled={unlocking || !unlockStoreId}
              >
                {unlocking ? 'Unlocking…' : 'Unlock & Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp reminder modal ── */}
      {whatsAppModal && (
        <div className="modal" onClick={() => { setWhatsAppModal(null); setWaStoreId(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>WhatsApp Reminder</h3>
              <button className="close-btn" onClick={() => { setWhatsAppModal(null); setWaStoreId(''); }}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
              Select a plant to open WhatsApp with a pre-written reminder for that plant's manager.
              The manager must have a phone number set in User Management.
            </p>
            <div className="form-group">
              <label>Plant</label>
              <select value={waStoreId} onChange={e => setWaStoreId(e.target.value)}>
                <option value="">Select plant…</option>
                {stores.map(s => {
                  const mgr = users.find(u => u.storeId === s.id && u.role === 'STORE_MANAGER' && u.isActive);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.storeCode} — {s.storeName}{mgr?.phone ? ` · ${mgr.phone}` : ' · (no phone on file)'}
                    </option>
                  );
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
        </div>
      )}
    </AdminLayout>
  );
}
