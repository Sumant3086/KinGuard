import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import logoImg from '../assets/img/logo 32px32px.png';

const IcoLock     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcoUpload   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IcoPulse    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IcoBarChart = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IcoRepeat   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
const IcoDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

const MANAGER_FEATURES = [
  { icon: <IcoUpload />,   n: '1', title: 'Review Assigned Items',           desc: 'Receive your assigned item list at the start of each inventory cycle.' },
  { icon: <IcoBarChart />, n: '2', title: 'Record Physical Counts',          desc: 'Enter the physically counted quantity for each assigned item.' },
  { icon: <IcoPulse />,   n: '3', title: 'Automatic Variance Calculation',  desc: 'Variances against system stock are calculated automatically.' },
  { icon: <IcoRepeat />,  n: '4', title: 'Identify Discrepancies',          desc: 'Review shortage and excess items before submitting your count.' },
  { icon: <IcoDownload />, n: '5', title: 'Download Reconciliation Report',  desc: 'Export your store\'s reconciliation data at any time.' },
  { icon: <IcoLock />,    n: '6', title: 'Store-Isolated Access',           desc: 'Access is limited to your store\'s inventory records only.' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home-page">

      {/* ── Sticky red navbar ── */}
      <header className="home-bar">
        <div className="home-bar-inner">
          <Link to="/" className="home-logo-wrap">
            <span className="home-logo-pill">
              <img src={logoImg} alt="KinMarché" className="home-logo-img" />
            </span>
            <span className="home-logo-text">
              <span className="home-logo-name">KinMarché</span>
              <span className="home-logo-sub">Loss &amp; Prevention</span>
            </span>
          </Link>
          <nav className="home-nav">
            {user ? (
              <Link
                to={user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard'}
                className="home-signin-btn"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <Link to="/login" state={{ from: '/' }} className="home-signin-btn">Sign In</Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="home-hero-bg">
        <div className="home-hero">
          <div className="home-eyebrow">
            Loss &amp; Prevention · Inventory Reconciliation
          </div>
          <h1>
            Inventory Reconciliation<br />
            <em>&amp; Loss Monitoring.</em>
          </h1>
          <p>
            Track store-level inventory variances, monitor submissions, and identify recurring discrepancies across your network.
          </p>
          {!user && (
            <Link to="/login" state={{ from: '/' }} className="home-cta-btn">
              Sign In →
            </Link>
          )}
        </div>
      </section>

      {/* ── Store Manager Workflow & Features ── */}
      <section className="home-dark-section home-features-section">
        <div className="home-section-header">
          <div className="home-section-eyebrow home-section-eyebrow-green">
            For Store Managers
          </div>
          <h2 className="home-section-heading home-section-heading-skyblue">How It Works</h2>
          <p style={{ color: '#ffffff', fontSize: '15px', marginTop: '12px', maxWidth: '580px', margin: '12px auto 0', textShadow: '0 2px 6px rgba(0,0,0,0.50), 0 4px 16px rgba(0,0,0,0.30)', fontWeight: 500 }}>
            A structured process from upload to reconciliation.
          </p>
        </div>
        <div className="home-features">
          {MANAGER_FEATURES.map((f) => (
            <div key={f.title} className="home-feat">
              <div className="home-feat-icon">{f.icon}</div>
              <div className="home-feat-title-row">
                <span className="home-feat-step-num">{f.n}</span>
                <h3>{f.title}</h3>
              </div>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-footer-inner">

          <div className="home-footer-brand">
            <span className="home-footer-logo-pill">
              <img src={logoImg} alt="KinMarché" className="home-footer-logo-img" />
            </span>
            <div className="home-footer-text">
              <span className="home-footer-name">KinMarché</span>
              <span className="home-footer-tagline">Loss &amp; Prevention</span>
            </div>
          </div>

          <div className="home-footer-center">
            <span className="home-footer-developer">
              Developed by Sumant Yadav
            </span>
          </div>

          <div className="home-footer-right">
            <span className="home-footer-copyright">
              &copy; {new Date().getFullYear()} KinMarché
            </span>
          </div>

        </div>
      </footer>

    </div>
  );
}
