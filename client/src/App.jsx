import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminStores from './pages/admin/Stores';
import AdminUsers from './pages/admin/Users';
import AdminUpload from './pages/admin/Upload';
import AdminInventory from './pages/admin/Inventory';
import AdminReports from './pages/admin/Reports';
import AdminAuditLogs from './pages/admin/AuditLogs';
import AdminAnalytics from './pages/admin/Analytics';
import AdminBatches from './pages/admin/Batches';
import StoreDashboard from './pages/store/Dashboard';
import StoreInventory from './pages/store/Inventory';
import NotFound from './pages/NotFound';

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <PrivateRoute role="ADMIN">
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/stores"
        element={
          <PrivateRoute role="ADMIN">
            <AdminStores />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <PrivateRoute role="ADMIN">
            <AdminUsers />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/upload"
        element={
          <PrivateRoute role="ADMIN">
            <AdminUpload />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/inventory"
        element={
          <PrivateRoute role="ADMIN">
            <AdminInventory />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <PrivateRoute role="ADMIN">
            <AdminReports />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <PrivateRoute role="ADMIN">
            <AdminAuditLogs />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <PrivateRoute role="ADMIN">
            <AdminAnalytics />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/batches"
        element={
          <PrivateRoute role="ADMIN">
            <AdminBatches />
          </PrivateRoute>
        }
      />

      {/* Store Manager Routes */}
      <Route
        path="/store/dashboard"
        element={
          <PrivateRoute role="STORE_MANAGER">
            <StoreDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/store/inventory"
        element={
          <PrivateRoute role="STORE_MANAGER">
            <StoreInventory />
          </PrivateRoute>
        }
      />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
