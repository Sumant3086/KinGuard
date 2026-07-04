import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function StoreLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div>
      <div className="navbar">
        <h1>KinGuard - {user?.store?.storeName}</h1>
        <nav>
          <Link to="/store/dashboard" style={{ fontWeight: isActive('/store/dashboard') ? 'bold' : 'normal' }}>
            Dashboard
          </Link>
          <Link to="/store/inventory" style={{ fontWeight: isActive('/store/inventory') ? 'bold' : 'normal' }}>
            Inventory
          </Link>
          <span style={{ color: 'white', marginLeft: '20px' }}>{user?.name}</span>
          <button onClick={logout}>Logout</button>
        </nav>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}
