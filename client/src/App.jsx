import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';

// Eagerly loaded — needed on first paint for every user
import Home           from './pages/Home';
import NotFound       from './pages/NotFound';
import LoginPage      from './features/auth/LoginPage';
import ChangePassword from './features/auth/ChangePasswordPage';

// Lazy-loaded by feature — each chunk only downloads when needed
const AdminDashboard = lazy(() => import('./features/admin/pages/Dashboard'));
const AdminStores    = lazy(() => import('./features/admin/pages/Stores'));
const AdminUsers     = lazy(() => import('./features/admin/pages/Users'));
const AdminUpload    = lazy(() => import('./features/admin/pages/Upload'));
const AdminInventory = lazy(() => import('./features/admin/pages/Inventory'));
const AdminAuditLogs = lazy(() => import('./features/admin/pages/AuditLogs'));
const AdminAnalytics = lazy(() => import('./features/admin/pages/Analytics'));
const AdminBatches   = lazy(() => import('./features/admin/pages/Batches'));
const AdminReports   = lazy(() => import('./features/admin/pages/Reports'));
const StoreDashboard = lazy(() => import('./features/store/pages/Dashboard'));
const StoreInventory = lazy(() => import('./features/store/pages/Inventory'));

const pageLoaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' };

function PageLoader() {
  return (
    <div style={pageLoaderStyle}>
      <div className="loading-spinner" />
    </div>
  );
}

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // While the session validation is in flight, render the page loader
  if (loading) return <PageLoader />;
  // Save the intended URL so LoginPage can redirect back after a successful login
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  // Force password change before allowing access to any protected page
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  // Wrong role — send to the user's own dashboard, not home
  if (role && user.role !== role) {
    const dash = user.role === 'ADMIN' ? '/admin/dashboard' : '/store/dashboard';
    return <Navigate to={dash} replace />;
  }
  return children;
}

function App() {
  return (
    <>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="live-region"
      />

      <main id="main-content">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                element={<Home />} />
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/change-password" element={<PrivateRoute><ChangePassword /></PrivateRoute>} />

            {/* Admin Routes */}
            <Route path="/admin/dashboard"  element={<PrivateRoute role="ADMIN"><AdminDashboard /></PrivateRoute>} />
            <Route path="/admin/stores"     element={<PrivateRoute role="ADMIN"><AdminStores /></PrivateRoute>} />
            <Route path="/admin/users"      element={<PrivateRoute role="ADMIN"><AdminUsers /></PrivateRoute>} />
            <Route path="/admin/upload"     element={<PrivateRoute role="ADMIN"><AdminUpload /></PrivateRoute>} />
            <Route path="/admin/inventory"  element={<PrivateRoute role="ADMIN"><AdminInventory /></PrivateRoute>} />
            <Route path="/admin/reports"    element={<PrivateRoute role="ADMIN"><AdminReports /></PrivateRoute>} />
            <Route path="/admin/audit-logs" element={<PrivateRoute role="ADMIN"><AdminAuditLogs /></PrivateRoute>} />
            <Route path="/admin/analytics"  element={<PrivateRoute role="ADMIN"><AdminAnalytics /></PrivateRoute>} />
            <Route path="/admin/batches"    element={<PrivateRoute role="ADMIN"><AdminBatches /></PrivateRoute>} />

            {/* Store Manager Routes */}
            <Route path="/store/dashboard" element={<PrivateRoute role="STORE_MANAGER"><StoreDashboard /></PrivateRoute>} />
            <Route path="/store/inventory" element={<PrivateRoute role="STORE_MANAGER"><StoreInventory /></PrivateRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

export default App;
