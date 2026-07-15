import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';

const StoreIcon = (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export default function Stores() {
  const toast = useToast();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [areaManagers, setAreaManagers] = useState([]);

  // Add / Edit modal
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({ storeCode: '', storeName: '', isActive: true });

  // AM assignment modal
  const [amModal, setAmModal]       = useState(null); // { storeId, storeName, currentAmId }
  const [amAssigning, setAmAssigning] = useState(false);
  const [selectedAmId, setSelectedAmId] = useState('');

  // Delete / force-delete modals
  const [deleteTarget, setDeleteTarget]           = useState(null);
  const [forceDeleteTarget, setForceDeleteTarget] = useState(null);
  const [forceDeleteCode, setForceDeleteCode]     = useState('');
  const [singleDeleting, setSingleDeleting]       = useState(false);

  // Bulk delete
  const [bulkDeleting, setBulkDeleting]       = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState('');

  useEffect(() => {
    loadStores();
    adminApi.getAreaManagers().then(setAreaManagers).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStores() {
    setLoadError('');
    setLoading(true);
    try {
      setSelected(new Set());
      const data = await adminApi.getStores();
      setStores(data);
    } catch (err) {
      console.error('Load stores:', err);
      setLoadError('Could not load stores. Please refresh.');
      toast.error('Could not load stores. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  // ── Selection ──────────────────────────────────────────────────────
  const allSelected  = stores.length > 0 && selected.size === stores.length;
  const someSelected = selected.size > 0 && selected.size < stores.length;

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(stores.map(s => s.id)));
  }

  // ── Bulk delete ────────────────────────────────────────────────────
  async function confirmBulkDelete() {
    setShowBulkConfirm(false);
    const ids = Array.from(selected);
    setStores(prev => prev.filter(s => !selected.has(s.id)));
    setSelected(new Set());
    setBulkDeleting(true);
    try {
      const result = await adminApi.bulkDeleteStores(ids, true);
      toast.success(result.message);
      await loadStores();
    } catch (err) {
      console.error('Bulk delete stores:', err);
      toast.error('Could not delete stores. Try again.');
      await loadStores();
    } finally {
      setBulkDeleting(false);
    }
  }

  // ── Single CRUD ────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setFormData({ storeCode: '', storeName: '', isActive: true });
    setFormError('');
    setShowModal(true);
  }

  function openEdit(store) {
    setEditingId(store.id);
    setFormData({ storeCode: store.storeCode, storeName: store.storeName, isActive: store.isActive });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    if (submitting) return;
    setShowModal(false);
    setEditingId(null);
    setFormError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await adminApi.updateStore(editingId, { storeName: formData.storeName, isActive: formData.isActive });
        setStores(prev => prev.map(s => s.id === editingId ? { ...s, ...updated } : s));
      } else {
        const created = await adminApi.createStore({ ...formData, storeCode: formData.storeCode.trim() });
        setStores(prev => [...prev, { ...created, _count: { users: 0, inventoryRecords: 0 } }]);
      }
      setShowModal(false);
      setEditingId(null);
      loadStores(); // background sync
    } catch (err) {
      console.error('Save store:', err);
      setFormError('Could not save. Please check the details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSingleDeleting(true);
    const target = deleteTarget;
    try {
      await adminApi.deleteStore(target.id);
      setDeleteTarget(null);
      setStores(prev => prev.filter(s => s.id !== target.id));
      toast.success('Store deleted');
    } catch (err) {
      console.error('Delete store:', err);
      toast.error('Could not delete store. Try again.');
      setDeleteTarget(null);
      await loadStores();
    } finally {
      setSingleDeleting(false);
    }
  }

  async function confirmForceDelete() {
    if (!forceDeleteTarget) return;
    setSingleDeleting(true);
    const target = forceDeleteTarget;
    try {
      await adminApi.forceDeleteStore(target.id);
      setForceDeleteTarget(null);
      setStores(prev => prev.filter(s => s.id !== target.id));
      toast.success('Store and all its data deleted');
    } catch (err) {
      console.error('Force delete store:', err);
      toast.error('Could not delete store. Try again.');
      setForceDeleteTarget(null);
      await loadStores();
    } finally {
      setSingleDeleting(false);
    }
  }

  const activeCount   = stores.filter(s => s.isActive).length;
  const inactiveCount = stores.filter(s => !s.isActive).length;

  const subtitle = loading
    ? 'Loading stores…'
    : loadError
      ? 'Failed to load stores — see below'
      : stores.length === 0
        ? 'No stores yet — add your first store to get started.'
        : `${activeCount} active · ${inactiveCount} inactive · ${stores.length} total`;

  return (
    <AdminLayout>
      <PageHeader
        title="Store Management"
        subtitle={subtitle}
        actions={<button onClick={openCreate} className="btn btn-primary">+ Add Store</button>}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', marginBottom: 12, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--r-md)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {selected.size} store{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
              Clear selection
            </button>
            <button
              className="btn btn-sm"
              onClick={() => { setBulkConfirmText(''); setShowBulkConfirm(true); }}
              disabled={bulkDeleting}
              style={{ background: 'rgba(239,68,68,0.14)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.28)', fontWeight: 600 }}
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Store${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : loadError ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', color: 'var(--red)' }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--t1)' }}>Failed to Load Stores</h3>
          <p style={{ color: 'var(--t3)', marginBottom: 16 }}>{loadError}</p>
          <button onClick={loadStores} className="btn btn-primary">Retry</button>
        </div>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No Stores Yet"
          description="Add your first store to start managing inventory across your network."
          action={<button onClick={openCreate} className="btn btn-primary">+ Add First Store</button>}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
          <div className="stores-cards" style={{ padding: 12 }}>
            {/* Select All row */}
            <div className="mobile-select-bar">
              <label className="mobile-select-all-label">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--vi)', flexShrink: 0 }}
                />
                <span className="mobile-select-all-text">
                  {selected.size > 0 ? `${selected.size} of ${stores.length} selected` : `Select all ${stores.length} stores`}
                </span>
              </label>
              {selected.size > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ flexShrink: 0 }}>
                  Clear
                </button>
              )}
            </div>

            {stores.map(store => (
              <div
                key={store.id}
                className={`store-card${selected.has(store.id) ? ' store-card-selected' : ''}`}
              >
                {/* Row 1: checkbox + code + status */}
                <div className="store-card-row1">
                  <input
                    type="checkbox"
                    checked={selected.has(store.id)}
                    onChange={() => toggleSelect(store.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--vi)', flexShrink: 0 }}
                  />
                  <span className="store-card-code">{store.storeCode}</span>
                  <span className={`badge ${store.isActive ? 'badge-active' : 'badge-inactive'}`} style={{ marginLeft: 'auto' }}>
                    {store.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {/* Row 2: store name */}
                <div className="store-card-name">{store.storeName}</div>
                {/* Row 3: meta counts */}
                <div className="store-card-meta">
                  <span>{store._count.users} manager{store._count.users !== 1 ? 's' : ''}</span>
                  <span className="store-card-dot">·</span>
                  <span>{store._count.inventoryRecords} record{store._count.inventoryRecords !== 1 ? 's' : ''}</span>
                </div>
                {/* AM badge if assigned */}
                {store.areaManagerId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(124,58,237,0.10)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.22)', fontWeight: 700 }}>
                      AM Assigned
                    </span>
                  </div>
                )}
                {/* Row 4: action buttons — 2-row grid so Assign AM is always visible */}
                <div className="store-card-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button onClick={() => openEdit(store)} className="btn btn-secondary btn-sm">Edit</button>
                  <button
                    onClick={() => { setAmModal({ storeId: store.id, storeName: store.storeName, currentAmId: store.areaManagerId }); setSelectedAmId(store.areaManagerId ? String(store.areaManagerId) : ''); }}
                    className="btn btn-sm"
                    style={{ background: 'rgba(124,58,237,0.09)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.22)', fontWeight: 600 }}
                  >
                    {store.areaManagerId ? 'Change AM' : 'Assign AM'}
                  </button>
                  {store._count.inventoryRecords === 0 ? (
                    <button
                      onClick={() => setDeleteTarget(store)}
                      className="btn btn-sm"
                      style={{ gridColumn: 'span 2', background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)', fontWeight: 700 }}
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => { setForceDeleteTarget(store); setForceDeleteCode(''); }}
                      className="btn btn-sm"
                      style={{ gridColumn: 'span 2', background: 'rgba(239,68,68,0.06)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontWeight: 600, fontSize: 11 }}
                    >
                      Force Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop table (>768px) ────────────────────────────── */}
          <div className="table-container stores-table-desktop">
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 36, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--vi)' }}
                      title={allSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th scope="col">Store Code</th>
                  <th scope="col">Store Name</th>
                  <th scope="col">Managers</th>
                  <th scope="col">Records</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(store => (
                  <tr key={store.id} style={selected.has(store.id) ? { background: 'rgba(139,92,246,0.06)' } : {}}>
                    <td style={{ paddingRight: 0 }}>
                      <input type="checkbox" checked={selected.has(store.id)} onChange={() => toggleSelect(store.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--vi)' }} />
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--vi-light)', fontFamily: 'monospace' }}>{store.storeCode}</td>
                    <td style={{ fontWeight: 600 }}>{store.storeName}</td>
                    <td style={{ color: 'var(--t3)' }}>{store._count.users}</td>
                    <td style={{ color: 'var(--t3)' }}>{store._count.inventoryRecords}</td>
                    <td>
                      <span className={`badge ${store.isActive ? 'badge-active' : 'badge-inactive'}`}>
                        {store.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => openEdit(store)} className="btn btn-secondary btn-sm">Edit</button>
                      <button
                        onClick={() => { setAmModal({ storeId: store.id, storeName: store.storeName, currentAmId: store.areaManagerId }); setSelectedAmId(store.areaManagerId ? String(store.areaManagerId) : ''); }}
                        className="btn btn-sm"
                        style={{ background: 'rgba(124,58,237,0.09)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.22)' }}
                      >
                        {store.areaManagerId ? 'Change AM' : 'Assign AM'}
                      </button>
                      {store._count.inventoryRecords === 0 ? (
                        <button onClick={() => setDeleteTarget(store)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}>
                          Delete
                        </button>
                      ) : (
                        <button onClick={() => { setForceDeleteTarget(store); setForceDeleteCode(''); }} className="btn btn-sm" title={`Force delete — erases ${store._count.inventoryRecords} record(s)`} style={{ background: 'rgba(239,68,68,0.07)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontSize: 11 }}>
                          Force Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Single delete */}
      {deleteTarget && (
        <Modal onClose={() => !singleDeleting && setDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Delete Store</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)} disabled={singleDeleting}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Permanently delete <strong>{deleteTarget.storeName}</strong> ({deleteTarget.storeCode})? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={singleDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={singleDeleting}>
                {singleDeleting ? 'Deleting…' : 'Delete Store'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Force delete */}
      {forceDeleteTarget && (
        <Modal onClose={() => !singleDeleting && setForceDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Force Delete Store</h3>
              <button className="close-btn" onClick={() => setForceDeleteTarget(null)} disabled={singleDeleting}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Permanently erase <strong>{forceDeleteTarget._count?.inventoryRecords ?? 0}</strong> inventory record(s), deadline extensions, and manager links for <strong>{forceDeleteTarget.storeName}</strong>.
            </div>
            <div className="form-group">
              <label htmlFor="force-del-code" style={{ fontSize: 12 }}>Type the store code <strong>{forceDeleteTarget.storeCode}</strong> to confirm</label>
              <input id="force-del-code" type="text" value={forceDeleteCode} onChange={e => setForceDeleteCode(e.target.value)} placeholder={forceDeleteTarget.storeCode} autoFocus disabled={singleDeleting} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setForceDeleteTarget(null)} disabled={singleDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmForceDelete} disabled={singleDeleting || forceDeleteCode !== forceDeleteTarget.storeCode}>
                {singleDeleting ? 'Deleting…' : 'Force Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk delete */}
      {showBulkConfirm && (
        <Modal onClose={() => !bulkDeleting && setShowBulkConfirm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Delete {selected.size} Plant{selected.size !== 1 ? 's' : ''}</h3>
              <button className="close-btn" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {(() => {
                const sel = stores.filter(s => selected.has(s.id));
                const withRec = sel.filter(s => s._count.inventoryRecords > 0);
                const total   = withRec.reduce((n, s) => n + s._count.inventoryRecords, 0);
                return withRec.length > 0
                  ? `${withRec.length} store(s) have a combined ${total} inventory record(s) that will also be permanently erased.`
                  : `Permanently delete ${selected.size} store(s). This cannot be undone.`;
              })()}
            </div>
            <div className="form-group">
              <label htmlFor="bulk-del-confirm" style={{ fontSize: 12 }}>Type <strong>DELETE</strong> to confirm</label>
              <input id="bulk-del-confirm" type="text" value={bulkConfirmText} onChange={e => setBulkConfirmText(e.target.value)} placeholder="DELETE" autoFocus disabled={bulkDeleting} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmBulkDelete} disabled={bulkDeleting || bulkConfirmText !== 'DELETE'}>
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Store${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit */}
      {showModal && (
        <Modal onClose={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Store' : 'Add Store'}</h3>
              <button className="close-btn" onClick={closeModal} disabled={submitting}>&times;</button>
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="store-code">Store Code</label>
                <input id="store-code" type="text" value={formData.storeCode} onChange={e => setFormData(f => ({ ...f, storeCode: e.target.value }))} required disabled={editingId !== null || submitting} placeholder="e.g. 2050" autoFocus />
                {!editingId && <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>Must match the code used in your Excel upload files. Cannot be changed after creation.</small>}
              </div>
              <div className="form-group">
                <label htmlFor="store-name">Store Name</label>
                <input id="store-name" type="text" value={formData.storeName} onChange={e => setFormData(f => ({ ...f, storeName: e.target.value }))} required disabled={submitting} placeholder="e.g. Kinshasa Central Branch" />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 'auto' }} disabled={submitting} />
                  Active
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Update Store' : 'Create Store'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Area Manager Assignment Modal */}
      {amModal && (
        <Modal onClose={() => setAmModal(null)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Assign Area Manager</h3>
              <button className="close-btn" onClick={() => setAmModal(null)}>&times;</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 16 }}>
              Assign an Area Manager to <strong>{amModal.storeName}</strong>. They will review this store's submissions before they reach you.
            </p>
            <div className="form-group">
              <label>Area Manager</label>
              <select value={selectedAmId} onChange={e => setSelectedAmId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {areaManagers.map(am => (
                  <option key={am.id} value={am.id}>{am.name} ({am.employeeId}) — {am.managedStores.length} stores</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setAmModal(null)} disabled={amAssigning}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={amAssigning}
                onClick={async () => {
                  setAmAssigning(true);
                  try {
                    await adminApi.assignStoreAM(amModal.storeId, selectedAmId ? parseInt(selectedAmId) : null);
                    toast.success('Area Manager assigned');
                    setStores(prev => prev.map(s => s.id === amModal.storeId ? { ...s, areaManagerId: selectedAmId ? parseInt(selectedAmId) : null } : s));
                    setAmModal(null);
                  } catch (e) {
                    console.error('Assign AM:', e);
                    toast.error('Could not assign. Try again.');
                  } finally { setAmAssigning(false); }
                }}
              >
                {amAssigning ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
