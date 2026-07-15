import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import * as amApi from '../../../shared/api/amApi';
import { fmtDate } from '../../../shared/utils/dateUtils';

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
const IcoReview = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);

export default function AMDashboard() {
  const [data, setData]       = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([amApi.getDashboard(), amApi.getBatches()])
      .then(([d, b]) => { setData(d); setBatches(b); })
      .catch(e => console.error('AM dashboard:', e))
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { label: 'Stores Under You',    value: data?.storeCount    ?? 0, cls: 'kpi-blue',  icon: <IcoStores />, sub: 'assigned locations' },
    { label: 'Pending Your Review', value: data?.pendingReview ?? 0, cls: 'kpi-amber', icon: <IcoClock />,  sub: 'awaiting approval' },
    { label: 'Approved by You',     value: data?.approved      ?? 0, cls: 'kpi-green', icon: <IcoCheck />,  sub: 'submissions approved' },
    { label: 'Returned to Stores',  value: data?.returned      ?? 0, cls: 'kpi-red',   icon: <IcoReturn />, sub: 'sent back for correction' },
  ];

  const pendingNeedingReview = batches.filter(b => b.pendingReview > 0).length;

  return (
    <AMLayout>
      {/* Command header */}
      <div className="dash-command" style={{ marginBottom: 20 }}>
        <div>
          <div className="dash-cmd-title">Area Manager Overview</div>
          <div className="dash-cmd-sub">
            {loading
              ? 'Loading network data…'
              : batches.length
                ? `${batches.length} inventory cycle${batches.length !== 1 ? 's' : ''} in your network`
                : 'No inventory cycles yet in your network'}
          </div>
          {!loading && data?.pendingReview > 0 && (
            <div className="dash-cmd-badges" style={{ marginTop: 8 }}>
              <span className="dash-cmd-badge warning">
                {data.pendingReview} submission{data.pendingReview !== 1 ? 's' : ''} awaiting your review
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} className={`kpi-card ${k.cls}`}>
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '—' : k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Cycles card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <IcoReview />
            Inventory Cycles
          </span>
          {pendingNeedingReview > 0 && (
            <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>
              {pendingNeedingReview} cycle{pendingNeedingReview !== 1 ? 's' : ''} need review
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>Loading…</div>
        ) : batches.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
            No cycles yet. You will be notified when an inventory cycle is created.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {batches.map(b => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderBottom: '1px solid var(--red-border)',
                flexWrap: 'wrap', gap: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)' }}>
                    {fmtDate(b.inventoryDate, 'long')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {b.pendingReview > 0 && (
                      <span style={{ padding: '2px 9px', borderRadius: 99, background: 'rgba(217,119,6,0.10)', color: '#d97706', fontSize: 11, fontWeight: 700, border: '1px solid rgba(217,119,6,0.22)' }}>
                        {b.pendingReview} pending review
                      </span>
                    )}
                    {b.approved > 0 && (
                      <span style={{ padding: '2px 9px', borderRadius: 99, background: 'rgba(22,163,74,0.10)', color: '#16a34a', fontSize: 11, fontWeight: 700, border: '1px solid rgba(22,163,74,0.22)' }}>
                        {b.approved} approved
                      </span>
                    )}
                    {b.returned > 0 && (
                      <span style={{ padding: '2px 9px', borderRadius: 99, background: 'rgba(220,38,38,0.10)', color: '#dc2626', fontSize: 11, fontWeight: 700, border: '1px solid rgba(220,38,38,0.22)' }}>
                        {b.returned} returned
                      </span>
                    )}
                    {b.notSubmitted > 0 && (
                      <span style={{ padding: '2px 9px', borderRadius: 99, background: 'rgba(0,0,0,0.06)', color: 'var(--tx3)', fontSize: 11, fontWeight: 700, border: '1px solid rgba(0,0,0,0.10)' }}>
                        {b.notSubmitted} not submitted
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.22)', minHeight: 44, whiteSpace: 'nowrap' }}
                  onClick={() => navigate(`/am/review/${b.id}`)}
                >
                  Review →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AMLayout>
  );
}
