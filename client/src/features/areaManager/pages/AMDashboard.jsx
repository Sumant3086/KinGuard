import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import { LoadingText } from '../../../shared/components/ui/LoadingCard';
import { useToast } from '../../../shared/context/ToastContext';
import * as amApi from '../../../shared/api/amApi';

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

const REVIEW_COLOR = { PENDING_REVIEW: '#d97706', APPROVED: '#16a34a', RETURNED: '#dc2626' };
const REVIEW_LABEL = { PENDING_REVIEW: 'Awaiting Review', APPROVED: 'Approved', RETURNED: 'Returned' };

export default function AMDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast    = useToast();

  useEffect(() => {
    let live = true;
    amApi.getDashboard()
      .then(d => { if (live) setData(d); })
      .catch(e => { console.error('AM dashboard:', e); if (live) toast.error('Could not load dashboard. Please refresh.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const storeProgress = data?.storeProgress ?? [];

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
      {/* Command header */}
      <div className="dash-command" style={{ marginBottom: 20 }}>
        <div>
          <div className="dash-cmd-title">Area Manager Overview</div>
          <div className="dash-cmd-sub">
            {loading
              ? 'Loading…'
              : `${stores.length} store${stores.length !== 1 ? 's' : ''} under your supervision`}
          </div>
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
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/am/review')}
          >
            Go to Reviews →
          </button>
        )}
      </div>

      {/* KPI grid */}
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
              return (
                <div key={s.storeId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--red-border)', background: 'rgba(255,248,245,0.6)' }}>
                  <div style={{ minWidth: 60 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: 'var(--vi-light)' }}>{s.storeCode}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{s.storeName}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {s.total > 0 ? (
                      <>
                        <div style={{ height: 5, borderRadius: 99, background: 'rgba(185,28,28,0.10)', overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{s.submitted}/{s.total} items · {pct}%</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic' }}>No items assigned</div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {s.reviewStatus ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${REVIEW_COLOR[s.reviewStatus]}18`, color: REVIEW_COLOR[s.reviewStatus], border: `1px solid ${REVIEW_COLOR[s.reviewStatus]}35` }}>
                        {REVIEW_LABEL[s.reviewStatus]}
                      </span>
                    ) : s.pending === 0 && s.total > 0 ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(22,163,74,0.12)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.30)' }}>
                        Submitted
                      </span>
                    ) : s.pending > 0 ? (
                      <span style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>{s.pending} pending</span>
                    ) : null}
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
