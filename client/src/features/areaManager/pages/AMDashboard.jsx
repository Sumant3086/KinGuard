import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import { LoadingText } from '../../../shared/components/ui/LoadingCard';
import { useToast } from '../../../shared/context/ToastContext';

const IcoStores = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IcoClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IcoReturn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
  </svg>
);
const IcoCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const REVIEW_COLOR = { PENDING_REVIEW: '#d97706', APPROVED: '#16a34a', RETURNED: '#dc2626' };
const REVIEW_LABEL = { PENDING_REVIEW: 'Awaiting Review', APPROVED: 'Approved', RETURNED: 'Returned' };
const STATUS_ICON = { APPROVED: '✓', RETURNED: '↩', PENDING_REVIEW: '⏳' };

const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function AMDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const navigate = useNavigate();
  const toast    = useToast();

  useEffect(() => {
    loadDashboard(selectedBatchId);
  }, [selectedBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = (batchId) => {
    setLoading(true);
    let url = batchId ? `/api/am/dashboard?batchId=${batchId}` : '/api/am/dashboard';
    // Add cache-busting timestamp to force fresh data
    url += (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
    
    fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then(d => setData(d))
      .catch(e => {
        console.error('AM dashboard:', e);
        toast.error('Could not load dashboard. Please refresh.');
      })
      .finally(() => setLoading(false));
  };

  const storeProgress = data?.storeProgress ?? [];
  const currentBatch = data?.selectedBatch || data?.latestBatch;
  const monthlyStats = data?.monthlyStats;
  const recentActivity = data?.recentActivity ?? [];
  const availableBatches = data?.availableBatches ?? [];

  const kpis = [
    { label: 'Stores Under You',    value: data?.storeCount    ?? 0, cls: 'kpi-blue',  icon: <IcoStores />, sub: 'assigned locations' },
    { label: 'Pending Your Review', value: data?.pendingReview ?? 0, cls: 'kpi-amber', icon: <IcoClock />,  sub: 'awaiting approval', link: '/am/review' },
    { label: 'Approved by You',     value: data?.approved      ?? 0, cls: 'kpi-green', icon: <IcoCheck />,  sub: 'this cycle',        link: '/am/review' },
    { label: 'Returned to Stores',  value: data?.returned      ?? 0, cls: 'kpi-red',   icon: <IcoReturn />, sub: 'sent back for correction', link: '/am/review' },
  ];

  const totalItems    = storeProgress.reduce((s, x) => s + x.total, 0);
  const totalSubmitted = storeProgress.reduce((s, x) => s + x.submitted, 0);
  const networkPct    = totalItems > 0 ? Math.round((totalSubmitted / totalItems) * 100) : 0;

  return (
    <AMLayout>
      {/* Command header with cycle selector */}
      <div className="dash-command" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="dash-cmd-title">Area Manager Overview</div>
          <div className="dash-cmd-sub">
            {loading
              ? 'Loading…'
              : `${storeProgress.length} store${storeProgress.length !== 1 ? 's' : ''} under your supervision`}
          </div>
          
          {/* Cycle Selector */}
          {!loading && currentBatch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <IcoCalendar />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Viewing Cycle:</span>
              <select
                value={selectedBatchId || currentBatch.id}
                onChange={(e) => setSelectedBatchId(e.target.value === currentBatch.id.toString() ? null : parseInt(e.target.value))}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--t1)',
                  cursor: 'pointer',
                }}
              >
                {availableBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {fmtDate(b.inventoryDate)}
                    {b.id === data?.latestBatch?.id ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!loading && data?.pendingReview > 0 && (
            <div className="dash-cmd-badges" style={{ marginTop: 8 }}>
              <span className="dash-cmd-badge warning">
                {data.pendingReview} submission{data.pendingReview !== 1 ? 's' : ''} awaiting your review
              </span>
            </div>
          )}
        </div>
        {!loading && data?.pendingReview > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => navigate('/am/review')}
          >
            Go to Reviews →
          </button>
        )}
      </div>

      {/* KPI grid - Current Cycle */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t2)', marginBottom: 8 }}>
          Current Cycle ({currentBatch ? fmtDate(currentBatch.inventoryDate) : '—'})
        </h3>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <div
            key={k.label}
            className={`kpi-card ${k.cls}`}
            onClick={k.link ? () => navigate(k.link) : undefined}
            style={k.link ? { cursor: 'pointer' } : {}}
            title={k.link ? 'Click to go to reviews' : undefined}
          >
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">
              {loading
                ? <LoadingText width="40%" height={28} style={{ margin: '4px 0' }} />
                : k.value}
            </div>
            {!loading && <div className="kpi-sub">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Monthly Summary & Performance Stats */}
      {!loading && monthlyStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* Monthly Summary */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoCalendar />
              This Month Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Total Cycles</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{monthlyStats.totalCycles}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Approval Rate</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{monthlyStats.approvalRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Approved</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{monthlyStats.approved}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>Returned</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{monthlyStats.returned}</div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
              Recent Activity
            </h3>
            {recentActivity.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>No recent reviews</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentActivity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ fontSize: 14 }}>{STATUS_ICON[a.status]}</span>
                    <span style={{ fontWeight: 600, color: REVIEW_COLOR[a.status] }}>
                      {a.status === 'APPROVED' ? 'Approved' : 'Returned'}
                    </span>
                    <span style={{ color: 'var(--t2)' }}>{a.storeCode}</span>
                    <span style={{ color: 'var(--t3)', fontSize: 11, marginLeft: 'auto' }}>
                      {fmtDateTime(a.reviewedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Store Submission Progress */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><IcoStores /> Store Submission Progress</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/am/review')}>
            Review Submissions →
          </button>
        </div>

        {!loading && storeProgress.length > 0 && totalItems > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginBottom: 4 }}>
              <span>Network: {totalSubmitted}/{totalItems} items submitted</span>
              <span>{networkPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(185,28,28,0.10)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${networkPct}%`, background: networkPct === 100 ? '#16a34a' : 'var(--red)', borderRadius: 99, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-text" style={{ height: 38, borderRadius: 8 }} />)}
          </div>
        ) : storeProgress.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
            No stores have been assigned to you yet. Contact the admin.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {storeProgress.map(s => {
              const pct = s.total > 0 ? Math.round((s.submitted / s.total) * 100) : 0;
              const color = s.reviewStatus ? REVIEW_COLOR[s.reviewStatus] : s.total === 0 ? 'var(--tx3)' : s.pending > 0 ? '#d97706' : '#16a34a';
              const statusText = s.reviewStatus 
                ? REVIEW_LABEL[s.reviewStatus]
                : s.total === 0 
                  ? 'No items'
                  : s.pending === 0 && s.submitted > 0
                    ? 'Submitted'
                    : `${s.pending} pending`;
              
              return (
                <div key={s.storeId} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '140px 1fr 120px', 
                  alignItems: 'center', 
                  gap: 16, 
                  padding: '12px 14px', 
                  borderRadius: 'var(--r)', 
                  border: '1px solid var(--red-border)', 
                  background: 'rgba(255,248,245,0.6)' 
                }}>
                  {/* Store Info */}
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'var(--vi-light)', marginBottom: 2 }}>
                      {s.storeCode}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx1)' }} title={s.storeName}>
                      {s.storeName}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    {s.total > 0 ? (
                      <>
                        <div style={{ height: 6, borderRadius: 99, background: 'rgba(185,28,28,0.10)', overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                          {s.submitted}/{s.total} items ({pct}%)
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }}>No items assigned</div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ 
                      fontSize: 11, 
                      fontWeight: 700, 
                      padding: '4px 10px', 
                      borderRadius: 99, 
                      background: `${color}18`, 
                      color: color, 
                      border: `1px solid ${color}35`,
                      display: 'inline-block',
                    }}>
                      {statusText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AMLayout>
  );
}
