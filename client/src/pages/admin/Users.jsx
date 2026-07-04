import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    password: '',
    role: 'STORE_MANAGER',
    storeId: '',
    isActive: true,
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersData, storesData] = await Promise.all([adminApi.getUsers(), adminApi.getStores()]);
      setUsers(usersData);
      setStores(storesData);
    } finally {
      setLoading(false);
    }
  }

  function openModal(user = null) {
    if (user) {
      setEditingId(user.id);
      setFormData({
        employeeId: user.employeeId,
        name: user.name,
        password: '',
        role: user.role,
        storeId: user.storeId || '',
        isActive: user.isActive,
      });
    } else {
      setEditingId(null);
      setFormData({
        employeeId: '',
        name: '',
        password: '',
        role: 'STORE_MANAGER',
        storeId: '',
        isActive: true,
      });
    }
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (payload.role === 'ADMIN') {
        payload.storeId = null;
      }
      if (!payload.password) {
        delete payload.password;
      }

      if (editingId) {
        await adminApi.updateUser(editingId, payload);
      } else {
        await adminApi.createUser(payload);
      }
      closeModal();
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Operation failed');
    }
  }

  return (
    <AdminLayout>
      <h2>Users</h2>

      <button onClick={() => openModal()} className="btn btn-primary" style={{ marginBottom: '20px' }}>
        Add User
      </button>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Store</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.employeeId}</td>
                  <td>{user.name}</td>
                  <td>{user.role}</td>
                  <td>{user.store ? `${user.store.storeCode} - ${user.store.storeName}` : '-'}</td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-submitted' : 'badge-pending'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => openModal(user)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }}>
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
              <h3>{editingId ? 'Edit User' : 'Add User'}</h3>
              <button onClick={closeModal} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Employee ID</label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  required
                  disabled={editingId !== null}
                />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password {editingId && '(leave empty to keep current)'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingId}
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required
                  disabled={editingId !== null}
                >
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {formData.role === 'STORE_MANAGER' && (
                <div className="form-group">
                  <label>Store</label>
                  <select
                    value={formData.storeId}
                    onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                    required
                  >
                    <option value="">Select Store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.storeCode} - {store.storeName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
