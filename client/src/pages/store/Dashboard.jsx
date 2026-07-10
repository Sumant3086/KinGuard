import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';
import * as cache from '../../api/cache';

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
          <h3 className="empty-state-title">No Active Stock Count</h3>
          <p className="empty-state-description">
            There's no inventory cycle active right now. Your administrator will notify you when the next count begins.
          </p>
          <div className="empty-state-help">
            Check back later or contact your manager if you believe this is incorrect
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
          <h2>Stock Count Dashboard</h2>
          <p>{store?.storeName} &mdash; {fmt(batch.inventoryDate)}</p>
        </div>
        {stats.pendingItems > 0 && (
          <Link to="/store/inventory" className="btn btn-primary">
            Start Counting →
          </Link>
        )}
      </div>

      {/* Alert: older pending batches (e.g. admin uploaded a past-date cycle) */}
      {olderPendingBatches.length > 0 && (
        <div className="deadline-banner" style={{ background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.22)', color: '#1d4ed8' }}>
          <span className="deadline-banner-icon">📋</span>
          <div>
            <p>
              <strong>You have {olderPendingBatches.length} earlier count cycle{olderPendingBatches.length > 1 ? 's' : ''} still pending:</strong>
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
          <span className="deadline-banner-icon">🔒</span>
          <p><strong>Submission locked.</strong> The deadline has passed. Contact your administrator to request an extension.</p>
        </div>
      )}
      {isApproaching && !isPastDue && (
        <div className="deadline-banner">
          <span className="deadline-banner-icon">⏰</span>
          <p>Deadline approaching — please complete your count soon. Due: {deadline.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}

      {/* Current cycle summary card */}
      <div className="card">
        <div className="info-grid">
          <div className="info-item">
            <label>Store</label>
            <span>{store?.storeName}</span>
          </div>
          <div className="info-item">
            <label>Count Date</label>
            <span>{fmt(batch.inventoryDate)}</span>
          </div>
          {deadline && (
            <div className="info-item">
              <label>Submission Deadline</label>
              <span style={{ color: isPastDue ? 'var(--red)' : 'inherit' }}>
                {deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {isPastDue && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>LOCKED</span>}
              </span>
            </div>
          )}
          <div className="info-item">
            <label>Progress</label>
            <span>
              {completionPct}% complete
              {completionPct === 100 && <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓</span>}
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

      {/* Summary stat cards — retail L&P language */}
      <div className="stats-grid">
        <div className="stat-card info">
          <h4>Total Items</h4>
          <div className="value">{stats.totalItems}</div>
          <p>assigned to your store</p>
        </div>
        <div className="stat-card warning">
          <h4>Still to Count</h4>
          <div className="value">{stats.pendingItems}</div>
          <p>waiting for your count</p>
        </div>
        <div className="stat-card success">
          <h4>Counted</h4>
          <div className="value">{stats.submittedItems}</div>
          <p>recorded &amp; saved</p>
        </div>
        <div className="stat-card">
          <h4>Exact Match</h4>
          <div className="value">{stats.matchedItems}</div>
          <p>count = book stock</p>
        </div>
        <div className="stat-card danger">
          <h4>Missing Items</h4>
          <div className="value">{stats.shortageItems}</div>
          <p>count &lt; book stock</p>
        </div>
        <div className="stat-card accent">
          <h4>Surplus Items</h4>
          <div className="value">{stats.excessItems}</div>
          <p>count &gt; book stock</p>
        </div>
      </div>

      {/* Action card */}
      <div className="card">
        {stats.pendingItems > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 28 }}>📦</span>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>
                {stats.pendingItems} item{stats.pendingItems !== 1 ? 's' : ''} still need your physical count
              </p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Go to Stock Count to enter your counted quantities and note any discrepancies.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-primary" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              Open Stock Count →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>All items counted and submitted</p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Your count for this cycle is complete. Download your report below.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              View My Records
            </Link>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
