import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import * as adminApi from '../../../shared/api/adminApi';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../../shared/context/ToastContext';

// ── Password strength indicator ──────────────────────────────────
function pwScore(pw) {
  let s = 0;
  if (pw.length >= 8)        s++;
  if (pw.length >= 12)       s++;
  if (/[A-Z]/.test(pw))     s++;
  if (/[0-9]/.test(pw))     s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function PasswordStrength({ pw }) {
  const score = pwScore(pw);
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong';
  const color = score <= 1 ? 'var(--red)' : score <= 3 ? 'var(--amber)' : 'var(--green)';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, score * 20)}%`, background: color, borderRadius: 99, transition: 'width 0.3s, background 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color }}>Password strength: {label}</span>
    </div>
  );
}

// ── Status badge helper ───────────────────────────────────────────
function StatusBadge({ user }) {
  if (user.pendingApproval) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, background: 'rgba(217,119,6,0.14)', color: '#d97706', fontSize: 11, fontWeight: 700, border: '1px solid rgba(217,119,6,0.25)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="10" height="10"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Pending Approval
      </span>
    );
  }
  if (!user.isActive) {
    return <span className="badge badge-inactive">Inactive</span>;
  }
  return <span className="badge badge-active">Active</span>;
}

// ── Source badge ─────────────────────────────────────────────────
function SourceBadge({ source }) {
  if (source === 'BATCH_IMPORT') return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.22)', fontWeight: 600 }}>Batch Upload</span>
  );
  if (source === 'AUTO_STORE') return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.22)', fontWeight: 600 }}>Auto (Store Upload)</span>
  );
  return null;
}

// ── Single user table row ─────────────────────────────────────────
function UserRow({ user, self, adminCount, selected, onSelect, onEdit, onDelete, onApprove, onReject, approving, rejecting, deleting }) {
  const isSelf      = user.id === self?.id;
  const isLastAdmin = user.role === 'ADMIN' && adminCount <= 1;
  const canDelete   = !isSelf && !isLastAdmin;
  const isPending   = user.pendingApproval;

  return (
    <tr style={isPending ? { background: 'rgba(217,119,6,0.04)' } : {}}>
      <td style={{ width: 36, textAlign: 'center' }}>
        {!isSelf && (
          <input type="checkbox" checked={selected} onChange={e => onSelect(user.id, e.target.checked)}
            style={{ cursor: 'pointer' }} />
        )}
      </td>
      <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--vi-light)' }}>
        {user.employeeId}
      </td>
      <td>
        <div style={{ fontWeight: 600 }}>{user.name}</div>
        {user.email && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{user.email}</div>}
        <SourceBadge source={user.source} />
      </td>
      <td>
        <span className={`badge ${user.role === 'ADMIN' ? 'badge-matched' : 'badge-excess'}`}>
          {user.role === 'ADMIN' ? 'Administrator' : 'Plant Manager'}
        </span>
      </td>
      <td style={{ color: 'var(--t3)', fontSize: 12 }}>
        {user.store ? `${user.store.storeCode} — ${user.store.storeName}` : '—'}
      </td>
      <td style={{ fontSize: 11, color: 'var(--t4)' }}>
        {new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td><StatusBadge user={user} /></td>
      <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {isPending && (
          <>
            <button onClick={() => onApprove(user)} disabled={approving || rejecting}
              className="btn btn-sm"
              style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.25)', fontWeight: 700 }}>
              {approving ? '…' : 'Approve'}
            </button>
            <button onClick={() => onReject(user)} disabled={approving || rejecting}
              className="btn btn-sm"
              style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}>
              {rejecting ? '…' : 'Reject'}
            </button>
          </>
        )}
        {!isPending && (
          <button onClick={() => onEdit(user)} className="btn btn-secondary btn-sm">Edit</button>
        )}
        {canDelete ? (
          <button
            onClick={() => onDelete(user)}
            disabled={!!deleting}
            className="btn btn-sm"
            style={{ background: deleting ? 'rgba(0,0,0,0.06)' : 'rgba(239,68,68,0.08)', color: deleting ? 'var(--t4)' : 'var(--red)', border: `1px solid ${deleting ? 'transparent' : 'rgba(239,68,68,0.22)'}` }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        ) : (
          !isPending && <span style={{ fontSize: 11, color: 'var(--t4)', alignSelf: 'center', paddingLeft: 4 }}>{isSelf ? 'You' : 'Last admin'}</span>
        )}
      </td>
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function AdminUsers() {
  const { user: self } = useAuth();
  const toast = useToast();

  const [users, setUsers]       = useState([]);
  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab]           = useState('all'); // all | pending | active | inactive

  // Single-user CRUD
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({
    employeeId: '', name: '', password: '',
    role: 'STORE_MANAGER', storeId: '', isActive: true, email: '', phone: '',
  });

  // Single approve/reject/delete
  const [approvingId, setApprovingId]   = useState(null);
  const [rejectingId, setRejectingId]   = useState(null);
  const [deletingId, setDeletingId]     = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Credentials modal after approval
  const [approvedCredentials, setApprovedCredentials] = useState(null);

  // Bulk selection — now works for ALL users (approve/reject pending, delete any)
  const [selected, setSelected]               = useState(new Set());
  const [bulkAction, setBulkAction]           = useState('');
  const [bulkWorking, setBulkWorking]         = useState(false);
  const [bulkResult, setBulkResult]           = useState(null);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [showBulkConfirm, setShowBulkConfirm]   = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Batch import Excel workflow
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile]     = useState(null);
  const [importStep, setImportStep]     = useState('upload'); // upload | preview | result
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult]   = useState(null);
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const fileInputRef = useRef(null);

  // Legacy batch-by-plant modal (kept but de-emphasized)
  const [showBatchModal, setShowBatchModal]       = useState(false);
  const [plantsWithoutUsers, setPlantsWithoutUsers] = useState([]);
  const [batchCreating, setBatchCreating]           = useState(false);
  const [batchFormData, setBatchFormData]           = useState({});
  const [batchResult, setBatchResult]               = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoadError('');
    setLoading(true);
    try {
      const [u, s] = await Promise.race([
        Promise.all([adminApi.getUsers(), adminApi.getStores()]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
        ),
      ]);
      // FORCE STATE UPDATE
      setUsers(u);
      setStores(s);
      setSelected(new Set());
      setLoading(false);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load users';
      setLoadError(errorMsg);
      setLoading(false);
    }
  }

  // ── Tab filtering ────────────────────────────────────────────────
  const pendingUsers = users.filter(u => u.pendingApproval);
  const activeUsers  = users.filter(u => u.isActive);
  const inactiveUsers= users.filter(u => !u.isActive && !u.pendingApproval);

  const visibleUsers = tab === 'pending'  ? pendingUsers
                     : tab === 'active'   ? activeUsers
                     : tab === 'inactive' ? inactiveUsers
                     : users;

  const adminCount = users.filter(u => u.role === 'ADMIN' && u.isActive).length;

  // ── Selection helpers ────────────────────────────────────────────
  function toggleSelect(id, checked) {
    setSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function selectAllVisible() {
    // Selectable = all visible except yourself (can't bulk-delete self)
    const selectable = visibleUsers.filter(u => u.id !== self?.id);
    if (selected.size === selectable.length && selectable.every(u => selected.has(u.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map(u => u.id)));
    }
  }

  // IDs currently selected that are pending (for approve/reject)
  const selectedPendingIds = Array.from(selected).filter(id => {
    const u = users.find(u => u.id === id);
    return u && u.pendingApproval;
  });
  // All selected IDs (for bulk delete — any user except self)
  const selectedAllIds = Array.from(selected);

  // ── Single approve ───────────────────────────────────────────────
  async function handleApprove(user) {
    setApprovingId(user.id);
    try {
      const result = await adminApi.approveUser(user.id);
      setApprovedCredentials({ employeeId: result.employeeId, name: result.name, tempPassword: result.tempPassword, store: result.store });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Approval failed');
    } finally {
      setApprovingId(null);
    }
  }

  // ── Single reject ────────────────────────────────────────────────
  function openReject(user) { setRejectTarget(user); setRejectReason(''); }

  async function confirmReject() {
    if (!rejectTarget) return;
    setRejectingId(rejectTarget.id);
    try {
      await adminApi.rejectUser(rejectTarget.id, rejectReason);
      toast.success(`"${rejectTarget.name}" rejected and removed`);
      setRejectTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Rejection failed');
    } finally {
      setRejectingId(null);
    }
  }

  // ── Bulk review ──────────────────────────────────────────────────
  function openBulkConfirm(action) { setBulkAction(action); setBulkRejectReason(''); setShowBulkConfirm(true); }

  async function confirmBulkAction() {
    setBulkWorking(true);
    setShowBulkConfirm(false);
    try {
      const result = await adminApi.bulkReviewUsers(bulkAction, Array.from(selected), bulkRejectReason);
      setBulkResult(result);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk action failed');
    } finally {
      setBulkWorking(false);
    }
  }

  async function confirmBulkDelete() {
    setBulkWorking(true);
    setShowBulkDeleteConfirm(false);
    const idsToDelete = [...selectedAllIds];
    // Optimistic: remove from list immediately
    setUsers(prev => prev.filter(u => !selected.has(u.id)));
    setSelected(new Set());
    try {
      const result = await adminApi.bulkDeleteUsers(idsToDelete);
      toast.success(result.message);
      load(); // sync in background
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
      load(); // restore list on failure
    } finally {
      setBulkWorking(false);
    }
  }

  // ── Single user CRUD ─────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setFormData({ employeeId: '', name: '', password: '', role: 'STORE_MANAGER', storeId: '', isActive: true, email: '', phone: '' });
    setFormError('');
    setShowModal(true);
  }

  function openEdit(user) {
    setEditingId(user.id);
    setFormData({ employeeId: user.employeeId, name: user.name, password: '', role: user.role, storeId: user.storeId || '', isActive: user.isActive, email: user.email || '', phone: user.phone || '' });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() { if (submitting) return; setShowModal(false); setEditingId(null); setFormError(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = { ...formData };
      if (payload.role === 'ADMIN') payload.storeId = null;
      if (!payload.password) delete payload.password;
      if (editingId) { await adminApi.updateUser(editingId, payload); }
      else           { await adminApi.createUser(payload); }
      setShowModal(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(user) {
    if (deletingId) return;
    setDeleteTarget(user);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const user = deleteTarget;
    setDeleteTarget(null);
    setDeletingId(user.id);
    setUsers(prev => prev.filter(u => u.id !== user.id));
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`"${user.name}" deleted`);
      load();
    } catch (err) {
      setUsers(prev => {
        if (prev.find(u => u.id === user.id)) return prev;
        return [...prev, user].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      });
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Batch import Excel workflow ──────────────────────────────────
  function openImportModal() {
    setImportFile(null);
    setImportStep('upload');
    setImportPreview(null);
    setImportResult(null);
    setShowImportModal(true);
  }

  async function handleImportPreview(e) {
    e.preventDefault();
    if (!importFile) return;
    setImportPreviewing(true);
    try {
      const preview = await adminApi.previewUserBatchImport(importFile);
      setImportPreview(preview);
      setImportStep('preview');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Preview failed');
    } finally {
      setImportPreviewing(false);
    }
  }

  async function handleImportCommit() {
    if (!importFile) return;
    setImportCommitting(true);
    try {
      const result = await adminApi.commitUserBatchImport(importFile);
      setImportResult(result);
      setImportStep('result');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImportCommitting(false);
    }
  }

  // ── Legacy batch-by-plant ────────────────────────────────────────
  async function openBatchCreateModal() {
    try {
      const plants = await adminApi.getPlantsWithoutUsers();
      if (plants.length === 0) { toast.info('All plants already have assigned users.'); return; }
      const defaultNames = {};
      plants.forEach(p => { defaultNames[p.id] = `Manager ${p.storeCode}`; });
      setPlantsWithoutUsers(plants);
      setBatchFormData(defaultNames);
      setBatchResult(null);
      setShowBatchModal(true);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load plants'); }
  }

  async function handleBatchCreate() {
    setBatchCreating(true);
    try {
      const plantsData = plantsWithoutUsers.map(p => ({ storeId: p.id, customName: batchFormData[p.id] || `Manager ${p.storeCode}` }));
      const result = await adminApi.batchCreateUsersForPlants(plantsData);
      setBatchResult(result);
      await load();
      if (result.errorCount === 0) toast.success(`Created ${result.successCount} user(s)`);
      else toast.warning(`Created ${result.successCount}, ${result.errorCount} failed`);
    } catch (err) { toast.error(err.response?.data?.error || 'Batch creation failed'); }
    finally { setBatchCreating(false); }
  }

  return (
    <AdminLayout>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h2>User Management</h2>
          <p>
            {activeUsers.length} active · {pendingUsers.length} pending approval · {inactiveUsers.length} inactive
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={openImportModal} className="btn btn-secondary">
            ↑ Batch Upload Users
          </button>
          <button onClick={openBatchCreateModal} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
            + By Plant
          </button>
          <button onClick={openCreate} className="btn btn-primary">+ Add User</button>
        </div>
      </div>

      {/* ── Pending approval banner ── */}
      {pendingUsers.length > 0 && (
        <div className="banner banner-warn" style={{ marginBottom: 16, alignItems: 'center' }}>
          <span className="banner-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M5 22h14"/><path d="M5 2h14"/>
              <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
              <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>
              {pendingUsers.length} account{pendingUsers.length !== 1 ? 's' : ''} awaiting approval
            </strong>
            <p style={{ fontSize: 12, color: 'var(--t3)', margin: '2px 0 0' }}>
              Review and approve or reject each pending user before they can log in.
            </p>
          </div>
          {tab !== 'pending' && (
            <button className="btn btn-sm" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706', border: '1px solid rgba(217,119,6,0.28)', flexShrink: 0 }} onClick={() => setTab('pending')}>
              Review Pending →
            </button>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="tab-bar">
        {[
          { key: 'all',      label: `All (${users.length})` },
          { key: 'pending',  label: `Pending (${pendingUsers.length})`, warn: pendingUsers.length > 0 },
          { key: 'active',   label: `Active (${activeUsers.length})` },
          { key: 'inactive', label: `Inactive (${inactiveUsers.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-btn${tab === t.key ? ' active' : ''}${t.warn ? ' warn' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Bulk action bar (shows whenever any users are selected) ── */}
      {selectedAllIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedAllIds.length} user{selectedAllIds.length !== 1 ? 's' : ''} selected</span>
          {/* Approve/Reject only for pending subset */}
          {selectedPendingIds.length > 0 && (
            <>
              <button className="btn btn-sm" disabled={bulkWorking}
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.25)', fontWeight: 700 }}
                onClick={() => openBulkConfirm('approve')}>
                Approve Pending ({selectedPendingIds.length})
              </button>
              <button className="btn btn-sm" disabled={bulkWorking}
                style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}
                onClick={() => openBulkConfirm('reject')}>
                Reject Pending ({selectedPendingIds.length})
              </button>
            </>
          )}
          {/* Delete all selected */}
          <button className="btn btn-sm" disabled={bulkWorking}
            style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.28)', fontWeight: 700 }}
            onClick={() => setShowBulkDeleteConfirm(true)}>
            Delete Selected ({selectedAllIds.length})
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Bulk result ── */}
      {bulkResult && (
        <div style={{ padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 13 }}>
          <strong>Bulk {bulkResult.action}:</strong> {bulkResult.summary}
          {bulkResult.approved && bulkResult.approved.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 12, color: 'var(--green)' }}>Approved — save these credentials:</strong>
              <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 4 }}>
                <table style={{ fontSize: 11 }}>
                  <thead><tr style={{ background: 'var(--surface-2)' }}><th scope="col">Username</th><th scope="col">Name</th><th scope="col">Temp Password</th><th scope="col">Plant</th></tr></thead>
                  <tbody>
                    {bulkResult.approved.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--vi)' }}>{u.employeeId}</td>
                        <td>{u.name}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 700 }}>{u.tempPassword}</td>
                        <td>{u.store?.storeCode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>⚠ Save these now — passwords cannot be retrieved later.</p>
            </div>
          )}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setBulkResult(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Main table ── */}
      {loading ? (
        <div className="card" style={{ padding: '40px 20px' }}>
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-text" style={{ width: '50%', margin: '0 auto' }} />
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <div className="empty-state-illustration error">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 className="empty-state-title">Failed to Load Users</h3>
          <p className="empty-state-description">{loadError}</p>
          <button onClick={() => { setLoadError(''); load(); }} className="btn btn-primary empty-state-cta">Retry</button>
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Users in This View</h3>
          <p className="empty-state-description">
            {tab === 'pending' ? 'No users are pending approval.' : tab === 'active' ? 'No active users.' : 'No users found.'}
          </p>
          {tab === 'all' && <button onClick={openCreate} className="btn btn-primary empty-state-cta">+ Add First User</button>}
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 36 }}>
                    {visibleUsers.length > 0 && (
                      <input type="checkbox"
                        checked={(() => {
                          const selectable = visibleUsers.filter(u => u.id !== self?.id);
                          return selectable.length > 0 && selectable.every(u => selected.has(u.id));
                        })()}
                        ref={el => {
                          if (el) {
                            const selectable = visibleUsers.filter(u => u.id !== self?.id);
                            el.indeterminate = selectedAllIds.length > 0 && !selectable.every(u => selected.has(u.id));
                          }
                        }}
                        onChange={selectAllVisible}
                        style={{ cursor: 'pointer' }} />
                    )}
                  </th>
                  <th scope="col">ID</th>
                  <th scope="col">Name / Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Plant</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(u => (
                  <UserRow
                    key={u.id} user={u} self={self} adminCount={adminCount}
                    selected={selected.has(u.id)}
                    onSelect={toggleSelect}
                    onEdit={openEdit} onDelete={handleDelete}
                    onApprove={handleApprove} onReject={openReject}
                    approving={approvingId === u.id}
                    rejecting={rejectingId === u.id}
                    deleting={deletingId === u.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           APPROVED CREDENTIALS MODAL
          ══════════════════════════════════════════════════════════════ */}
      {approvedCredentials && (
        <Modal onClose={() => setApprovedCredentials(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Account Approved</h3>
              <button className="close-btn" onClick={() => setApprovedCredentials(null)}>&times;</button>
            </div>
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              <strong>{approvedCredentials.name}</strong> can now log in.
              {approvedCredentials.store && <span> ({approvedCredentials.store.storeCode})</span>}
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Share these credentials with the user. The password is shown only once.</p>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--t3)', marginBottom: 4 }}>Username</div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--vi)' }}>{approvedCredentials.employeeId}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--t3)', marginBottom: 4 }}>Temporary Password</div>
                <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--green)', wordBreak: 'break-all' }}>{approvedCredentials.tempPassword}</div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 16 }}>⚠ Save these now. This dialog cannot be reopened. Ask the user to change their password after first login.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setApprovedCredentials(null)}>Done &mdash; I&apos;ve saved the credentials</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           DELETE CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Delete User</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Permanently delete <strong>{deleteTarget.name}</strong> ({deleteTarget.employeeId})? This cannot be undone.
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
              Inventory submissions and audit entries are preserved — only the login account is removed.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           REJECT CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════════ */}
      {rejectTarget && (
        <Modal onClose={() => !rejectingId && setRejectTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Reject User</h3>
              <button className="close-btn" onClick={() => setRejectTarget(null)} disabled={!!rejectingId}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
              Reject and permanently remove <strong>{rejectTarget.name}</strong> ({rejectTarget.employeeId})?
              The associated plant will NOT be deleted.
            </p>
            <div className="form-group">
              <label htmlFor="reject-reason" style={{ fontSize: 12 }}>Reason (optional)</label>
              <input id="reject-reason" type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. duplicate entry, wrong role…" disabled={!!rejectingId} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setRejectTarget(null)} disabled={!!rejectingId}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmReject} disabled={!!rejectingId}>
                {rejectingId ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           BULK CONFIRM MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showBulkConfirm && (
        <Modal onClose={() => !bulkWorking && setShowBulkConfirm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Bulk {bulkAction === 'approve' ? 'Approve' : 'Reject'}</h3>
              <button className="close-btn" onClick={() => setShowBulkConfirm(false)}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
              {bulkAction === 'approve'
                ? `Approve ${selectedPendingIds.length} pending user(s)? Each will receive a unique temporary password.`
                : `Reject and remove ${selectedPendingIds.length} pending user(s)? This cannot be undone.`}
            </p>
            {bulkAction === 'reject' && (
              <div className="form-group">
                <label htmlFor="bulk-reject-reason" style={{ fontSize: 12 }}>Reason (optional)</label>
                <input id="bulk-reject-reason" type="text" value={bulkRejectReason} onChange={e => setBulkRejectReason(e.target.value)}
                  placeholder="Reason for rejection…" />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)}>Cancel</button>
              <button
                className={bulkAction === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={confirmBulkAction}>
                Confirm {bulkAction === 'approve' ? 'Approve' : 'Reject'} ({selectedPendingIds.length})
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           BULK DELETE CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showBulkDeleteConfirm && (
        <Modal onClose={() => !bulkWorking && setShowBulkDeleteConfirm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Delete {selectedAllIds.length} User{selectedAllIds.length !== 1 ? 's' : ''}?</h3>
              <button className="close-btn" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkWorking}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              This permanently deletes {selectedAllIds.length} account{selectedAllIds.length !== 1 ? 's' : ''}. This cannot be undone.
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
              All inventory submissions, audit entries, and assignments for these users will be preserved — only the login accounts are removed.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkWorking}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmBulkDelete} disabled={bulkWorking}>
                {bulkWorking ? 'Deleting…' : `Delete ${selectedAllIds.length} User${selectedAllIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           BATCH IMPORT MODAL  (Excel → preview → commit → pending)
          ══════════════════════════════════════════════════════════════ */}
      {showImportModal && (
        <Modal onClose={() => !importPreviewing && !importCommitting && setShowImportModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
            <div className="modal-header">
              <h3>Batch Upload Users</h3>
              <button className="close-btn" onClick={() => setShowImportModal(false)}
                disabled={importPreviewing || importCommitting}>&times;</button>
            </div>

            {/* Step 1 — Upload */}
            {importStep === 'upload' && (
              <>
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--t3)' }}>
                  <strong style={{ color: 'var(--t1)' }}>Required Excel columns:</strong>
                  <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div><code>Name</code> — full name <span style={{ color: 'var(--red)' }}>*</span></div>
                    <div><code>Plant Code</code> — plant/store code <span style={{ color: 'var(--red)' }}>*</span> (for managers)</div>
                    <div><code>Employee ID</code> — login ID (auto-generated if blank)</div>
                    <div><code>Email</code> — for notifications (optional)</div>
                    <div><code>Role</code> — STORE_MANAGER (default) or ADMIN</div>
                    <div><code>Plant Name</code> — used if plant is new (optional)</div>
                  </div>
                  <div style={{ marginTop: 8, color: 'var(--t4)' }}>
                    Uploaded users will be created as <strong>Pending Approval</strong> — they cannot log in until approved.
                    New plants found in the file will be created automatically.
                  </div>
                </div>
                <form onSubmit={handleImportPreview}>
                  <div className="form-group">
                    <label htmlFor="import-file">Excel or CSV File</label>
                    <input id="import-file" ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                      onChange={e => { setImportFile(e.target.files[0]); }} required />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={!importFile || importPreviewing}>
                      {importPreviewing ? 'Validating…' : 'Validate File →'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Step 2 — Preview */}
            {importStep === 'preview' && importPreview && (
              <>
                <div style={{ display: 'flex', gap: 20, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r)', marginBottom: 14, fontSize: 13 }}>
                  <span><strong style={{ color: 'var(--green)' }}>{importPreview.validRows}</strong> valid</span>
                  <span><strong style={{ color: 'var(--red)' }}>{importPreview.invalidRows}</strong> invalid</span>
                  <span><strong>{importPreview.totalRows}</strong> total rows</span>
                  {importPreview.newStores.length > 0 && (
                    <span style={{ color: 'var(--violet)' }}><strong>{importPreview.newStores.length}</strong> new plant(s) will be created</span>
                  )}
                </div>

                {importPreview.newStores.length > 0 && (
                  <div style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 12 }}>
                    New plants to create: {importPreview.newStores.join(', ')}
                  </div>
                )}

                {!importPreview.canCommit && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>All rows have errors — fix the file and re-upload.</div>
                )}

                <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 14 }}>
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th scope="col">#</th><th scope="col">Employee ID</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th>
                        <th scope="col">Plant Code</th><th scope="col">Plant Status</th><th scope="col">Status</th><th scope="col">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.preview.map(row => (
                        <tr key={row.row} style={row.status === 'invalid' ? { background: 'rgba(220,38,38,0.04)' } : {}}>
                          <td style={{ color: 'var(--t4)' }}>{row.row}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{row.employeeId || '—'}</td>
                          <td>{row.name || '—'}</td>
                          <td style={{ fontSize: 10, color: 'var(--t3)' }}>{row.email || '—'}</td>
                          <td>{row.role}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{row.storeCode || '—'}</td>
                          <td>
                            {row.storeStatus === 'new' && <span style={{ color: 'var(--violet)', fontWeight: 600, fontSize: 10 }}>NEW</span>}
                            {row.storeStatus === 'existing' && <span style={{ color: 'var(--green)', fontSize: 10 }}>Exists</span>}
                          </td>
                          <td>
                            {row.status === 'valid'
                              ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Valid</span>
                              : <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ Error</span>}
                          </td>
                          <td style={{ color: 'var(--red)', fontSize: 10 }}>{row.errors?.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { setImportStep('upload'); setImportPreview(null); }}>← Back</button>
                  <button className="btn btn-primary" onClick={handleImportCommit}
                    disabled={!importPreview.canCommit || importCommitting}>
                    {importCommitting ? 'Creating pending users…' : `Confirm — Create ${importPreview.validRows} Pending User(s)`}
                  </button>
                </div>
              </>
            )}

            {/* Step 3 — Result */}
            {importStep === 'result' && importResult && (
              <>
                <div className="alert alert-success" style={{ marginBottom: 16 }}>
                  <strong>{importResult.createdCount} pending user(s)</strong> created and awaiting approval.
                  {importResult.newStoreCount > 0 && ` ${importResult.newStoreCount} new plant(s) were created.`}
                </div>

                {importResult.newStores?.length > 0 && (
                  <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--t3)' }}>
                    New plants created: {importResult.newStores.map(s => s.storeCode).join(', ')}
                  </div>
                )}

                {importResult.skipped?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 12, color: 'var(--red)' }}>{importResult.skippedCount} row(s) skipped:</strong>
                    <ul style={{ fontSize: 11, color: 'var(--t3)', paddingLeft: 20, marginTop: 4 }}>
                      {importResult.skipped.slice(0, 10).map((s, i) => (
                        <li key={i}>Row {s.row}: {s.errors?.join('; ')}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
                  Go to the <strong>Pending</strong> tab to review and approve users.
                </p>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { setShowImportModal(false); setTab('pending'); }}>
                    View Pending Users →
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setImportStep('upload'); setImportFile(null); setImportPreview(null); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    Import Another File
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           SINGLE USER CREATE/EDIT MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showModal && (
        <Modal onClose={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit User' : 'Add User'}</h3>
              <button className="close-btn" onClick={closeModal} disabled={submitting}>&times;</button>
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="user-empid">Employee ID</label>
                <input id="user-empid" type="text" value={formData.employeeId} onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                  required disabled={!!editingId || submitting} placeholder="e.g. MGR001" autoFocus />
                {!editingId && <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>Cannot be changed after creation.</small>}
              </div>
              <div className="form-group">
                <label htmlFor="user-name">Full Name</label>
                <input id="user-name" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required disabled={submitting} placeholder="Employee full name" />
              </div>
              <div className="form-group">
                <label htmlFor="user-pw">Password {editingId && <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(leave blank to keep current)</span>}</label>
                <input id="user-pw" type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required={!editingId} disabled={submitting} placeholder="••••••••" />
                {formData.password && <PasswordStrength pw={formData.password} />}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="user-email">Email <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(for notifications)</span></label>
                  <input id="user-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    disabled={submitting} placeholder="manager@company.com" />
                </div>
                <div className="form-group">
                  <label htmlFor="user-phone">Phone <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(with country code)</span></label>
                  <input id="user-phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    disabled={submitting} placeholder="+243 812 345 678" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="user-role">Role</label>
                <select id="user-role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value, storeId: '' })}
                  required disabled={!!editingId || submitting}>
                  <option value="STORE_MANAGER">Plant Manager</option>
                  <option value="ADMIN">Administrator</option>
                </select>
                {editingId && (
                  <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Role cannot be changed after creation. Create a new account if a different role is needed.
                  </small>
                )}
              </div>
              {formData.role === 'STORE_MANAGER' && (
                <div className="form-group">
                  <label htmlFor="user-store">Assigned Plant {!editingId && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                  <select id="user-store" value={formData.storeId} onChange={e => setFormData({ ...formData, storeId: e.target.value })}
                    required={!editingId} disabled={submitting}>
                    <option value="">Select a plant…</option>
                    {stores.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>
                    ))}
                  </select>
                  {editingId && !formData.storeId && (
                    <small style={{ color: 'var(--amber)', fontSize: 11, marginTop: 4, display: 'block' }}>
                      No plant assigned — upload inventory first to create plants, then reassign.
                    </small>
                  )}
                </div>
              )}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }} disabled={submitting} />
                  Active account
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
           LEGACY BATCH-BY-PLANT MODAL
          ══════════════════════════════════════════════════════════════ */}
      {showBatchModal && (
        <Modal onClose={() => !batchCreating && setShowBatchModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>Create Managers for Unassigned Plants</h3>
              <button className="close-btn" onClick={() => setShowBatchModal(false)} disabled={batchCreating}>&times;</button>
            </div>
            {!batchResult ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
                  Plants below have no assigned users. Create plant managers (username: <strong>MGR&#123;plantCode&#125;</strong>) with unique temp passwords.
                </p>
                <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                  <table style={{ fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--surface-2)' }}>
                      <th scope="col">Plant Code</th><th scope="col">Plant Name</th><th scope="col">Username</th><th scope="col">User Name</th>
                    </tr></thead>
                    <tbody>
                      {plantsWithoutUsers.map(plant => (
                        <tr key={plant.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--vi-light)' }}>{plant.storeCode}</td>
                          <td style={{ fontSize: 12 }}>{plant.storeName}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--t3)' }}>MGR{plant.storeCode}</td>
                          <td>
                            <input type="text" value={batchFormData[plant.id] || ''} disabled={batchCreating}
                              onChange={e => setBatchFormData({ ...batchFormData, [plant.id]: e.target.value })}
                              placeholder={`Manager ${plant.storeCode}`} style={{ fontSize: 12, padding: '4px 8px', width: '100%' }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowBatchModal(false)} disabled={batchCreating}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleBatchCreate} disabled={batchCreating}>
                    {batchCreating ? 'Creating…' : `Create ${plantsWithoutUsers.length} User(s)`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="alert alert-success" style={{ marginBottom: 16 }}>
                  <strong>{batchResult.successCount} user(s) created.</strong>
                  {batchResult.errorCount > 0 && ` ${batchResult.errorCount} failed.`}
                </div>
                {batchResult.created?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Save these credentials:</h4>
                    <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                      <table style={{ fontSize: 12 }}>
                        <thead><tr style={{ background: 'var(--surface-2)' }}>
                          <th scope="col">Plant</th><th scope="col">Username</th><th scope="col">Name</th><th scope="col">Password</th>
                        </tr></thead>
                        <tbody>
                          {batchResult.created.map(u => (
                            <tr key={u.id}>
                              <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--vi-light)' }}>{u.storeCode}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{u.employeeId}</td>
                              <td>{u.name}</td>
                              <td style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 600 }}>{u.password}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 8 }}>⚠ Save now — passwords cannot be retrieved later.</p>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={() => setShowBatchModal(false)}>Close</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
