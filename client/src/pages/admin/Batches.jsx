import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminBatches() {
  const [batches, setBatches]             = useState([]);
  const [stores, setStores]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [editingDeadline, setEditingDeadline] = useState(null); // batchId
  const [deadlineInput, setDeadlineInput]     = useState('');
  const [savingDeadline, setSavingDeadline]   = useState(false);
  const [extendModal, setExtendModal]         = useState(null); // { batchId }
  const [extStoreId, setExtStoreId]           = useState('');
  const [extDeadline, setExtDeadline]         = useState('');
  const [extNote, setExtNote]                 = useState('');
  const [savingExt, setSavingExt]             = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [b, s] = await Promise.all([adminApi.getBatches(), adminApi.getStores()]);
      setBatches(b);
      setStores(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDeadline(batchId) {
    setSavingDeadline(true);
    try {
      await adminApi.updateBatch(batchId, { submissionDeadline: deadlineInput || null });
      await load();
      setEditingDeadline(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update deadline');
    } finally {
      setSavingDeadline(false);
    }
  }

  async function handleGrantExtension() {
    if (!extStoreId || !extDeadline) { alert('Store and deadline are required'); return; }
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
      alert(e.response?.data?.error || 'Failed to grant extension');
    } finally {
      setSavingExt(false);
    }
  }

  async function handleBatchExport(batchId, inventoryDate) {
    try {
      const blob = await adminApi.getBatchExport(batchId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_Cycle_${new Date(inventoryDate).toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    }
  }

  return (
    <AdminLayout title="Inventory Cycles">
      <div className="page-header">
        <div>
          <h2>Inventory Cycles</h2>
          <p>Manage submission deadlines and export cycle data</p>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading cycles…</div>
      ) : batches.length === 0 ? (
        <div className="card">
          <div className="empty"><div className="empty-icon">📦</div><p>No inventory cycles yet. Upload a master file to start your first cycle.</p></div>
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
                  <th style={{ textAlign: 'center' }}>Progress</th>
                  <th>Submission Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => {
                  const stats = b.stats || {};
                  const total = stats.storeCount || 0;
                  const submitted = stats.submittedCount || 0;
                  const pending = stats.pendingCount || 0;
                  const totalRecs = stats.totalRecords || 0;
                  const pct = totalRecs > 0 ? Math.round((submitted / totalRecs) * 100) : 0;
                  const deadlinePassed = b.submissionDeadline && new Date() > new Date(b.submissionDeadline);

                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>
                        {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--t3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.originalFileName}>
                        {b.originalFileName}
                      </td>
                      <td style={{ fontSize: 13 }}>{b.uploader?.name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-pending">{totalRecs}</span>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--sb-bg)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : 'var(--vi)', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{submitted}/{totalRecs}</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
                          {pending} pending
                        </div>
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
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleSaveDeadline(b.id)}
                              disabled={savingDeadline}
                            >
                              {savingDeadline ? '…' : 'Save'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingDeadline(null)}>✕</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: deadlinePassed ? 'var(--red)' : b.submissionDeadline ? 'var(--t2)' : 'var(--t3)' }}>
                            {b.submissionDeadline
                              ? new Date(b.submissionDeadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                              : 'No deadline set'}
                            {deadlinePassed && <span className="badge badge-shortage" style={{ marginLeft: 6, fontSize: 10 }}>Past Due</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setEditingDeadline(b.id);
                              setDeadlineInput(b.submissionDeadline
                                ? new Date(b.submissionDeadline).toISOString().slice(0, 16)
                                : '');
                            }}
                          >
                            Edit Deadline
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExtendModal({ batchId: b.id })}
                          >
                            Extend Deadline for Store
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleBatchExport(b.id, b.inventoryDate)}
                          >
                            Export
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

      {/* Per-store extension modal */}
      {extendModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 420, margin: 0 }}>
            <div className="card-header">
              <span className="card-title">Extend Deadline for Store</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setExtendModal(null)}>✕</button>
            </div>
            <div style={{ padding: '0 0 16px' }}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Store</label>
                <select
                  value={extStoreId}
                  onChange={e => setExtStoreId(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)' }}
                >
                  <option value="">Select store…</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>New Submission Deadline</label>
                <input
                  type="datetime-local"
                  value={extDeadline}
                  onChange={e => setExtDeadline(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Note (optional)</label>
                <input
                  type="text"
                  value={extNote}
                  onChange={e => setExtNote(e.target.value)}
                  placeholder="Reason for extension…"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setExtendModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleGrantExtension} disabled={savingExt}>
                  {savingExt ? 'Saving…' : 'Grant Extension'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
