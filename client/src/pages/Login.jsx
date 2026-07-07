import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [showPw, setShowPw]         = useState(false);
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(employeeId, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Employee ID or password is incorrect.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* ── Left decorative panel ── */}
        <div className="login-left">
          <div className="ll-brand">
            <div className="ll-logo">K</div>
            <span className="ll-name">KinMarché</span>
          </div>

          <div className="ll-body">
            <p className="ll-headline">
              Reconcile smarter.<br />
              <em>Protect every unit.</em>
            </p>
            <p className="ll-desc">
              Upload one master file for all your stores. KinMarché separates
              records automatically — every manager sees only their store.
            </p>
            <div className="ll-features">
              {[
                'One upload file for all store locations',
                'Automatic store separation by Store Code',
                'Backend Diff = Sold − SYS calculation',
                'Central admin monitoring and Excel export',
              ].map(f => (
                <div key={f} className="ll-feat">
                  <span className="ll-feat-dot" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <p className="ll-foot">KinMarché &copy; {new Date().getFullYear()} &mdash; Kinshasa, DRC</p>
        </div>

        {/* ── Right sign-in panel ── */}
        <div className="login-right">
          <h2>Sign In</h2>
          <p>Enter your credentials to continue.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Employee ID</label>
              <input
                type="text"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="e.g. ADMIN001"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={loading}
              style={{ width: '100%', marginTop: 8, padding: '12px 18px', fontSize: 14, justifyContent: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
