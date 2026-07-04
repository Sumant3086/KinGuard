import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminStores() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ storeCode: '', storeName: '', isActive: true });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadStores();
  }, []);

  async function loadStores() {
    try {
      const data = await adminApi.getStores();
      setStores(data);
    } finally {
      setLoading(false);
    }
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
      closeModal();
      loadStores();
    } catch (err) {
      alert(err.response?.data?.error || 'Operation failed');
    }
  }

  return (
    <AdminLayout>
      <h2>Stores</h2>

      <button onClick={() => openModal()} className="btn btn-primary" style={{ marginBottom: '20px' }}>
        Add Store
      </button>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="card">
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
                  <td>{store.storeCode}</td>
                  <td>{store.storeName}</td>
                  <td>{store._count.users}</td>
                  <td>{store._count.inventoryRecords}</td>
                  <td>
                    <span className={`badge ${store.isActive ? 'badge-submitted' : 'badge-pending'}`}>
                      {store.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => openModal(store)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Store' : 'Add Store'}</h3>
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
                />
              </div>
              <div className="form-group">
                <label>Store Name</label>
                <input
                  type="text"
                  value={formData.storeName}
                  onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  {' '}Active
                </label>
              </div>
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
