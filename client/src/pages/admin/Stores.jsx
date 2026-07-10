import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import { useToast } from '../../context/ToastContext';

export default function AdminStores() {
  const toast = useToast();
  const [stores, setStores]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(new Set()); // Set of store IDs

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [editingId, setEditingId]   = useState(null);
  const [formData, setFormData]     = useState({ storeCode: '', storeName: '', isActive: true });

  // Bulk delete state
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => { loadStores(); }, []);

  async function loadStores() {
    try {
      setLoading(true);
      setSelected(new Set());
      const data = await adminApi.getStores();
      setStores(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load stores. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────
  const allSelected = stores.length > 0 && selected.size === stores.length;
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
  async function handleBulkDelete() {
    const selectedStores = stores.filter(s => selected.has(s.id));
    const withRecords    = selectedStores.filter(s => s._count.inventoryRecords > 0);
    const totalRecords   = withRecords.reduce((sum, s) => sum + s._count.inventoryRecords, 0);

    const msg =
      `DELETE ${selected.size} PLANT${selected.size !== 1 ? 'S' : ''}\n\n` +
      (withRecords.length > 0
        ? `⚠ ${withRecords.length} plant(s) have a combined ${totalRecords} inventory record(s) that will also be permanently erased.\n\n`
        : '') +
      `This cannot be undone.\n\nType  DELETE  to confirm:`;

    const confirmed = prompt(msg);
    if (confirmed !== 'DELETE') {
      if (confirmed !== null) toast.warning('Confirmation did not match — no plants deleted.');
      return;
    }

    // Optimistic update — remove from screen immediately before server responds
    const deletingIds = Array.from(selected);
    setStores(prev => prev.filter(s => !selected.has(s.id)));
    setSelected(new Set());
    setBulkDeleting(true);
    try {
      const result = await adminApi.bulkDeleteStores(deletingIds, true);
      toast.success(result.message);
      await loadStores(); // sync with server state
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
      await loadStores(); // rollback on error
    } finally {
      setBulkDeleting(false);
    }
  }

  // ── Single store actions ───────────────────────────────────────────
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

  async function handleDelete(store) {
    if (!confirm(`Delete plant "${store.storeName}" (${store.storeCode})?\n\nThis cannot be undone.`)) return;
    try {
      await adminApi.deleteStore(store.id);
      await loadStores();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  }

  async function handleForceDelete(store) {
    const confirmed = prompt(
      `FORCE DELETE "${store.storeName}" (${store.storeCode})\n\n` +
      `Will permanently erase ${store._count.inventoryRecords} inventory record(s), deadline extensions, and manager links.\n\n` +
      `Type the plant code to confirm:`
    );
    if (confirmed !== store.storeCode) {
      if (confirmed !== null) toast.warning('Plant code did not match — deletion cancelled.');
      return;
    }
    try {
      await adminApi.forceDeleteStore(store.id);
      await loadStores();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Force delete failed');
    }
  }

  const activeCount   = stores.filter(s => s.isActive).length;
  const inactiveCount = stores.filter(s => !s.isActive).length;

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Plant Management</h2>
          <p>
            {stores.length === 0
              ? 'No plants yet — add your first plant to get started.'
              : `${activeCount} active · ${inactiveCount} inactive · ${stores.length} total`}
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ Add Plant</button>
      </div>

      {/* ── Bulk action bar (shown when stores are selected) ── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: 12,
          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 'var(--r-md)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {selected.size} plant{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelected(new Set())}
              disabled={bulkDeleting}
            >
              Clear selection
            </button>
            <button
              className="btn btn-sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{ background: 'rgba(239,68,68,0.14)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.28)', fontWeight: 600 }}
            >
              {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} Plant${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '40px 20px' }}>
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-card" style={{ marginBottom: 12 }} />
          <div className="skeleton skeleton-text" style={{ width: '40%', margin: '0 auto' }} />
        </div>
      ) : stores.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Plants Yet</h3>
          <p className="empty-state-description">
            Add your first plant location to start managing inventory across your network.
          </p>
          <button onClick={openCreate} className="btn btn-primary empty-state-cta">
            + Add First Plant
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--vi)' }}
                      title={allSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th>Plant Code</th>
                  <th>Plant Name</th>
                  <th>Managers</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(store => (
                  <tr
                    key={store.id}
                    style={selected.has(store.id) ? { background: 'rgba(139,92,246,0.06)' } : {}}
                  >
                    <td style={{ paddingRight: 0 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(store.id)}
                        onChange={() => toggleSelect(store.id)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--vi)' }}
                      />
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--vi-light)', fontFamily: 'monospace' }}>
                      {store.storeCode}
                    </td>
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
                        <button
                          onClick={() => handleDelete(store)}
                          className="btn btn-sm"
                          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => handleForceDelete(store)}
                          className="btn btn-sm"
                          title={`Force delete — erases ${store._count.inventoryRecords} record(s)`}
                          style={{ background: 'rgba(239,68,68,0.07)', color: '#f87171', border: '1px solid rgba(239,68,68,0.18)', fontSize: 11 }}
                        >
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

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Plant' : 'Add Plant'}</h3>
              <button className="close-btn" onClick={closeModal} disabled={submitting}>&times;</button>
            </div>

            {formError && (
              <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{formError}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Plant Code</label>
                <input
                  type="text"
                  value={formData.storeCode}
                  onChange={e => setFormData({ ...formData, storeCode: e.target.value })}
                  required
                  disabled={editingId !== null || submitting}
                  placeholder="e.g. 2050"
                  autoFocus
                />
                {!editingId && (
                  <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Must match the code in your Excel files. Cannot be changed after creation.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Plant Name</label>
                <input
                  type="text"
                  value={formData.storeName}
                  onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                  required
                  disabled={submitting}
                  placeholder="e.g. Kinshasa Central Branch"
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                    disabled={submitting}
                  />
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
        </div>
      )}
    </AdminLayout>
  );
}
