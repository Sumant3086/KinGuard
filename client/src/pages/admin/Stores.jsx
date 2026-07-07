import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import * as cache from '../../api/cache';

const CACHE_KEY = 'admin:stores';
const CACHE_TTL = 60_000;

export default function AdminStores() {
  const [stores, setStores] = useState(() => cache.get(CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(!cache.get(CACHE_KEY));
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ storeCode: '', storeName: '', isActive: true });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (cache.get(CACHE_KEY)) return;
    let live = true;
    adminApi.getStores()
      .then(d => { if (live) { cache.set(CACHE_KEY, d, CACHE_TTL); setStores(d); } })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  async function refreshStores() {
    const d = await adminApi.getStores();
    cache.set(CACHE_KEY, d, CACHE_TTL);
    setStores(d);
  }

  function openModal(store = null) {
    if (store) {
      setEditingId(store.id);
      setFormData({ storeCode: store.storeCode, storeName: store.storeName, isActive: store.isActive });
    } else {
      setEditingId(null);
      setFormData({ storeCode: '', storeName: '', isActive: true });
    }
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setFormData({ storeCode: '', storeName: '', isActive: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        await adminApi.updateStore(editingId, { storeName: formData.storeName, isActive: formData.isActive });
      } else {
        await adminApi.createStore(formData);
      }
      // Invalidate dependent caches, then refresh
      cache.invalidate(CACHE_KEY, 'admin:dashboard');
      closeModal();
      await refreshStores();
    } catch (err) {
      alert(err.response?.data?.error || 'Operation failed');
    }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Store Management</h2>
          <p>Manage store locations and their status</p>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary">
          + Add New Store
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading stores…</div>
      ) : stores.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏪</div>
            <p>No stores yet. Add your first store to get started.</p>
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
                  <th>Users</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td style={{ fontWeight: 700, color: 'var(--t1)', fontFamily: 'monospace' }}>{store.storeCode}</td>
                    <td style={{ fontWeight: 600 }}>{store.storeName}</td>
                    <td style={{ color: 'var(--t3)' }}>{store._count.users}</td>
                    <td style={{ color: 'var(--t3)' }}>{store._count.inventoryRecords}</td>
                    <td>
                      <span className={`badge ${store.isActive ? 'badge-active' : 'badge-inactive'}`}>
                        {store.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => openModal(store)}
                        className="btn btn-secondary btn-sm"
                      >
                        Edit
                      </button>
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
              <h3>{editingId ? 'Edit Store' : 'Add New Store'}</h3>
              <button onClick={closeModal} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Store Code</label>
                <input
                  type="text"
                  value={formData.storeCode}
                  onChange={(e) => setFormData({ ...formData, storeCode: e.target.value })}
                  required
                  disabled={editingId !== null}
                  placeholder="e.g. STR001"
                />
              </div>
              <div className="form-group">
                <label>Store Name</label>
                <input
                  type="text"
                  value={formData.storeName}
                  onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                  required
                  placeholder="e.g. Kinshasa Central"
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Active
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update Store' : 'Create Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
