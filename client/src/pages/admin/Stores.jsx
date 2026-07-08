import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminStores() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({ storeCode: '', storeName: '', isActive: true });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    try {
      setLoading(true);
      const data = await adminApi.getStores();
      setStores(data);
    } catch (err) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  }

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
    if (!confirm(`Delete store "${store.storeName}" (${store.storeCode})?\n\nThis cannot be undone.`)) return;
    try {
      await adminApi.deleteStore(store.id);
      await loadStores();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  }

  const activeStores   = stores.filter(s => s.isActive);
  const inactiveStores = stores.filter(s => !s.isActive);

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Store Management</h2>
          <p>
            {stores.length === 0
              ? 'No stores yet — add your first store to get started.'
              : `${activeStores.length} active · ${inactiveStores.length} inactive`}
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ Add Store</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading stores…</div>
      ) : stores.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏪</div>
            <p>Add your first store to get started.</p>
            <button onClick={openCreate} className="btn btn-primary" style={{ marginTop: 16 }}>
              + Add Store
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Store Code</th>
                  <th>Store Name</th>
                  <th>Manager Accounts</th>
                  <th>Inventory Records</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td style={{ fontWeight: 700, color: 'var(--t1)', fontFamily: 'monospace' }}>
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
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(store)} className="btn btn-secondary btn-sm">
                        Edit
                      </button>
                      {store._count.inventoryRecords === 0 && (
                        <button
                          onClick={() => handleDelete(store)}
                          className="btn btn-sm"
                          style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.25)' }}
                        >
                          Delete
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

      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Store' : 'Add Store'}</h3>
              <button onClick={closeModal} className="close-btn" disabled={submitting}>&times;</button>
            </div>

            {formError && (
              <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Store Code</label>
                <input
                  type="text"
                  value={formData.storeCode}
                  onChange={(e) => setFormData({ ...formData, storeCode: e.target.value })}
                  required
                  disabled={editingId !== null || submitting}
                  placeholder="e.g. 2050"
                  autoFocus
                />
                {!editingId && (
                  <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Must be unique. Cannot be changed after creation.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Store Name</label>
                <input
                  type="text"
                  value={formData.storeName}
                  onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                    disabled={submitting}
                  />
                  Active
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Update Store' : 'Create Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
