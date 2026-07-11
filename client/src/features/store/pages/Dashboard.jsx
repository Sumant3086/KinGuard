import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StoreLayout from '../layout/StoreLayout';
import * as storeApi from '../../../shared/api/storeApi';
import * as cache from '../../../shared/api/cache';

const IcoBannerInfo  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const IcoBannerLock  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcoBannerClock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoCheck       = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>;

const CACHE_KEY = 'store:dashboard';
const CACHE_TTL = 30_000;

export default function StoreDashboard() {
  const [dashboard, setDashboard] = useState(() => cache.get(CACHE_KEY) ?? null);
  const [loading, setLoading]     = useState(!cache.get(CACHE_KEY));
  const [error, setError]         = useState('');

  useEffect(() => {
    if (cache.get(CACHE_KEY)) return;
    let live = true;
    storeApi.getDashboard()
      .then(data => { if (live) { cache.set(CACHE_KEY, data, CACHE_TTL); setDashboard(data); } })
      .catch(err  => { if (live) setError(err.response?.data?.error || 'Failed to load dashboard'); })
      .finally(()  => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  if (loading) {
    return (
      <StoreLayout>
        <div className="card" style={{ padding: '40px 20px' }}>
          <div className="skeleton skeleton-text" style={{ width: '40%', height: 32, marginBottom: 24 }} />
          <div className="skeleton skeleton-card" style={{ height: 140, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div className="skeleton skeleton-card" style={{ height: 100 }} />
            <div className="skeleton skeleton-card" style={{ height: 100 }} />
            <div className="skeleton skeleton-card" style={{ height: 100 }} />
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (error) {
    return (
      <StoreLayout>
        <div className="empty-state">
          <div className="empty-state-illustration error">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 className="empty-state-title">Failed to Load Dashboard</h3>
          <p className="empty-state-description">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary empty-state-cta">
            Retry
          </button>
        </div>
      </StoreLayout>
    );
  }

  if (!dashboard?.batch) {
    return (
      <StoreLayout>
        <div className="empty-state">
          <div className="empty-state-illustration">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="8" width="18" height="4" rx="1"/>
              <rect x="3" y="16" width="18" height="2" rx="1"/>
              <line x1="7" y1="6" x2="7" y2="3"/>
              <line x1="17" y1="6" x2="17" y2="3"/>
            </svg>
          </div>
          <h3 className="empty-state-title">No Active Inventory Cycle</h3>
          <p className="empty-state-description">
            No inventory cycle is currently active for your store. You will be notified when a cycle is uploaded.
          </p>
          <div className="empty-state-help">
            Contact your administrator if you believe this is an error.
          </div>
        </div>
      </StoreLayout>
    );
  }

  const { store, batch, stats, olderPendingBatches = [] } = dashboard;
  const completionPct = stats.totalItems > 0
    ? Math.round((stats.submittedItems / stats.totalItems) * 100)
    : 0;

  const now = new Date();
  const deadline = batch.submissionDeadline ? new Date(batch.submissionDeadline) : null;
  const isPastDue    = deadline && now > deadline;
  const isApproaching = deadline && !isPastDue && (deadline - now) < 48 * 3600 * 1000;

  const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <StoreLayout>
      <div className="page-header">
        <div>
          <h2>Inventory Count Dashboard</h2>
          <p>{store?.storeName} &mdash; {fmt(batch.inventoryDate)}</p>
        </div>
        {stats.pendingItems > 0 && (
          <Link to="/store/inventory" className="btn btn-primary">
            Begin Count →
          </Link>
        )}
      </div>

      {/* Alert: older pending batches (e.g. admin uploaded a past-date cycle) */}
      {olderPendingBatches.length > 0 && (
        <div className="deadline-banner" style={{ background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.22)', color: '#1d4ed8' }}>
          <span className="deadline-banner-icon"><IcoBannerInfo /></span>
          <div>
            <p>
              <strong>{olderPendingBatches.length} earlier inventory cycle{olderPendingBatches.length > 1 ? 's' : ''} {olderPendingBatches.length > 1 ? 'are' : 'is'} pending submission:</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {olderPendingBatches.map(b => (
                <Link
                  key={b.id}
                  to={`/store/inventory?batchId=${b.id}`}
                  style={{ padding: '2px 9px', borderRadius: 99, background: 'rgba(59,130,246,0.12)', color: '#1d4ed8', fontSize: 11, fontWeight: 700, border: '1px solid rgba(59,130,246,0.22)' }}
                >
                  {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Deadline banners */}
      {isPastDue && (
        <div className="deadline-banner overdue">
          <span className="deadline-banner-icon"><IcoBannerLock /></span>
          <p><strong>Count Cycle Locked.</strong> The submission deadline has passed. Contact your administrator to request an extension.</p>
        </div>
      )}
      {isApproaching && !isPastDue && (
        <div className="deadline-banner">
          <span className="deadline-banner-icon"><IcoBannerClock /></span>
          <p>Submission deadline approaching. Complete your count by: <strong>{deadline.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></p>
        </div>
      )}

      {/* Current cycle summary card */}
      <div className="card">
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Store</span>
            <span>{store?.storeName}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Inventory Date</span>
            <span>{fmt(batch.inventoryDate)}</span>
          </div>
          {deadline && (
            <div className="info-item">
              <span className="info-label">Submission Deadline</span>
              <span style={{ color: isPastDue ? 'var(--red)' : 'inherit' }}>
                {deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {isPastDue && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>LOCKED</span>}
              </span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Progress</span>
            <span>
              {completionPct}% complete
              {completionPct === 100 && <span style={{ color: 'var(--green)', marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}><IcoCheck /></span>}
            </span>
          </div>
        </div>

        {stats.totalItems > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="shortage-bar-track" style={{ height: 10, maxWidth: '100%' }}>
              <div
                className="shortage-bar-fill"
                style={{
                  width: `${completionPct}%`,
                  background: completionPct === 100 ? 'var(--green)' : 'var(--vi)',
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
              {stats.submittedItems} of {stats.totalItems} items counted
            </p>
          </div>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="stats-grid">
        <div className="stat-card info">
          <h4>Total Items</h4>
          <div className="value">{stats.totalItems}</div>
          <p>assigned to this store</p>
        </div>
        <div className="stat-card warning">
          <h4>Pending Count</h4>
          <div className="value">{stats.pendingItems}</div>
          <p>awaiting physical count</p>
        </div>
        <div className="stat-card success">
          <h4>Submitted</h4>
          <div className="value">{stats.submittedItems}</div>
          <p>submitted and saved</p>
        </div>
        <div className="stat-card">
          <h4>Matched</h4>
          <div className="value">{stats.matchedItems}</div>
          <p>physical = system stock</p>
        </div>
        <div className="stat-card danger">
          <h4>Shortage Items</h4>
          <div className="value">{stats.shortageItems}</div>
          <p>physical &lt; system stock</p>
        </div>
        <div className="stat-card accent">
          <h4>Excess Items</h4>
          <div className="value">{stats.excessItems}</div>
          <p>physical &gt; system stock</p>
        </div>
      </div>

      {/* Action card */}
      <div className="card">
        {stats.pendingItems > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>
                {stats.pendingItems} item{stats.pendingItems !== 1 ? 's' : ''} require a physical count.
              </p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Open the count sheet to enter physical quantities for assigned items.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-primary" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              Open Count Sheet →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>All items submitted for this cycle.</p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Submission complete. Download your reconciliation report below.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              View Submitted Records
            </Link>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
