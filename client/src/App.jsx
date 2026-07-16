import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext';
import TopProgress from './shared/components/ui/TopProgress';
import ErrorBoundary from './shared/components/ui/ErrorBoundary';
import { progressStart, progressDone } from './shared/api/progress';

// Lazy-loaded — these are only needed per-role, not on every first paint
const Home           = lazy(() => import('./pages/Home'));
const NotFound       = lazy(() => import('./pages/NotFound'));
const LoginPage      = lazy(() => import('./features/auth/LoginPage'));
const ChangePassword = lazy(() => import('./features/auth/ChangePasswordPage'));

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
const StoreDashboard   = lazy(() => import('./features/store/pages/Dashboard'));
const StoreInventory   = lazy(() => import('./features/store/pages/Inventory'));
const AMDashboard      = lazy(() => import('./features/areaManager/pages/AMDashboard'));
const AMReviewList     = lazy(() => import('./features/areaManager/pages/AMReviewList'));
const AMReview         = lazy(() => import('./features/areaManager/pages/AMReview'));

function PageLoader() {
  useEffect(() => {
    progressStart();
    return () => progressDone();
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '84px 32px 48px' }} aria-busy="true" aria-label="Loading page">
      <div className="skeleton skeleton-text" style={{ width: '28%', height: 30, marginBottom: 10 }} />
      <div className="skeleton skeleton-text" style={{ width: '44%', height: 14, marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" style={{ height: 92, marginBottom: 0 }} />
        ))}
      </div>
      <div className="skeleton skeleton-card" style={{ height: 320, marginBottom: 0 }} />
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
  // Force password change before allowing access to any protected page.
  // Exclude /change-password itself to prevent an infinite redirect loop when
  // PrivateRoute wraps the change-password route and mustChangePassword is true.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  // Wrong role — send to the user's own dashboard, not home
  if (role && user.role !== role) {
    const dash = user.role === 'ADMIN' ? '/admin/dashboard'
               : user.role === 'AREA_MANAGER' ? '/am/dashboard'
               : '/store/dashboard';
    return <Navigate to={dash} replace />;
  }
  return children;
}

function App() {
  return (
    <>
      <TopProgress />

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
            <Route path="/change-password" element={<PrivateRoute><ErrorBoundary><ChangePassword /></ErrorBoundary></PrivateRoute>} />

            {/* Admin Routes — each page has its own boundary */}
            <Route path="/admin/dashboard"  element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminDashboard /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/stores"     element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminStores /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/users"      element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminUsers /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/upload"     element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminUpload /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/inventory"  element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminInventory /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/reports"    element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminReports /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/audit-logs" element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminAuditLogs /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/analytics"  element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminAnalytics /></ErrorBoundary></PrivateRoute>} />
            <Route path="/admin/batches"    element={<PrivateRoute role="ADMIN"><ErrorBoundary><AdminBatches /></ErrorBoundary></PrivateRoute>} />

            {/* Store Manager Routes */}
            <Route path="/store/dashboard" element={<PrivateRoute role="STORE_MANAGER"><ErrorBoundary><StoreDashboard /></ErrorBoundary></PrivateRoute>} />
            <Route path="/store/inventory" element={<PrivateRoute role="STORE_MANAGER"><ErrorBoundary><StoreInventory /></ErrorBoundary></PrivateRoute>} />

            {/* Area Manager Routes */}
            <Route path="/am/dashboard"       element={<PrivateRoute role="AREA_MANAGER"><ErrorBoundary><AMDashboard /></ErrorBoundary></PrivateRoute>} />
            <Route path="/am/review"          element={<PrivateRoute role="AREA_MANAGER"><ErrorBoundary><AMReviewList /></ErrorBoundary></PrivateRoute>} />
            <Route path="/am/review/:batchId" element={<PrivateRoute role="AREA_MANAGER"><ErrorBoundary><AMReview /></ErrorBoundary></PrivateRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

export default App;
