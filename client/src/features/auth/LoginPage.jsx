import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import logoImg from '../../assets/img/logo 32px32px.png';

const IconAdmin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);
const IconAM = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
    <path d="M12 7v4m0 0-5.5 6M12 11l5.5 6"/>
  </svg>
);
const IconStore = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export default function LoginPage() {
  const [employeeId, setEmployeeId]   = useState('');
  const [password, setPassword]       = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [showPw, setShowPw]           = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The protected URL the user was trying to reach before being bounced here.
  // We only use it if it's an actual protected path — a `from` of '/' means
  // they clicked "Sign In" from the home page and should go to their dashboard.
  const from = location.state?.from;
  const protectedFrom = from && (from.startsWith('/admin') || from.startsWith('/store') || from.startsWith('/am'))
    ? from : null;

  // Redirect already-authenticated users — but only after the session check
  // finishes (loading=false). Without this guard, a stale localStorage user
  // fires the redirect before getCurrentUser() can invalidate it.
  useEffect(() => {
    if (!authLoading && user) {
      const defaultDash = user.role === 'ADMIN' ? '/admin/dashboard'
                        : user.role === 'AREA_MANAGER' ? '/am/dashboard'
                        : '/store/dashboard';
      navigate(protectedFrom || defaultDash, { replace: true });
    }
  }, [user, authLoading, navigate, protectedFrom]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setReconnecting(false);
    setLoading(true);
    try {
      await attemptLogin();
    } finally {
      setLoading(false);
      setReconnecting(false);
    }
  }

  // Retry delays for transient server errors (ECONNRESET, ECONNREFUSED, 503, 500).
  // node --watch typically takes 3-5 s to restart + reconnect Supabase.
  // We keep retrying silently — button shows "Reconnecting…" so the user
  // knows something is happening and doesn't need to click again.
  const RETRY_DELAYS = [600, 1200, 2000, 2500, 3000, 3000];

  async function attemptLogin(attempt = 0) {
    try {
      await login(employeeId, password, from);
      // AuthContext handles redirect on success
    } catch (err) {
      const status = err.response?.status;

      // Real credential / access errors — show immediately, never retry
      if (status === 401) { setError('Employee ID or password is incorrect.'); return; }
      if (status === 403) { setError(err.response.data?.error || 'Access denied. Contact your administrator.'); return; }

      // Transient: network down, server restarting, or cold-start 503/500
      if (attempt < RETRY_DELAYS.length) {
        setReconnecting(true); // switch button to "Reconnecting…"
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        return attemptLogin(attempt + 1);
      }

      // All retries exhausted — show a clear message
      if (!err.response) {
        setError('Cannot reach the server. Please check your connection and try again.');
      } else {
        setError('Server is taking too long to respond. Please try again in a moment.');
      }
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-right">
          {/* Left Panel - Branding */}
          <div className="lr-left-panel">
            <div className="lr-header">
              <div className="lr-logo-wrap">
                <img src={logoImg} alt="KinMarché" className="lr-logo-img" />
              </div>
              <span style={{ display: 'block', fontSize: 20, fontWeight: 900, color: '#ffffff', letterSpacing: '0.6px', marginTop: 8, marginBottom: 6, textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
                KinMarché
              </span>
              <h2>Sign In</h2>
              <p>Access your KinMarché account</p>
            </div>

            <div className="lr-divider"><span>User Roles</span></div>

            <div className="lr-roles-inline">
              <div className="lr-role lr-role-admin">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconAdmin />
                  <span className="lr-role-desc">Admin</span>
                </span>
              </div>
              <div className="lr-role lr-role-am">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconAM />
                  <span className="lr-role-desc">Area Manager</span>
                </span>
              </div>
              <div className="lr-role lr-role-store">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconStore />
                  <span className="lr-role-desc">Store Manager</span>
                </span>
              </div>
            </div>

            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <Link
                to="/"
                replace
                style={{ 
                  fontSize: 13, 
                  color: 'rgba(255,255,255,0.75)', 
                  textDecoration: 'none', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 6, 
                  transition: 'color 0.15s', 
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.25)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.20)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                }}
              >
                ← Back to Home
              </Link>
            </div>
          </div>

          {/* Right Panel - Form */}
          <div className="lr-right-panel">
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
                  placeholder="Employee ID"
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
                      style={{ animation: 'spin .8s linear infinite', flexShrink: 0 }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    {reconnecting ? 'Reconnecting…' : 'Signing in…'}
                  </>
                ) : (
                  <>Sign In →</>
                )}
              </button>
            </form>

            {/* Developer Credit */}
            <div className="lr-developer-credit">
              Developed by Sumant Yadav
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
