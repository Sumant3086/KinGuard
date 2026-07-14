import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { changePassword } from '../../shared/api/authApi';

export default function ChangePasswordPage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);

  // Redirect unauthenticated visitors once the session check completes
  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPw !== confirmPw)           { setError('New passwords do not match'); return; }
    if (newPw === currentPw)           { setError('New password must differ from the current password'); return; }
    if (newPw.length < 8)             { setError('Password must be at least 8 characters'); return; }
    if (newPw.length > 128)           { setError('Password must be 128 characters or fewer'); return; }
    if (!/[A-Z]/.test(newPw))        { setError('Password must include at least one uppercase letter'); return; }
    if (!/[a-z]/.test(newPw))        { setError('Password must include at least one lowercase letter'); return; }
    if (!/[0-9]/.test(newPw))        { setError('Password must include at least one number'); return; }
    setSaving(true);
    try {
      await changePassword(currentPw, newPw);
      // Refresh user profile so mustChangePassword becomes false in React state.
      // Without this, PrivateRoute still sees mustChangePassword:true and
      // redirects back to this page immediately after navigating to the dashboard.
      const updated = await refreshUser();
      const role = updated?.role ?? user.role;
      navigate(role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: 'var(--t1)', marginBottom: 6 }}>Set a new password</h2>
          <p style={{ fontSize: 13, color: 'var(--t3)' }}>
            Your account requires a password change before you can continue.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="cp-current">Current password</label>
            <input id="cp-current" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required disabled={saving} autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label htmlFor="cp-new">New password</label>
            <input id="cp-new" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required disabled={saving} autoComplete="new-password" />
            <small style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, display: 'block' }}>
              Min 8 characters — must include uppercase, lowercase, and a number.
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="cp-confirm">Confirm new password</label>
            <input id="cp-confirm" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required disabled={saving} autoComplete="new-password" />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
              {saving ? 'Saving…' : 'Change Password'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={logout} disabled={saving}>
              Sign out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
