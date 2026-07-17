import { useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { updateProfile } from '../shared/api/authApi';
import { useToast } from '../shared/context/ToastContext';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [name,  setName]  = useState(user?.name  || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() || undefined, email: email.trim() || null, phone: phone.trim() || null });
      await refreshUser();
      toast.success('Profile updated.');
    } catch (err) {
      const msg = err?.response?.data?.error;
      setError(msg || 'Could not update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = user?.role === 'ADMIN' ? 'Administrator'
                  : user?.role === 'AREA_MANAGER' ? 'Area Manager'
                  : 'Store Manager';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: 'var(--tx1)', marginBottom: 4 }}>My Profile</h2>
        <p style={{ fontSize: 13, color: 'var(--tx3)', marginBottom: 28 }}>
          {user?.employeeId} · {roleLabel}{user?.store ? ` · ${user.store.storeName}` : ''}
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label htmlFor="prof-name">Full Name</label>
            <input
              id="prof-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={saving}
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="prof-email">Email Address <span style={{ fontWeight: 400, color: 'var(--tx3)' }}>(optional)</span></label>
            <input
              id="prof-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={saving}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <small style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, display: 'block' }}>
              Used for deadline reminders and submission notifications.
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="prof-phone">Phone <span style={{ fontWeight: 400, color: 'var(--tx3)' }}>(optional)</span></label>
            <input
              id="prof-phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={saving}
              placeholder="+243 …"
              autoComplete="tel"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
