import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logoImg   from '../assets/img/logo 32px32px.png';
import bgStore   from '../assets/img/home creen.jpg';

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

        {/* ── Left — brand + supermarket background ── */}
        <div
          className="login-left"
          style={{
            backgroundImage: `linear-gradient(160deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.40) 100%), url(${bgStore})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="ll-brand">
            <img src={logoImg} alt="KinMarché" className="ll-logo-img" />
            <span className="ll-name">KinMarché</span>
          </div>

          <div className="ll-body">
            <div className="ll-eyebrow">Loss &amp; Prevention Platform</div>
            <p className="ll-headline">
              One file upload.<br />
              <em>Complete network visibility.</em>
            </p>
            <p className="ll-desc" style={{ marginBottom: 0 }}>
              Track shrinkage across every plant in real time. KinMarché splits one
              master file by Plant Code, lets each manager reconcile their stock, and
              gives your L&amp;P team a central risk view of the entire network.
            </p>

            <div className="ll-metrics">
              <div className="ll-metric">
                <span className="ll-metric-val">Real-time</span>
                <span className="ll-metric-label">Diff calculation</span>
              </div>
              <div className="ll-metric">
                <span className="ll-metric-val">Multi-store</span>
                <span className="ll-metric-label">One upload</span>
              </div>
              <div className="ll-metric">
                <span className="ll-metric-val">Excel</span>
                <span className="ll-metric-label">One-click export</span>
              </div>
            </div>

            <div className="ll-features">
              {[
                'One master file auto-split by Plant Code',
                'Diff = Physical Stock − System Stock, enforced server-side',
                'Risk scorecard: High Risk · Watch · On Track',
                'Repeat loss hotspot detection across cycles',
                'Per-plant deadline control with extensions',
              ].map(f => (
                <div key={f} className="ll-feat">
                  <span className="ll-feat-dot" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <p className="ll-foot">
            KinMarché &copy; {new Date().getFullYear()} &mdash; Kinshasa, DRC &mdash; Inventory Reconciliation
          </p>
        </div>

        {/* ── Right — sign-in form ── */}
        <div className="login-right">
          <div className="lr-header">
            <img src={logoImg} alt="KinMarché" className="lr-logo-img" />
            <div className="lr-header-text">
              <h2>Sign In</h2>
              <p>Enter your credentials to continue.</p>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-group">
              <label>Employee ID</label>
              <input
                type="text"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                placeholder="Enter your employee ID"
                required
                autoFocus
                autoComplete="username"
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
                  autoComplete="current-password"
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
              style={{ width: '100%', marginTop: 10, padding: '12px 18px', fontSize: 14, justifyContent: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div className="lr-sep" />
          <div className="lr-roles">
            <div className="lr-role">
              <span className="lr-role-badge admin">Admin</span>
              <span>Full dashboard, uploads, all plants &amp; reports</span>
            </div>
            <div className="lr-role">
              <span className="lr-role-badge mgr">Manager</span>
              <span>Your assigned plant only</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
