import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/img/logo 32px32px.png';

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
              <Link to="/login" className="home-signin-btn">
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero — supermarket image, clearly visible ── */}
      <section className="home-hero-bg">
        <div className="home-hero">
          <div className="home-eyebrow">Retail Inventory Reconciliation</div>
          <h1>
            Catch shrinkage early.<br />
            <em>Across every plant.</em>
          </h1>
          <p>
            Upload one master Excel file for your entire network. KinMarché separates
            records by Plant Code automatically — every manager sees only their plant,
            every discrepancy is calculated server-side, and your L&amp;P team gets
            instant risk visibility.
          </p>
          {!user && (
            <Link to="/login" className="home-cta-btn">
              Get Started →
            </Link>
          )}
        </div>
      </section>

      {/* ── Workflow steps ── */}
      <section className="home-workflow-section">
        <div className="home-workflow">
          {[
            { n: '1', title: 'Upload Master File',     sub: 'Single Excel for all plants'            },
            { n: '2', title: 'Auto Plant Split',       sub: 'Records separated by Plant Code'        },
            { n: '3', title: 'Manager Reconciliation', sub: 'Each plant enters physical quantities'   },
            { n: '4', title: 'L&P Insights',           sub: 'Central risk monitoring & export'       },
          ].map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center' }}>
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
      </section>

      {/* ── Feature cards — dark background section ── */}
      <section className="home-features-section">
        <div className="home-features-header">
          <h2>Everything your L&amp;P team needs</h2>
          <p>Built for multi-plant retail. Every feature addresses a real shrinkage control gap.</p>
        </div>
        <div className="home-features">
          {[
            { icon: '🔒', title: 'Plant Isolation',    desc: 'Each manager sees only their assigned plant. Enforced at the server level — not just the UI.' },
            { icon: '📤', title: 'Single Upload',       desc: 'One master Excel file for the whole network. Records separate by Plant Code automatically.' },
            { icon: '⚡', title: 'Server-Side Diff',   desc: 'Diff = Sold − SYS is calculated and stored server-side. Managers cannot manipulate figures.' },
            { icon: '📊', title: 'Risk Scorecard',      desc: 'Every plant ranked High Risk / Watch / On Track by shortage rate. Worst performers surface first.' },
            { icon: '🔁', title: 'Repeat Hotspots',    desc: 'Automatically flags (plant, item) pairs with shortages across two or more consecutive cycles.' },
            { icon: '📥', title: 'Excel Export',        desc: 'Download full reconciliation reports filtered by plant, cycle, status, or discrepancy type.' },
          ].map((f) => (
            <div key={f.title} className="home-feat">
              <div className="home-feat-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-footer-inner">

          {/* Brand column */}
          <div className="home-footer-brand">
            <div className="home-footer-logo-wrap">
              <span className="home-footer-logo-pill">
                <img src={logoImg} alt="KinMarché" className="home-footer-logo-img" />
              </span>
              <span className="home-footer-logo-name">KinMarché</span>
            </div>
            <p className="home-footer-desc">
              Loss &amp; Prevention Inventory Reconciliation Platform for multi-plant retail networks.
            </p>
            <p className="home-footer-location">📍 Kinshasa, DRC</p>
          </div>

          {/* Platform column */}
          <div className="home-footer-col">
            <h4>Platform</h4>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/login">Sign In</Link></li>
            </ul>
          </div>

          {/* Capabilities column */}
          <div className="home-footer-col">
            <h4>Capabilities</h4>
            <ul>
              <li>Plant Isolation</li>
              <li>Bulk Excel Upload</li>
              <li>Risk Scorecard</li>
              <li>Repeat Hotspot Detection</li>
            </ul>
          </div>

        </div>

        <div className="home-footer-divider" />

        <div className="home-footer-bottom">
          <span>&copy; {new Date().getFullYear()} KinMarché. All rights reserved.</span>
          <span>Loss &amp; Prevention Inventory Reconciliation Platform</span>
        </div>
      </footer>

    </div>
  );
}
