import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      <div className="navbar">
        <h1>KinGuard</h1>
        <nav>
          {user ? (
            <>
              {user.role === 'ADMIN' && <Link to="/admin/dashboard">Dashboard</Link>}
              {user.role === 'STORE_MANAGER' && <Link to="/store/dashboard">Dashboard</Link>}
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </nav>
      </div>

      <div className="container">
        <div className="hero">
          <h2>KinGuard</h2>
          <p>
            Loss & Prevention inventory reconciliation system for retail operations.
            Track inventory discrepancies, manage stock checks, and maintain accurate records across all stores.
          </p>
          {!user && (
            <Link to="/login" className="btn btn-primary">
              Get Started
            </Link>
          )}
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h4>Secure</h4>
            <p>Role-based access control ensures data security</p>
          </div>
          <div className="stat-card">
            <h4>Efficient</h4>
            <p>Upload master files and distribute to stores instantly</p>
          </div>
          <div className="stat-card">
            <h4>Accurate</h4>
            <p>Automated difference calculations prevent errors</p>
          </div>
        </div>
      </div>
    </div>
  );
}
