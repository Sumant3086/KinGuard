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

export default function AMDashboard() {
  const [data,    setData]    = useState(null);
  const [stores,  setStores]  = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast    = useToast();

  useEffect(() => {
    let live = true;
    Promise.all([amApi.getDashboard(), amApi.getMyStores()])
      .then(([d, s]) => { if (live) { setData(d); setStores(s); } })
      .catch(e => { console.error('AM dashboard:', e); if (live) toast.error('Could not load dashboard. Please refresh.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    { label: 'Stores Under You',    value: data?.storeCount    ?? 0, cls: 'kpi-blue',  icon: <IcoStores />, sub: 'assigned locations' },
    { label: 'Pending Your Review', value: data?.pendingReview ?? 0, cls: 'kpi-amber', icon: <IcoClock />,  sub: 'awaiting approval', link: '/am/review' },
    { label: 'Approved by You',     value: data?.approved      ?? 0, cls: 'kpi-green', icon: <IcoCheck />,  sub: 'this cycle',        link: '/am/review' },
    { label: 'Returned to Stores',  value: data?.returned      ?? 0, cls: 'kpi-red',   icon: <IcoReturn />, sub: 'sent back for correction', link: '/am/review' },
  ];

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

      {/* My Assigned Stores */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <IcoStores />
            My Assigned Stores
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/am/review')}
          >
            Review Submissions →
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton skeleton-text" style={{ height: 40, borderRadius: 8 }} />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
            No stores have been assigned to you yet. Contact the admin.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {stores.map(s => (
              <div
                key={s.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--red-border)',
                  background: 'rgba(255,248,245,0.70)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: 'var(--vi-light)' }}>
                  {s.storeCode}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx1)' }}>
                  {s.storeName}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AMLayout>
  );
}
