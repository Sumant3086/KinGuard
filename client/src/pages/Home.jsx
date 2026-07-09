import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home-page">
      {/* ── Sticky nav ── */}
      <div className="home-bar">
        <div style={{ maxWidth: 1280, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="home-logo-wrap">
            <div className="home-logo-icon">K</div>
            <div>
              <div className="home-logo-name">KinMarché</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', color: 'var(--t4)', marginTop: 1 }}>Loss &amp; Prevention</div>
            </div>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user ? (
              <Link
                to={user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard'}
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontSize: 13 }}
              >
                Go to Dashboard →
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </div>

      {/* ── Hero with retail background image ── */}
      <div className="home-hero-bg">
        <div className="home-hero" style={{ textAlign: 'center', margin: '0 auto' }}>
          <div className="home-eyebrow">Retail Inventory Reconciliation</div>
          <h1>
            Catch shrinkage early.<br />
            <em>Across every store.</em>
          </h1>
          <p>
            Upload one master Excel file for your entire network. KinMarché separates
            records by Store Code automatically — every manager sees only their store,
            every discrepancy is calculated server-side, and your L&amp;P team gets
            instant risk visibility.
          </p>
          {!user && (
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ padding: '12px 32px', fontSize: 15, display: 'inline-flex' }}
            >
              Get Started →
            </Link>
          )}
        </div>
      </div>

      {/* ── Workflow ── */}
      <div className="home-workflow">
        {[
          { n: '1', title: 'Upload Master File',    sub: 'Single Excel for all stores' },
          { n: '2', title: 'Auto Store Split',      sub: 'Records separated by Store Code' },
          { n: '3', title: 'Manager Reconciliation',sub: 'Each store enters Sold quantities' },
          { n: '4', title: 'L&P Insights',          sub: 'Central risk monitoring & export' },
        ].map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <div className="home-step">
              <div className="home-step-num">{s.n}</div>
              <div className="home-step-body">
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </div>
            </div>
            {i < 3 && <div className="home-step-arrow">→</div>}
          </div>
        ))}
      </div>

      {/* ── Feature cards ── */}
      <div className="home-features">
        {[
          { icon: '🔒', title: 'Store Isolation',     desc: 'Each manager sees only their assigned store. Enforced at the server level — not just the UI.' },
          { icon: '📤', title: 'Single Upload',        desc: 'One master Excel file for the whole network. Records separate by Store Code automatically.' },
          { icon: '⚡', title: 'Server-Side Diff',    desc: 'Diff = Sold − SYS is calculated and stored server-side. Managers cannot manipulate figures.' },
          { icon: '📊', title: 'Risk Scorecard',       desc: 'Every store ranked High Risk / Watch / On Track by shortage rate. Worst performers surface first.' },
          { icon: '🔁', title: 'Repeat Hotspots',     desc: 'Automatically flags (store, item) pairs with shortages across two or more consecutive cycles.' },
          { icon: '📥', title: 'Excel Export',         desc: 'Download full reconciliation reports filtered by store, cycle, status, or discrepancy type.' },
        ].map((f) => (
          <div key={f.title} className="home-feat">
            <div className="home-feat-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid rgba(0,0,0,0.08)',
        padding: '24px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1280, margin: '0 auto', color: '#334155', fontSize: 12,
      }}>
        <span>KinMarché &copy; {new Date().getFullYear()} — Kinshasa, DRC</span>
        <span>Loss &amp; Prevention Inventory Reconciliation Platform</span>
      </div>
    </div>
  );
}
