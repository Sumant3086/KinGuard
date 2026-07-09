import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function pwScore(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0-5
}

function PasswordStrength({ pw }) {
  const score = pwScore(pw);
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong';
  const color = score <= 1 ? 'var(--red)' : score <= 3 ? 'var(--amber)' : 'var(--green)';
  const pct   = Math.min(100, score * 20);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s, background 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
        <span style={{ color }}>Password strength: {label}</span>
        {score < 3 && (
          <span style={{ color: 'var(--t4)' }}>
            {!/[A-Z]/.test(pw) && 'Add uppercase · '}
            {!/[0-9]/.test(pw) && 'Add number · '}
            {pw.length < 8 && 'Min 8 chars'}
          </span>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, self, adminCount, onEdit, onDelete }) {
  const isSelf = user.id === self?.id;
  const isLastAdmin = user.role === 'ADMIN' && adminCount <= 1;
  const canDelete = !isSelf && !isLastAdmin;
  return (
    <tr>
      <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--vi-light)' }}>
        {user.employeeId}
      </td>
      <td style={{ fontWeight: 600 }}>{user.name}</td>
      <td>
        <span className={`badge ${user.role === 'ADMIN' ? 'badge-matched' : 'badge-excess'}`}>
          {user.role === 'ADMIN' ? 'Administrator' : 'Store Manager'}
        </span>
      </td>
      <td style={{ color: 'var(--t3)', fontSize: 12 }}>
        {user.store ? `${user.store.storeCode} -- ${user.store.storeName}` : '--'}
      </td>
      <td>
        <span className={`badge ${user.isActive ? 'badge-active' : 'badge-inactive'}`}>
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onEdit(user)} className="btn btn-secondary btn-sm">Edit</button>
        {canDelete ? (
          <button
            onClick={() => onDelete(user)}
            className="btn btn-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.22)' }}
          >
            Delete
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--t4)', alignSelf: 'center', paddingLeft: 4 }}>
            {isSelf ? 'You' : 'Last admin'}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function AdminUsers() {
  const { user: self } = useAuth();
  const toast = useToast();
  const [users, setUsers]   = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    employeeId: '', name: '', password: '',
    role: 'STORE_MANAGER', storeId: '', isActive: true,
    email: '', phone: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const [u, s] = await Promise.all([adminApi.getUsers(), adminApi.getStores()]);
      setUsers(u);
      setStores(s);
    } catch (err) {
      setLoadError('Failed to load users. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setFormData({ employeeId: '', name: '', password: '', role: 'STORE_MANAGER', storeId: '', isActive: true, email: '', phone: '' });
    setFormError('');
    setShowModal(true);
  }

  function openEdit(user) {
    setEditingId(user.id);
    setFormData({
      employeeId: user.employeeId,
      name: user.name,
      password: '',
      role: user.role,
      storeId: user.storeId || '',
      isActive: user.isActive,
      email: user.email || '',
      phone: user.phone || '',
    });
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
      const payload = { ...formData };
      if (payload.role === 'ADMIN') payload.storeId = null;
      if (!payload.password) delete payload.password;
      if (editingId) {
        await adminApi.updateUser(editingId, payload);
      } else {
        await adminApi.createUser(payload);
      }
      setShowModal(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user) {
    if (!confirm(
      `Delete user "${user.name}" (${user.employeeId})?\n\n` +
      `• Their uploaded batches and granted extensions will be reassigned to you.\n` +
      `• Their submitted records will be unlinked.\n\n` +
      `This cannot be undone.`
    )) return;
    try {
      await adminApi.deleteUser(user.id);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  }

  const adminUsers   = users.filter(u => u.role === 'ADMIN');
  const managerUsers = users.filter(u => u.role === 'STORE_MANAGER');

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>User Management</h2>
          <p>
            {users.length === 0
              ? 'No users yet.'
              : `${adminUsers.length} admin${adminUsers.length !== 1 ? 's' : ''} · ${managerUsers.length} store manager${managerUsers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary">+ Add User</button>
      </div>

      {loading ? (
        loadError
          ? <div className="alert alert-error">{loadError}</div>
          : <div className="loading"><div className="spinner" />Loading users…</div>
      ) : users.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <p>No users yet. Add your first user to get started.</p>
            <button onClick={openCreate} className="btn btn-primary" style={{ marginTop: 16 }}>+ Add User</button>
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
                  <th>Assigned Store</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => <UserRow key={u.id} user={u} self={self} adminCount={adminUsers.length} onEdit={openEdit} onDelete={handleDelete} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit User' : 'Add User'}</h3>
              <button className="close-btn" onClick={closeModal} disabled={submitting}>&times;</button>
            </div>

            {formError && (
              <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{formError}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Employee ID</label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                  required
                  disabled={!!editingId || submitting}
                  placeholder="e.g. MGR001"
                  autoFocus
                />
                {!editingId && (
                  <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Cannot be changed after creation.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={submitting}
                  placeholder="Employee full name"
                />
              </div>
              <div className="form-group">
                <label>
                  Password{' '}
                  {editingId && <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  required={!editingId}
                  disabled={submitting}
                  placeholder="••••••••"
                />
                {formData.password && <PasswordStrength pw={formData.password} />}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Email{' '}
                    <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(for notifications)</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    disabled={submitting}
                    placeholder="manager@company.com"
                  />
                </div>
                <div className="form-group">
                  <label>
                    WhatsApp Phone{' '}
                    <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>(with country code)</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    disabled={submitting}
                    placeholder="+243 812 345 678"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value, storeId: '' })}
                  required
                  disabled={!!editingId || submitting}
                >
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </div>
              {formData.role === 'STORE_MANAGER' && (
                <div className="form-group">
                  <label>Assigned Store</label>
                  <select
                    value={formData.storeId}
                    onChange={e => setFormData({ ...formData, storeId: e.target.value })}
                    required
                    disabled={submitting}
                  >
                    <option value="">Select a store…</option>
                    {stores.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.id}>{s.storeCode} — {s.storeName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: submitting ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ width: 'auto' }}
                    disabled={submitting}
                  />
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
        </div>
      )}
    </AdminLayout>
  );
}
