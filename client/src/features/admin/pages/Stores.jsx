import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../layout/AdminLayout';
import Modal from '../../../shared/components/ui/Modal';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { LoadingCard } from '../../../shared/components/ui/LoadingCard';
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
  const [loading, setLoading]   = useState(false); // START WITH FALSE
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(new Set());

  // Add / Edit modal
  const [showModal, setShowModal]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({ storeCode: '', storeName: '', isActive: true });

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
    console.log('🔵🔵🔵 NEW VERSION - Stores component mounted');
    loadStores(); 
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStores() {
    console.log('🟢 loadStores START');
    setLoadError('');
    setLoading(true);
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        console.error('⏱️⏱️⏱️ TIMEOUT FIRED');
        reject(new Error('Request timed out after 5 seconds'));
      }, 5000)
    );
    
    try {
      setSelected(new Set());
      console.log('🟡 Making API call...');
      
      const data = await Promise.race([
        adminApi.getStores(),
        timeoutPromise
      ]);
      
      console.log('✅✅✅ GOT DATA:', data, 'Length:', data?.length);
      
      // FORCE STATE UPDATE - ignore mountedRef
      setStores(data);
      setLoading(false);
      console.log('✅ Stores state FORCED update');
      
    } catch (err) {
      console.error('❌❌❌ ERROR:', err.message);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load plants';
      setLoadError(errorMsg);
      setLoading(false);
      toast.error(errorMsg);
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
      toast.error(err.response?.data?.error || 'Bulk delete failed');
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
        await adminApi.updateStore(editingId, { storeName: formData.storeName, isActive: formData.isActive });
      } else {
        await adminApi.createStore({ ...formData, storeCode: formData.storeCode.trim() });
      }
      setShowModal(false);
      setEditingId(null);
      await loadStores();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Operation failed. Please try again.');
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
      toast.success(`"${target.storeName}" deleted`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
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
      toast.success(`"${target.storeName}" and all its data deleted`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Force delete failed');
      setForceDeleteTarget(null);
      await loadStores();
    } finally {
      setSingleDeleting(false);
    }
  }

  const activeCount   = stores.filter(s => s.isActive).length;
  const inactiveCount = stores.filter(s => !s.isActive).length;

  const subtitle = loading
    ? 'Loading plants…'
    : loadError
      ? 'Failed to load plants — see below'
      : stores.length === 0
        ? 'No plants yet — add your first plant to get started.'
        : `${activeCount} active · ${inactiveCount} inactive · ${stores.length} total`;

  return (
    <AdminLayout>
      <PageHeader
        title="Plant Management"
        subtitle={subtitle}
        actions={<button onClick={openCreate} className="btn btn-primary">+ Add Plant</button>}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', marginBottom: 12, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--r-md)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {selected.size} plant{selected.size !== 1 ? 's' : ''} selected
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
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Plant${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingCard rows={4} />
      ) : loadError ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', color: 'var(--red)' }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--t1)' }}>Failed to Load Plants</h3>
          <p style={{ color: 'var(--t3)', marginBottom: 16 }}>{loadError}</p>
          <button onClick={loadStores} className="btn btn-primary">Retry</button>
        </div>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No Plants Yet"
          description="Add your first plant location to start managing inventory across your network."
          action={<button onClick={openCreate} className="btn btn-primary">+ Add First Plant</button>}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
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
                  <th scope="col">Plant Code</th>
                  <th scope="col">Plant Name</th>
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
              <h3>Delete Plant</h3>
              <button className="close-btn" onClick={() => setDeleteTarget(null)} disabled={singleDeleting}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Permanently delete <strong>{deleteTarget.storeName}</strong> ({deleteTarget.storeCode})? This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={singleDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={singleDeleting}>
                {singleDeleting ? 'Deleting…' : 'Delete Plant'}
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
              <h3>Force Delete Plant</h3>
              <button className="close-btn" onClick={() => setForceDeleteTarget(null)} disabled={singleDeleting}>&times;</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              Permanently erase <strong>{forceDeleteTarget._count?.inventoryRecords ?? 0}</strong> inventory record(s), deadline extensions, and manager links for <strong>{forceDeleteTarget.storeName}</strong>.
            </div>
            <div className="form-group">
              <label htmlFor="force-del-code" style={{ fontSize: 12 }}>Type the plant code <strong>{forceDeleteTarget.storeCode}</strong> to confirm</label>
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
                  ? `${withRec.length} plant(s) have a combined ${total} inventory record(s) that will also be permanently erased.`
                  : `Permanently delete ${selected.size} plant(s). This cannot be undone.`;
              })()}
            </div>
            <div className="form-group">
              <label htmlFor="bulk-del-confirm" style={{ fontSize: 12 }}>Type <strong>DELETE</strong> to confirm</label>
              <input id="bulk-del-confirm" type="text" value={bulkConfirmText} onChange={e => setBulkConfirmText(e.target.value)} placeholder="DELETE" autoFocus disabled={bulkDeleting} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmBulkDelete} disabled={bulkDeleting || bulkConfirmText !== 'DELETE'}>
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Plant${selected.size !== 1 ? 's' : ''}`}
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
              <h3>{editingId ? 'Edit Plant' : 'Add Plant'}</h3>
              <button className="close-btn" onClick={closeModal} disabled={submitting}>&times;</button>
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="store-code">Plant Code</label>
                <input id="store-code" type="text" value={formData.storeCode} onChange={e => setFormData(f => ({ ...f, storeCode: e.target.value }))} required disabled={editingId !== null || submitting} placeholder="e.g. 2050" autoFocus />
                {!editingId && <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>Must match the code in your Excel files. Cannot be changed after creation.</small>}
              </div>
              <div className="form-group">
                <label htmlFor="store-name">Plant Name</label>
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
                  {submitting ? 'Saving…' : editingId ? 'Update Plant' : 'Create Plant'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
