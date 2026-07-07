import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';
import * as cache from '../../api/cache';

const CACHE_KEY = 'store:dashboard';
const CACHE_TTL = 30_000; // 30 s

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
        <div className="loading"><div className="loading-spinner" />Loading…</div>
      </StoreLayout>
    );
  }

  if (error) {
    return <StoreLayout><div className="alert alert-error">{error}</div></StoreLayout>;
  }

  if (!dashboard?.batch) {
    return (
      <StoreLayout>
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p>Nothing to count right now — check back later.</p>
            <p style={{ marginTop: 8, fontSize: 13 }}>Contact your administrator if you believe this is a mistake.</p>
          </div>
        </div>
      </StoreLayout>
    );
  }

  const { store, batch, stats } = dashboard;
  const completionPct = stats.totalItems > 0
    ? Math.round((stats.submittedItems / stats.totalItems) * 100)
    : 0;

  const now = new Date();
  const deadline = batch.submissionDeadline ? new Date(batch.submissionDeadline) : null;
  const isPastDue = deadline && now > deadline;
  const isApproaching = deadline && !isPastDue && (deadline - now) < 48 * 3600 * 1000;

  return (
    <StoreLayout>
      <div className="page-header">
        <div>
          <h2>My Store Dashboard</h2>
          <p>Your inventory snapshot for this cycle &mdash; {store?.storeName}</p>
        </div>
        {stats.pendingItems > 0 && (
          <Link to="/store/inventory" className="btn btn-primary">
            Enter Inventory
          </Link>
        )}
      </div>

      {/* Deadline warnings */}
      {isPastDue && (
        <div className="deadline-banner overdue">
          <span className="deadline-banner-icon">🔒</span>
          <p><strong>PAST DUE.</strong> The submission deadline has passed. Contact your administrator to request an extension.</p>
        </div>
      )}
      {isApproaching && !isPastDue && (
        <div className="deadline-banner">
          <span className="deadline-banner-icon">⏰</span>
          <p>Deadline approaching — please finish soon. Due: {deadline.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}

      {/* Batch info */}
      <div className="card">
        <div className="info-grid">
          <div className="info-item">
            <label>Store</label>
            <span>{store?.storeName}</span>
          </div>
          <div className="info-item">
            <label>Inventory Date</label>
            <span>{new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          {deadline && (
            <div className="info-item">
              <label>Due Date</label>
              <span style={{ color: isPastDue ? 'var(--red)' : 'inherit' }}>
                {deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {isPastDue && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>PAST DUE</span>}
              </span>
            </div>
          )}
          <div className="info-item">
            <label>Completion</label>
            <span>
              {completionPct}%
              {completionPct === 100 && <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓ Complete</span>}
            </span>
          </div>
        </div>

        {stats.totalItems > 0 && (
          <div style={{ marginTop: 12 }}>
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
              {stats.submittedItems} of {stats.totalItems} items counted &amp; saved
            </p>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card info">
          <h4>Items to Count</h4>
          <div className="value">{stats.totalItems}</div>
        </div>
        <div className="stat-card warning">
          <h4>Still Needed</h4>
          <div className="value">{stats.pendingItems}</div>
        </div>
        <div className="stat-card success">
          <h4>Items Done</h4>
          <div className="value">{stats.submittedItems}</div>
        </div>
        <div className="stat-card">
          <h4>Matched</h4>
          <div className="value">{stats.matchedItems}</div>
        </div>
        <div className="stat-card danger">
          <h4>Shortage</h4>
          <div className="value">{stats.shortageItems}</div>
        </div>
        <div className="stat-card accent">
          <h4>Excess</h4>
          <div className="value">{stats.excessItems}</div>
        </div>
      </div>

      <div className="card">
        {stats.pendingItems > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 24 }}>📋</span>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>
                {stats.pendingItems} item{stats.pendingItems !== 1 ? 's' : ''} still need your count
              </p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Go to Inventory to enter your counted quantities and any remarks.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
              Open Inventory
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>All items counted &amp; submitted</p>
              <p style={{ fontSize: 13, color: 'var(--t3)' }}>
                Great work! Your inventory has been submitted. Download your report from the Inventory page.
              </p>
            </div>
            <Link to="/store/inventory" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
              View Records
            </Link>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
