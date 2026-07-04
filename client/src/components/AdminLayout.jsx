import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div>
      <div className="navbar">
        <h1>KinGuard Admin</h1>
        <nav>
          <Link to="/admin/dashboard" style={{ fontWeight: isActive('/admin/dashboard') ? 'bold' : 'normal' }}>
            Dashboard
          </Link>
          <Link to="/admin/stores" style={{ fontWeight: isActive('/admin/stores') ? 'bold' : 'normal' }}>
            Stores
          </Link>
          <Link to="/admin/users" style={{ fontWeight: isActive('/admin/users') ? 'bold' : 'normal' }}>
            Users
          </Link>
          <Link to="/admin/upload" style={{ fontWeight: isActive('/admin/upload') ? 'bold' : 'normal' }}>
            Upload
          </Link>
          <Link to="/admin/inventory" style={{ fontWeight: isActive('/admin/inventory') ? 'bold' : 'normal' }}>
            Inventory
          </Link>
          <Link to="/admin/reports" style={{ fontWeight: isActive('/admin/reports') ? 'bold' : 'normal' }}>
            Reports
          </Link>
          <span style={{ color: 'white', marginLeft: '20px' }}>{user?.name}</span>
          <button onClick={logout}>Logout</button>
        </nav>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}
