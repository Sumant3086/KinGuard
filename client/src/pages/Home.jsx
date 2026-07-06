import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="home-page">
      <header className="home-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-icon">K</div>
          <span className="brand-text">KinMarché</span>
        </div>
        <nav>
          {user ? (
            <Link
              to={user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard'}
              className="btn btn-accent"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn btn-accent">
              Sign In
            </Link>
          )}
        </nav>
      </header>

      <div className="home-hero">
        <h1>
          Loss &amp; Prevention<br />
          <span>Made Simple</span>
        </h1>
        <p>
          Upload one master inventory file for all your stores. KinMarché automatically
          separates records by store code, lets each manager reconcile their stock securely,
          and gives your L&amp;P team a central view of every discrepancy.
        </p>
        {!user && (
          <Link to="/login" className="btn btn-accent" style={{ padding: '12px 32px', fontSize: 15 }}>
            Get Started
          </Link>
        )}
      </div>

      <div className="home-features">
        {[
          { icon: '🔒', title: 'Store Isolation', desc: 'Each manager sees only their assigned store. No cross-store data leaks.' },
          { icon: '📤', title: 'One Upload', desc: 'Upload a single master Excel file. The system separates records by Store Code automatically.' },
          { icon: '⚡', title: 'Auto Reconciliation', desc: 'Diff = Sold − SYS is calculated server-side. Managers cannot manipulate figures.' },
          { icon: '📊', title: 'Risk Scorecard', desc: 'Admin dashboard ranks stores by shortage rate so you know where to focus first.' },
          { icon: '🔁', title: 'Repeat Tracking', desc: 'Automatically flags SKUs with shortages across consecutive cycles.' },
          { icon: '📥', title: 'Excel Export', desc: 'Download updated reconciliation reports filtered by store, date, or discrepancy type.' },
        ].map((f) => (
          <div key={f.title} className="home-feature-card">
            <div className="home-feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
