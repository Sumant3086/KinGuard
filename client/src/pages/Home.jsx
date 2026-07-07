import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home-page">
      {/* ── Topbar ── */}
      <div className="home-bar">
        <div className="home-logo-wrap">
          <div className="home-logo-icon">K</div>
          <span className="home-logo-name">KinMarché</span>
        </div>
        <nav>
          {user ? (
            <Link
              to={user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard'}
              className="btn btn-primary"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary">Sign In</Link>
          )}
        </nav>
      </div>

      {/* ── Hero ── */}
      <div className="home-hero">
        <div className="home-eyebrow">Loss &amp; Prevention Platform</div>
        <h1>
          Inventory Reconciliation<br />
          <em>for Every Store</em>
        </h1>
        <p>
          Upload one master file for all your stores. KinMarché automatically
          separates records by store code, lets each manager reconcile their stock
          securely, and gives your L&amp;P team a central view of every discrepancy.
        </p>
        {!user && (
          <Link
            to="/login"
            className="btn btn-primary"
            style={{ padding: '11px 28px', fontSize: 14 }}
          >
            Get Started
          </Link>
        )}
      </div>

      {/* ── Workflow ── */}
      <div className="home-workflow">
        <div className="home-step">
          <div className="home-step-num">1</div>
          <div className="home-step-body">
            <strong>Upload Master File</strong>
            <span>Single Excel for all stores</span>
          </div>
        </div>
        <div className="home-step-arrow">→</div>
        <div className="home-step">
          <div className="home-step-num">2</div>
          <div className="home-step-body">
            <strong>Store Separation</strong>
            <span>Auto-split by Store Code</span>
          </div>
        </div>
        <div className="home-step-arrow">→</div>
        <div className="home-step">
          <div className="home-step-num">3</div>
          <div className="home-step-body">
            <strong>Manager Reconciliation</strong>
            <span>Each store enters Sold quantities</span>
          </div>
        </div>
        <div className="home-step-arrow">→</div>
        <div className="home-step">
          <div className="home-step-num">4</div>
          <div className="home-step-body">
            <strong>Admin Insights</strong>
            <span>Central L&amp;P monitoring</span>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div className="home-features">
        {[
          { icon: '🔒', title: 'Store Isolation', desc: 'Each manager sees only their assigned store. No cross-store data leaks.' },
          { icon: '📤', title: 'One Upload', desc: 'Upload a single master Excel file. Records are separated by Store Code automatically.' },
          { icon: '⚡', title: 'Auto Reconciliation', desc: 'Diff = Sold − SYS is calculated server-side. Managers cannot manipulate figures.' },
          { icon: '📊', title: 'Risk Scorecard', desc: 'Admin dashboard ranks stores by shortage rate so you know where to focus first.' },
          { icon: '🔁', title: 'Repeat Tracking', desc: 'Automatically flags SKUs with shortages across consecutive cycles.' },
          { icon: '📥', title: 'Excel Export', desc: 'Download updated reconciliation reports filtered by store, date, or discrepancy type.' },
        ].map((f) => (
          <div key={f.title} className="home-feat">
            <div className="home-feat-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
