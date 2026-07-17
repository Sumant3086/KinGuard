import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
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
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(29,78,216,0.10)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.24)', fontWeight: 600 }}>Batch Upload</span>
  );
  if (source === 'AUTO_STORE') return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(109,40,217,0.10)', color: '#6d28d9', border: '1px solid rgba(109,40,217,0.24)', fontWeight: 600 }}>Auto (Store Upload)</span>
  );
  return null;
}

// ── Single user mobile card ───────────────────────────────────────
const UserCard = memo(function UserCard({ user, self, adminCount, selected, onSelect, onEdit, onDelete, onApprove, onReject, approving, rejecting, deleting }) {
  const isSelf      = user.id === self?.id;
  const isLastAdmin = user.role === 'ADMIN' && adminCount <= 1;
  const canDelete   = !isSelf && !isLastAdmin;
  const isPending   = user.pendingApproval;

  return (
    <div className={`user-card${selected ? ' user-card-selected' : ''}`}>
      {/* Row 1: checkbox + name + status */}
      <div className="user-card-top">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
          {!isSelf ? (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={e => onSelect(user.id, e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--vi)', flexShrink: 0, marginTop: 2 }}
            />
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="user-card-name">
              {user.name}
              {' '}
              <SourceBadge source={user.source} />
            </div>
            <div className="user-card-id">{user.employeeId}</div>
          </div>
        </div>
        <StatusBadge user={user} />
      </div>
      {/* Row 2: meta */}
      <div className="user-card-meta">
        <span>
          <span className={`badge ${user.role === 'ADMIN' ? 'badge-matched' : user.role === 'AREA_MANAGER' ? 'badge-excess' : ''}`} style={{ fontSize: 10 }}>
            {user.role === 'ADMIN' ? 'Administrator' : user.role === 'AREA_MANAGER' ? 'Area Manager' : 'Store Manager'}
          </span>
          {user.store && <span style={{ marginLeft: 6 }}>· {user.store.storeCode} — {user.store.storeName}</span>}
        </span>
        {user.email && <span style={{ color: 'var(--t3)' }}>{user.email}</span>}
        <span>Created: {new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
      {/* Row 3: actions */}
      <div className="user-card-actions">
        {isPending && (
          <>
            <button onClick={() => onApprove(user)} disabled={approving || rejecting}
              className="btn btn-sm"
              style={{ flex: 1, background: 'rgba(22,163,74,0.12)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.25)', fontWeight: 700 }}>
              {approving ? '…' : 'Approve'}
            </button>
            <button onClick={() => onReject(user)} disabled={approving || rejecting}
              className="btn btn-sm"
              style={{ flex: 1, background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}>
              {rejecting ? '…' : 'Reject'}
            </button>
          </>
        )}
        {!isPending && (
          <button onClick={() => onEdit(user)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Edit</button>
        )}
        {canDelete ? (
          <button
            onClick={() => onDelete(user)}
            disabled={!!deleting}
            className="btn btn-sm"
            style={{ flex: 1, background: deleting ? 'rgba(0,0,0,0.06)' : 'rgba(239,68,68,0.10)', color: deleting ? 'var(--t4)' : 'var(--red)', border: `1px solid ${deleting ? 'transparent' : 'rgba(239,68,68,0.26)'}`, fontWeight: 700 }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        ) : (
          !isPending && <span style={{ fontSize: 11, color: 'var(--t4)', alignSelf: 'center' }}>{isSelf ? 'You' : 'Last admin'}</span>
        )}
      </div>
    </div>
  );
});

// ── Single user table row ─────────────────────────────────────────
const UserRow = memo(function UserRow({ user, self, adminCount, selected, onSelect, onEdit, onDelete, onApprove, onReject, approving, rejecting, deleting }) {
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
        <span className={`badge ${user.role === 'ADMIN' ? 'badge-matched' : user.role === 'AREA_MANAGER' ? 'badge-excess' : ''}`}>
          {user.role === 'ADMIN' ? 'Administrator' : user.role === 'AREA_MANAGER' ? 'Area Manager' : 'Store Manager'}
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
});

// ── Main component ───────────────────────────────────────────────
export default function AdminUsers() {
  const { user: self } = useAuth();
  const toast = useToast();

  const [users, setUsers]       = useState([]);
  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab]           = useState('all'); // all | pending | active | inactive
  const [userSearch, setUserSearch] = useState('');

  // Single-user CRUD
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData]     = useState({
    employeeId: '', name: '', password: '',
    role: 'STORE_MANAGER', storeId: '', isActive: true, email: '', phone: '',
  });
  // Stores to assign when creating an Area Manager (up to 10)
  const [amStoreIds, setAmStoreIds] = useState([]);

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
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { load(); }, []);

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
      if (!mountedRef.current) return;
      setUsers(u);
      setStores(s);
      setSelected(new Set());
      setLoading(false);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Load users:', err);
      setLoadError('Could not load users. Please refresh.');
      setLoading(false);
    }
  }

  // ── Tab + search filtering — memoised so re-renders from modal/checkbox don't recompute ──
  const { pendingUsers, activeUsers, inactiveUsers, visibleUsers, adminCount } = useMemo(() => {
    const pending  = users.filter(u => u.pendingApproval);
    const active   = users.filter(u => u.isActive);
    const inactive = users.filter(u => !u.isActive && !u.pendingApproval);
    const tabList  = tab === 'pending' ? pending : tab === 'active' ? active : tab === 'inactive' ? inactive : users;
    const q = userSearch.trim().toLowerCase();
    const visible  = q
      ? tabList.filter(u =>
          u.name.toLowerCase().includes(q) ||
          u.employeeId.toLowerCase().includes(q) ||
          (u.store?.storeCode?.toLowerCase().includes(q)) ||
          (u.store?.storeName?.toLowerCase().includes(q)) ||
          (u.email?.toLowerCase().includes(q))
        )
      : tabList;
    const admins   = users.filter(u => u.role === 'ADMIN' && u.isActive).length;
    return { pendingUsers: pending, activeUsers: active, inactiveUsers: inactive, visibleUsers: visible, adminCount: admins };
  }, [users, tab, userSearch]);

  // ── Selection helpers ────────────────────────────────────────────
  const toggleSelect = useCallback((id, checked) => {
    setSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

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
  const handleApprove = useCallback(async (user) => {
    setApprovingId(user.id);
    try {
      const result = await adminApi.approveUser(user.id);
      setApprovedCredentials({ employeeId: result.employeeId, name: result.name, tempPassword: result.tempPassword, store: result.store });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: true, pendingApproval: false } : u));
      load();
    } catch (err) {
      console.error('Approve user:', err);
      toast.error('Could not approve user. Try again.');
    } finally {
      setApprovingId(null);
    }
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single reject ────────────────────────────────────────────────
  const openReject = useCallback((user) => { setRejectTarget(user); setRejectReason(''); }, []);

  async function confirmReject() {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    setRejectingId(target.id);
    // Optimistic remove
    setUsers(prev => prev.filter(u => u.id !== target.id));
    try {
      await adminApi.rejectUser(target.id, rejectReason);
      toast.success(`${target.name} rejected`);
      load();
    } catch (err) {
      console.error('Reject user:', err);
      toast.error('Could not reject user. Try again.');
      load();
    } finally {
      setRejectingId(null);
    }
  }

  // ── Bulk review ──────────────────────────────────────────────────
  function openBulkConfirm(action) { setBulkAction(action); setBulkRejectReason(''); setShowBulkConfirm(true); }

  async function confirmBulkAction() {
    // Approve/reject only operates on the pending subset of the selection,
    // even if active users are also checked. Send only pendingIds to avoid
    // the server trying to re-approve already-active accounts.
    const actionIds = selectedPendingIds;
    setBulkWorking(true);
    setShowBulkConfirm(false);
    try {
      const result = await adminApi.bulkReviewUsers(bulkAction, actionIds, bulkRejectReason);
      setBulkResult(result);
      setSelected(new Set());

      // Optimistic update — apply changes immediately so the list reflects the
      // result without waiting for a full reload from the server.
      const processedIds = new Set([
        ...(result.approved || []).map(u => u.id),
        ...(result.rejected || []).map(u => u.id),
      ]);
      if (bulkAction === 'approve') {
        setUsers(prev => prev.map(u =>
          processedIds.has(u.id)
            ? { ...u, isActive: true, pendingApproval: false }
            : u
        ));
      } else {
        setUsers(prev => prev.filter(u => !processedIds.has(u.id)));
      }

      // Sync in background to catch any server-side partial failures
      load();
    } catch (err) {
      console.error('Bulk action:', err);
      toast.error('Action failed. Please refresh and try again.');
      load();
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
      console.error('Bulk delete users:', err);
      toast.error('Could not delete users. Try again.');
      load();
    } finally {
      setBulkWorking(false);
    }
  }

  // ── Single user CRUD ─────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setFormData({ employeeId: '', name: '', password: '', role: 'STORE_MANAGER', storeId: '', isActive: true, email: '', phone: '' });
    setAmStoreIds([]);
    setFormError('');
    setShowModal(true);
  }

  const openEdit = useCallback((user) => {
    setEditingId(user.id);
    setFormData({ employeeId: user.employeeId, name: user.name, password: '', role: user.role, storeId: user.storeId || '', isActive: user.isActive, email: user.email || '', phone: user.phone || '' });
    setAmStoreIds([]);
    setFormError('');
    setShowModal(true);
  }, []);

  function closeModal() { if (submitting) return; setShowModal(false); setEditingId(null); setFormError(''); setAmStoreIds([]); }

  function toggleAmStore(storeId) {
    setAmStoreIds(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : prev.length >= 10 ? prev : [...prev, storeId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = { ...formData };
      if (payload.role === 'ADMIN' || payload.role === 'AREA_MANAGER') payload.storeId = null;
      if (!payload.password) delete payload.password;
      if (editingId) {
        const updated = await adminApi.updateUser(editingId, payload);
        setUsers(prev => prev.map(u => u.id === editingId ? { ...u, ...updated } : u));
        // Re-assign stores if any selected (edit mode)
        if (payload.role === 'AREA_MANAGER' && amStoreIds.length > 0) {
          await adminApi.batchAssignAMStores(editingId, amStoreIds);
        }
      } else {
        const created = await adminApi.createUser(payload);
        setUsers(prev => [...prev, created]);
        // Assign selected stores to the new AM
        if (payload.role === 'AREA_MANAGER' && amStoreIds.length > 0) {
          await adminApi.batchAssignAMStores(created.id, amStoreIds);
        }
      }
      setShowModal(false);
      setEditingId(null);
      setAmStoreIds([]);
      load();
    } catch (err) {
      console.error('Save user:', err);
      setFormError('Could not save. Please check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const handleDelete = useCallback((user) => {
    if (deletingId) return;
    setDeleteTarget(user);
  }, [deletingId]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const user = deleteTarget;
    setDeleteTarget(null);
    setDeletingId(user.id);
    setUsers(prev => prev.filter(u => u.id !== user.id));
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`${user.name} deleted`);
      load();
    } catch (err) {
      setUsers(prev => {
        if (prev.find(u => u.id === user.id)) return prev;
        return [...prev, user].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      });
      console.error('Delete user:', err);
      toast.error('Could not delete user. Try again.');
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
      console.error('Import preview:', err);
      toast.error('Could not load preview. Check the file and try again.');
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
      console.error('Import commit:', err);
      toast.error('Import failed. Try again.');
    } finally {
      setImportCommitting(false);
    }
  }

  // ── Legacy batch-by-plant ────────────────────────────────────────
  async function openBatchCreateModal() {
    try {
      const plants = await adminApi.getPlantsWithoutUsers();
      if (plants.length === 0) { toast.info('All stores already have a manager assigned.'); return; }
      const defaultNames = {};
      plants.forEach(p => { defaultNames[p.id] = `Manager ${p.storeCode}`; });
      setPlantsWithoutUsers(plants);
      setBatchFormData(defaultNames);
      setBatchResult(null);
      setShowBatchModal(true);
    } catch (err) { console.error('Load stores:', err); toast.error('Could not load stores. Try again.'); }
  }

  async function handleBatchCreate() {
    setBatchCreating(true);
    try {
      const plantsData = plantsWithoutUsers.map(p => ({ storeId: p.id, customName: batchFormData[p.id] || `Manager ${p.storeCode}` }));
      const result = await adminApi.batchCreateUsersForPlants(plantsData);
      setBatchResult(result);
      await load();
      if (result.errorCount === 0) toast.success(`${result.successCount} user(s) created`);
      else toast.warning(`${result.successCount} created, ${result.errorCount} failed`);
    } catch (err) { console.error('Batch create users:', err); toast.error('Could not create users. Try again.'); }
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
            + By Store
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
            <strong style={{ fontSize: 13, color: '#92400e', fontWeight: 800 }}>
              {pendingUsers.length} account{pendingUsers.length !== 1 ? 's' : ''} awaiting approval
            </strong>
            <p style={{ fontSize: 12, color: '#92400e', margin: '2px 0 0', fontWeight: 600 }}>
              Review and approve or reject each pending user before they can log in.
            </p>
          </div>
          {tab !== 'pending' && (
            <button className="btn btn-sm" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706', border: '1px solid rgba(217,119,6,0.28)', flexShrink: 0, fontWeight: 700 }} onClick={() => setTab('pending')}>
              Review Pending →
            </button>
          )}
        </div>
      )}

      {/* ── Tabs + Search ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="tab-bar" style={{ margin: 0, flex: '0 0 auto' }}>
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
        <div className="search-wrap" style={{ flex: '1 1 200px', maxWidth: 280 }}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, ID, store…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
        </div>
        {userSearch && (
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
            {visibleUsers.length} result{visibleUsers.length !== 1 ? 's' : ''}
          </span>
        )}
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
              <div style={{ maxHeight: 200, overflowY: 'auto', overflowX: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 4 }}>
                <table style={{ fontSize: 11 }}>
                  <thead><tr style={{ background: 'var(--surface-2)' }}><th scope="col">Username</th><th scope="col">Name</th><th scope="col">Temp Password</th><th scope="col">Store</th></tr></thead>
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
        <SkeletonTable rows={7} cols={7} />
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
          {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
          <div className="users-cards" style={{ padding: 12 }}>
            {/* Select All row */}
            <div className="mobile-select-bar">
              <label className="mobile-select-all-label">
                <input
                  type="checkbox"
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
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--vi)', flexShrink: 0 }}
                />
                <span className="mobile-select-all-text">
                  {selectedAllIds.length > 0
                    ? `${selectedAllIds.length} of ${visibleUsers.length} selected`
                    : `Select all ${visibleUsers.length} users`}
                </span>
              </label>
              {selectedAllIds.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ flexShrink: 0 }}>
                  Clear
                </button>
              )}
            </div>

            {visibleUsers.map(u => (
              <UserCard
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
          </div>

          {/* ── Desktop table (>768px) ────────────────────────────── */}
          <div className="table-container users-table-desktop">
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
                  <th scope="col">Store</th>
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
              The associated store will NOT be deleted.
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
                {/* ── Step progress ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 22 }}>
                  {[{ n: 1, label: 'Prepare File', active: true }, { n: 2, label: 'Review', active: false }, { n: 3, label: 'Done', active: false }].map((step, i) => (
                    <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', flex: i < 2 ? 1 : 'none' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.active ? '#dc2626' : 'rgba(185,28,28,0.12)', color: step.active ? '#fff' : 'var(--t4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{step.n}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: step.active ? '#dc2626' : 'var(--t4)', whiteSpace: 'nowrap' }}>{step.label}</span>
                      </div>
                      {i < 2 && <div style={{ flex: 1, height: 2, background: 'rgba(185,28,28,0.15)', marginTop: 13, marginLeft: 4, marginRight: 4 }} />}
                    </div>
                  ))}
                </div>

                {/* ── Column guide — visual cards ── */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="14" height="14" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    What to include in your Excel or CSV file:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8 }}>
                    {[
                      { col: 'Name', desc: 'Full name of the person', tag: 'Required', tagColor: '#dc2626', tagBg: 'rgba(220,38,38,0.10)', tagBorder: 'rgba(220,38,38,0.22)', color: '#dc2626', bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.18)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                      { col: 'Store Code', desc: 'The store/plant they manage (e.g. CP01)', tag: 'Required for Managers', tagColor: '#d97706', tagBg: 'rgba(217,119,6,0.10)', tagBorder: 'rgba(217,119,6,0.22)', color: '#d97706', bg: 'rgba(217,119,6,0.06)', border: 'rgba(217,119,6,0.18)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
                      { col: 'Email', desc: 'Gets inventory cycle notifications', tag: 'Recommended', tagColor: '#2563eb', tagBg: 'rgba(37,99,235,0.09)', tagBorder: 'rgba(37,99,235,0.22)', color: '#2563eb', bg: 'rgba(37,99,235,0.05)', border: 'rgba(37,99,235,0.16)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                      { col: 'Employee ID', desc: 'Their login username — auto-generated if blank', tag: 'Optional', tagColor: '#64748b', tagBg: 'rgba(100,116,139,0.09)', tagBorder: 'rgba(100,116,139,0.20)', color: '#7c3aed', bg: 'rgba(124,58,237,0.05)', border: 'rgba(124,58,237,0.16)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" width="16" height="16"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
                      { col: 'Role', desc: 'STORE_MANAGER (default) or ADMIN', tag: 'Optional', tagColor: '#64748b', tagBg: 'rgba(100,116,139,0.09)', tagBorder: 'rgba(100,116,139,0.20)', color: '#059669', bg: 'rgba(5,150,105,0.05)', border: 'rgba(5,150,105,0.16)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
                      { col: 'Store Name', desc: 'Only needed if the store code is brand new', tag: 'Optional', tagColor: '#64748b', tagBg: 'rgba(100,116,139,0.09)', tagBorder: 'rgba(100,116,139,0.20)', color: '#64748b', bg: 'rgba(100,116,139,0.05)', border: 'rgba(100,116,139,0.16)', icon: <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
                    ].map(({ col, desc, tag, tagColor, tagBg, tagBorder, color, bg, border, icon }) => (
                      <div key={col} style={{ padding: '10px 12px', borderRadius: 'var(--r)', border: `1px solid ${border}`, background: bg, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 7, background: `${bg}`, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexWrap: 'wrap' }}>
                            <code style={{ fontSize: 11, fontWeight: 800, color: 'var(--t1)', background: 'rgba(0,0,0,0.07)', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.2px' }}>{col}</code>
                            <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.4px', background: tagBg, color: tagColor, border: `1px solid ${tagBorder}` }}>{tag}</span>
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.4 }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Pending approval notice ── */}
                <div style={{ display: 'flex', gap: 10, padding: '10px 13px', background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.22)', borderLeft: '3px solid #d97706', borderRadius: 'var(--r)', marginBottom: 18, fontSize: 12 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" width="16" height="16" style={{ flexShrink: 0, marginTop: 1 }} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span style={{ color: 'var(--t2)', lineHeight: 1.5 }}>
                    Uploaded users are created as <strong style={{ color: '#b45309' }}>Pending Approval</strong> — they cannot log in until you review and approve them. New stores in the file are created automatically.
                  </span>
                </div>

                {/* ── File upload zone ── */}
                <form onSubmit={handleImportPreview}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--t2)', marginBottom: 8 }}>
                      Choose your Excel or CSV file
                    </label>
                    <div
                      style={{ border: `2px dashed ${importFile ? 'rgba(22,163,74,0.40)' : 'rgba(185,28,28,0.28)'}`, borderRadius: 'var(--r-md)', padding: '22px 16px', textAlign: 'center', background: importFile ? 'rgba(22,163,74,0.04)' : 'rgba(255,252,250,0.85)', transition: 'all 0.2s', cursor: 'pointer' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {importFile ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(22,163,74,0.12)', border: '1.5px solid rgba(22,163,74,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" width="20" height="20" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{importFile.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{(importFile.size / 1024).toFixed(1)} KB · <span style={{ color: '#dc2626', cursor: 'pointer' }}>Click to change</span></div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#dc2626' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 3 }}>Click to choose a file</div>
                          <div style={{ fontSize: 11, color: 'var(--t4)' }}>.xlsx, .xls, or .csv · Max 10 MB</div>
                        </div>
                      )}
                    </div>
                    <input id="import-file" ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => setImportFile(e.target.files[0])} required style={{ display: 'none' }} />
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
                    <span style={{ color: 'var(--violet)' }}><strong>{importPreview.newStores.length}</strong> new store(s) will be created</span>
                  )}
                </div>

                {importPreview.newStores.length > 0 && (
                  <div style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 'var(--r)', marginBottom: 12, fontSize: 12 }}>
                    New stores to create: {importPreview.newStores.join(', ')}
                  </div>
                )}

                {!importPreview.canCommit && (
                  <div className="alert alert-error" style={{ marginBottom: 12 }}>All rows have errors — correct the file and re-upload.</div>
                )}

                <div style={{ maxHeight: 340, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 14 }}>
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th scope="col">#</th><th scope="col">Employee ID</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th>
                        <th scope="col">Store Code</th><th scope="col">Store Status</th><th scope="col">Status</th><th scope="col">Note</th>
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
                  {importResult.newStoreCount > 0 && ` ${importResult.newStoreCount} new store(s) were created.`}
                </div>

                {importResult.newStores?.length > 0 && (
                  <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--t3)' }}>
                    New stores created: {importResult.newStores.map(s => s.storeCode).join(', ')}
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
                <div style={{ position: 'relative' }}>
                  <input 
                    id="user-pw" 
                    type={showPassword ? 'text' : 'password'} 
                    value={formData.password} 
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required={!editingId} 
                    disabled={submitting} 
                    placeholder="••••••••"
                    style={{ paddingRight: 38 }}
                  />
                  {formData.password && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 6,
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--t3)',
                        transition: 'color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--amber-light)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  )}
                </div>
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
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="AREA_MANAGER">Area Manager</option>
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
                  <label htmlFor="user-store">Assigned Store {!editingId && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                  <select id="user-store" value={formData.storeId} onChange={e => setFormData({ ...formData, storeId: e.target.value })}
                    required={!editingId} disabled={submitting}>
                    <option value="">Select a store…</option>
                    {stores.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>
                    ))}
                  </select>
                  {editingId && !formData.storeId && (
                    <small style={{ color: 'var(--amber)', fontSize: 11, marginTop: 4, display: 'block' }}>
                      No store assigned — upload inventory first to create stores, then reassign.
                    </small>
                  )}
                </div>
              )}
              {formData.role === 'AREA_MANAGER' && (
                <div className="form-group">
                  <label>
                    Assign Stores{' '}
                    <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>
                      ({amStoreIds.length} / 10 selected — optional)
                    </span>
                  </label>
                  {stores.filter(s => s.isActive).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--t3)' }}>No active stores available yet.</p>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(185,28,28,0.18)', borderRadius: 'var(--r)', padding: '6px 0' }}>
                      {stores.filter(s => s.isActive).map(s => {
                        const checked = amStoreIds.includes(s.id);
                        const disabled = !checked && amStoreIds.length >= 10;
                        return (
                          <label
                            key={s.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'background 0.12s' }}
                            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(109,40,217,0.05)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || submitting}
                              onChange={() => toggleAmStore(s.id)}
                              style={{ width: 15, height: 15, accentColor: '#7c3aed', flexShrink: 0 }}
                            />
                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#7c3aed', flexShrink: 0 }}>{s.storeCode}</span>
                            <span style={{ fontSize: 12.5, color: 'var(--t1)' }}>{s.storeName}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {amStoreIds.length >= 10 && (
                    <small style={{ color: '#b45309', fontSize: 11, marginTop: 4, display: 'block' }}>
                      Maximum 10 stores per Area Manager. Deselect one to add another.
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
              <h3>Create Managers for Unassigned Stores</h3>
              <button className="close-btn" onClick={() => setShowBatchModal(false)} disabled={batchCreating}>&times;</button>
            </div>
            {!batchResult ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
                  Stores below have no assigned users. Create store managers (username: <strong>MGR&#123;storeCode&#125;</strong>) with unique temporary passwords.
                </p>
                <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                  <table style={{ fontSize: 12 }}>
                    <thead><tr style={{ background: 'var(--surface-2)' }}>
                      <th scope="col">Store Code</th><th scope="col">Store Name</th><th scope="col">Username</th><th scope="col">Full Name</th>
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
                    <div style={{ maxHeight: 280, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
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
