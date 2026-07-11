import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import logoImg from '../../assets/img/logo 32px32px.png';

export default function LoginPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [showPw, setShowPw]         = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The protected URL the user was trying to reach before being bounced here.
  // We only use it if it's an actual protected path — a `from` of '/' means
  // they clicked "Sign In" from the home page and should go to their dashboard.
  const from = location.state?.from;
  const protectedFrom = from && (from.startsWith('/admin') || from.startsWith('/store'))
    ? from : null;

  // Redirect already-authenticated users — but only after the session check
  // finishes (loading=false). Without this guard, a stale localStorage user
  // fires the redirect before getCurrentUser() can invalidate it.
  useEffect(() => {
    if (!authLoading && user) {
      const defaultDash = user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard';
      navigate(protectedFrom || defaultDash, { replace: true });
    }
  }, [user, authLoading, navigate, protectedFrom]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Pass the saved destination so AuthContext redirects there after login
      await login(employeeId, password, from);
    } catch (err) {
      if (!err.response) {
        setError('Unable to connect to the server. Check your network and try again.');
      } else if (err.response.status === 401) {
        setError('Employee ID or password is incorrect.');
      } else if (err.response.status === 403) {
        setError(err.response.data?.error || 'Access denied.');
      } else if (err.response.status === 503) {
        setError('The service is starting. Please wait a moment and try again.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-right">
          <div className="lr-header">
            <div className="lr-logo-wrap">
              <img src={logoImg} alt="KinMarché" className="lr-logo-img" />
            </div>
            <h2>Sign In</h2>
            <p>Access your KinMarché account</p>
          </div>

          {error && (
            <div className="lr-error">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" className="lr-form">
            <div className="lr-field">
              <label className="lr-label" htmlFor="login-employee-id">Employee ID</label>
              <input
                id="login-employee-id"
                className="lr-input"
                type="text"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="e.g. ADMIN001"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="lr-field">
              <label className="lr-label" htmlFor="login-password">Password</label>
              <div className="lr-pw-wrap">
                <input
                  id="login-password"
                  className="lr-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lr-pw-eye"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="lr-btn" disabled={loading}>
              {loading ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ animation: 'spin .8s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Signing in…
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          <div className="lr-divider"><span>User Roles</span></div>

          <div className="lr-roles-inline">
            <span className="lr-role-badge admin">Admin</span>
            <span className="lr-separator">|</span>
            <span className="lr-role-badge mgr">Store Manager</span>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link
              to="/"
              replace
              style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.90)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
