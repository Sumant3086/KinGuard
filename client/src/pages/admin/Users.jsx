import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import * as cache from '../../api/cache';

const USERS_KEY  = 'admin/users';
const STORES_KEY = 'admin/stores';
const USERS_TTL  = 120_000; // 2 min
const STORES_TTL = 120_000;

export default function AdminUsers() {
  const [users, setUsers]   = useState(() => cache.get(USERS_KEY)  ?? []);
  const [stores, setStores] = useState(() => cache.get(STORES_KEY) ?? []);
  const [loading, setLoading] = useState(!cache.get(USERS_KEY));
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '', name: '', password: '',
    role: 'STORE_MANAGER', storeId: '', isActive: true,
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const needUsers  = !cache.get(USERS_KEY);
    const needStores = !cache.get(STORES_KEY);
    if (!needUsers && !needStores) return;

    const fetches = [];
    if (needUsers)  fetches.push(adminApi.getUsers().then(d  => { cache.set(USERS_KEY,  d, USERS_TTL);  setUsers(d);  return d; }));
    if (needStores) fetches.push(adminApi.getStores().then(d => { cache.set(STORES_KEY, d, STORES_TTL); setStores(d); return d; }));

    Promise.all(fetches).finally(() => setLoading(false));
  }, []);

  async function refreshUsers() {
    const d = await adminApi.getUsers();
    cache.set(USERS_KEY, d, USERS_TTL);
    setUsers(d);
  }

  function openModal(user = null) {
    if (user) {
      setEditingId(user.id);
      setFormData({
        employeeId: user.employeeId, name: user.name, password: '',
        role: user.role, storeId: user.storeId || '', isActive: user.isActive,
      });
    } else {
      setEditingId(null);
      setFormData({ employeeId: '', name: '', password: '', role: 'STORE_MANAGER', storeId: '', isActive: true });
    }
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditingId(null); }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (payload.role === 'ADMIN') payload.storeId = null;
      if (!payload.password) delete payload.password;
      if (editingId) {
        await adminApi.updateUser(editingId, payload);
      } else {
        await adminApi.createUser(payload);
      }
      cache.invalidate(USERS_KEY);
      closeModal();
      await refreshUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Operation failed');
    }
  }

  const roleLabel = (role) => role === 'ADMIN' ? 'Admin' : 'Store Manager';

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>Manage employee accounts and store assignments</p>
        </div>
        <button onClick={() => openModal()} className="btn btn-primary">
          + Add User
        </button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading users…</div>
      ) : users.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <p>No users yet. Add your first user to get started.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
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
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{user.employeeId}</td>
                    <td style={{ fontWeight: 600 }}>{user.name}</td>
                    <td>
                      <span className={`badge ${user.role === 'ADMIN' ? 'badge-matched' : 'badge-excess'}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>
                      {user.store ? `${user.store.storeCode} — ${user.store.storeName}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-active' : 'badge-inactive'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => openModal(user)} className="btn btn-secondary btn-sm">
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
                  required disabled={editingId !== null}
                  placeholder="e.g. EMP001"
                />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required placeholder="Employee full name"
                />
              </div>
              <div className="form-group">
                <label>Password {editingId && <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(leave empty to keep current)</span>}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingId}
                  placeholder="••••••••"
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required disabled={editingId !== null}
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
                    <option value="">Select a store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.storeCode} — {store.storeName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Active account
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
