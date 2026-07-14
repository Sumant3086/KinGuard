import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../layout/AdminLayout';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { LoadingText } from '../../../shared/components/ui/LoadingCard';
import * as adminApi from '../../../shared/api/adminApi';
import * as cache from '../../../shared/api/cache';
import { fmtDate } from '../../../shared/utils/dateUtils';

const CACHE_KEY = 'admin:dashboard';

/* ── Banner icons ───────────────────────────────────────────────── */
const IcoBannerLock   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcoBannerClock  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcoBannerRepeat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;

/* ── Icons ─────────────────────────────────────────────────────── */
const IcoStores = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IcoCheckCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IcoClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IcoTrendDown = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
    <polyline points="17 18 23 18 23 12"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoTrendUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);
const IcoBarChart = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
);
const IcoHotspot = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

function RiskTag({ level }) {
  const map = {
    RED:    { cls: 'risk-tag risk-high', label: 'High Risk' },
    YELLOW: { cls: 'risk-tag risk-mid',  label: 'Watch'     },
    GREEN:  { cls: 'risk-tag risk-low',  label: 'On Track'  },
  };
  const { cls, label } = map[level] || map.GREEN;
  return <span className={cls}>{label}</span>;
}

function ShortageBar({ rate }) {
  const cls = rate >= 20 ? 'high' : rate >= 5 ? 'mid' : 'low';
  return (
    <div className="sbar-wrap">
      <div className="sbar-track">
        <div className={`sbar-fill ${cls}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className="sbar-pct">{rate}%</span>
    </div>
  );
}

/* ── Donut ring — network submission overview ──────────────────── */
function NetworkRing({ submitted, total, overdueCount }) {
  if (!total) return null;
  const pending  = Math.max(0, total - submitted - (overdueCount || 0));
  const pct      = Math.round((submitted / total) * 100);
  const sDeg     = (submitted    / total) * 360;
  const pDeg     = (pending      / total) * 360;
  const oDeg     = ((overdueCount||0) / total) * 360;
  const gradient = `conic-gradient(from -90deg,
    #22c55e 0deg ${sDeg}deg,
    #f59e0b ${sDeg}deg ${sDeg + pDeg}deg,
    #ef4444 ${sDeg + pDeg}deg ${sDeg + pDeg + oDeg}deg,
    rgba(185,28,28,0.12) ${sDeg + pDeg + oDeg}deg 360deg)`;
  return (
    <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <div style={{ position:'relative', width:80, height:80 }}>
        <div style={{ width:'100%', height:'100%', borderRadius:'50%', background:gradient }} />
        <div style={{
          position:'absolute', inset:14, borderRadius:'50%',
          background:'var(--donut-hole,#ead4ce)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 0 2px rgba(185,28,28,0.10)',
        }}>
          <span style={{ fontSize:14, fontWeight:900, color:'#1c0a08', lineHeight:1 }}>{pct}%</span>
          <span style={{ fontSize:7, fontWeight:700, color:'#6b3e3c', textTransform:'uppercase', letterSpacing:'0.5px', marginTop:1 }}>done</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, fontSize:9, fontWeight:700, color:'#6b3e3c' }}>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>
          {submitted}
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:'#f59e0b', display:'inline-block' }}/>
          {pending}
        </span>
        {(overdueCount||0) > 0 && (
          <span style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', display:'inline-block' }}/>
            {overdueCount}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Stacked network bar ──────────────────────────────────────── */
function NetworkBar({ submitted, total, overdueCount }) {
  if (!total) return null;
  const pending  = Math.max(0, total - submitted - (overdueCount||0));
  const sW = (submitted / total) * 100;
  const pW = (pending   / total) * 100;
  const oW = ((overdueCount||0) / total) * 100;
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:'flex', height:6, borderRadius:99, overflow:'hidden', gap:1, background:'rgba(185,28,28,0.10)' }}>
        {sW > 0 && <div style={{ width:`${sW}%`, background:'#22c55e', borderRadius:'99px 0 0 99px' }} />}
        {pW > 0 && <div style={{ width:`${pW}%`, background:'#f59e0b' }} />}
        {oW > 0 && <div style={{ width:`${oW}%`, background:'#ef4444', borderRadius:'0 99px 99px 0' }} />}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:10, fontWeight:600, color:'#6b3e3c' }}>
        <span><span style={{ color:'#15803d' }}>{submitted} submitted</span></span>
        <span><span style={{ color:'#92400e' }}>{pending} pending</span> {(overdueCount||0) > 0 && <span style={{ color:'#b91c1c' }}>· {overdueCount} overdue</span>}</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData]       = useState(() => cache.get(CACHE_KEY) ?? null);
  const [loading, setLoading] = useState(!cache.get(CACHE_KEY));
  const navigate = useNavigate();

  useEffect(() => {
    if (cache.get(CACHE_KEY)) return;
    let live = true;
    adminApi.getDashboard()
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setData(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  return (
    <AdminLayout>
      {loading ? (
        <div className="card" style={{ padding: '40px 20px' }}>
          <LoadingText width="40%" height={32} style={{ marginBottom: 24 }} />
          <div className="kpi-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton skeleton-card" style={{ height: 120 }} />
            ))}
          </div>
          <div className="skeleton skeleton-card" style={{ height: 300, marginTop: 32 }} />
        </div>
      ) : !data ? (
        <EmptyState
          variant="error"
          icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
          title="Failed to Load Dashboard"
          description="We couldn't retrieve dashboard data. Please check your connection and try again."
          action={<button onClick={() => window.location.reload()} className="btn btn-primary">Retry</button>}
        />
      ) : (
        <DashboardContent data={data} navigate={navigate} />
      )}
    </AdminLayout>
  );
}

function DashboardContent({ data, navigate }) {
  const { totalStores, currentBatch: cb, storeScorecard, hotspots, networkSummary: ns } = data;
  const now = new Date();
  const submittedPct = totalStores > 0 ? Math.round(((cb?.storesSubmitted ?? 0) / totalStores) * 100) : 0;

  return (
    <>
      {/* ── Command Header ── */}
      <div className="dash-command">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dash-cmd-title">Network Overview</div>
          <div className="dash-cmd-sub">
            {cb
              ? `Active cycle · ${fmtDate(cb.inventoryDate, 'long')}`
              : 'No active inventory cycle. Upload a master file to begin.'}
          </div>
          {cb && (
            <div className="dash-cmd-badges" style={{ marginTop: 10 }}>
              <span className={`dash-cmd-badge ${submittedPct === 100 ? 'good' : submittedPct >= 50 ? 'warning' : 'danger'}`}>
                {submittedPct}% reported
              </span>
              <span className="dash-cmd-badge">{totalStores} store{totalStores !== 1 ? 's' : ''}</span>
              {cb.submissionDeadline && (
                <span className={`dash-cmd-badge ${now > new Date(cb.submissionDeadline) ? 'danger' : 'warning'}`}>
                  Deadline: {fmtDate(cb.submissionDeadline, 'monthDay')}
                </span>
              )}
            </div>
          )}
          {cb && <NetworkBar submitted={cb.storesSubmitted ?? 0} total={totalStores} overdueCount={cb.overdueStores?.length ?? 0} />}
        </div>
        {cb && <NetworkRing submitted={cb.storesSubmitted ?? 0} total={totalStores} overdueCount={cb.overdueStores?.length ?? 0} />}
      </div>

      {/* ── Deadline / overdue banner ── */}
      {cb?.submissionDeadline && (() => {
        const dl = new Date(cb.submissionDeadline);
        const passed = now > dl;
        const hrs = Math.round((dl - now) / 3600000);
        if (passed && cb.overdueStores?.length > 0) return (
          <div className="deadline-banner overdue" style={{ marginBottom: 16 }}>
            <span className="deadline-banner-icon"><IcoBannerLock /></span>
            <div>
              <p><strong>Submission deadline passed.</strong> {cb.overdueStores.length} store{cb.overdueStores.length > 1 ? 's have' : ' has'} not submitted.</p>
              <div className="overdue-chips">
                {cb.overdueStores.map(s => <span key={s} className="overdue-chip">{s}</span>)}
              </div>
            </div>
          </div>
        );
        if (!passed && hrs <= 48 && cb.storesPending > 0) return (
          <div className="deadline-banner" style={{ marginBottom: 16 }}>
            <span className="deadline-banner-icon"><IcoBannerClock /></span>
            <p><strong>Submission deadline</strong> in {hrs < 1 ? '<1' : hrs}h — {cb.storesPending} store{cb.storesPending > 1 ? 's' : ''} still pending.</p>
          </div>
        );
        return null;
      })()}

      {/* ── Repeat discrepancy alert ── */}
      {hotspots.length > 0 && (
        <div className="banner banner-over" style={{ marginBottom: 20 }}>
          <span className="banner-icon"><IcoBannerRepeat /></span>
          <div>
            <strong>Recurring Loss Items Detected</strong>
            <p style={{ marginTop: 4, fontSize: 13 }}>
              {hotspots.length} material{hotspots.length !== 1 ? 's' : ''} with recurring shortages across 2 or more cycles.{' '}
              Top: <strong>{hotspots[0].materialCode}</strong> at {hotspots[0].storeName} — {hotspots[0].batchCount} cycles, −{hotspots[0].totalShortage} units.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-blue">
          <div className="kpi-icon"><IcoStores /></div>
          <div className="kpi-label">Active Stores</div>
          <div className="kpi-value">{totalStores}</div>
          <div className="kpi-sub">active store locations</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-icon"><IcoCheckCircle /></div>
          <div className="kpi-label">Fully Reported</div>
          <div className="kpi-value">{cb?.storesSubmitted ?? 0}</div>
          <div className="kpi-sub">{submittedPct}% of network</div>
        </div>
        <div className="kpi-card kpi-amber">
          <div className="kpi-icon"><IcoClock /></div>
          <div className="kpi-label">Awaiting Submission</div>
          <div className="kpi-value">{cb?.storesPending ?? 0}</div>
          <div className="kpi-sub">pending submission</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-icon"><IcoTrendDown /></div>
          <div className="kpi-label">Shortage Items</div>
          <div className="kpi-value">{ns.shortageItems}</div>
          <div className="kpi-sub">physical &lt; system stock</div>
        </div>
        <div className="kpi-card kpi-teal">
          <div className="kpi-icon"><IcoCheck /></div>
          <div className="kpi-label">Matched Items</div>
          <div className="kpi-value">{ns.matchedItems}</div>
          <div className="kpi-sub">physical = system stock</div>
        </div>
        <div className="kpi-card kpi-purple">
          <div className="kpi-icon"><IcoTrendUp /></div>
          <div className="kpi-label">Excess Items</div>
          <div className="kpi-value">{ns.excessItems}</div>
          <div className="kpi-sub">physical &gt; system stock</div>
        </div>
      </div>

      {/* ── Store Submission Status Scorecard — full width ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <IcoBarChart />
            Store Submission Status
          </span>
          {cb && (
            <span className="card-header-meta">
              {fmtDate(cb.inventoryDate)}
            </span>
          )}
        </div>

        {storeScorecard.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 160 }}>
            <div className="empty-state-illustration">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
            </div>
            <h4 className="empty-state-title">No Active Inventory Cycle</h4>
            <p className="empty-state-description">Upload a master file to create an inventory cycle for this network.</p>
          </div>
        ) : (
          <>
            {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
            <div className="scorecard-cards">
              {storeScorecard.map(store => (
                <div key={store.storeId} className="scorecard-card">
                  <div className="scorecard-card-top">
                    <div>
                      <div className="scorecard-card-name">{store.storeName}</div>
                      <div className="scorecard-card-code">{store.storeCode || store.storeId}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {store.status === 'SUBMITTED' && <span className="badge badge-submitted">Submitted</span>}
                      {store.status === 'PENDING' && (
                        <span className={`badge ${store.isOverdue ? 'badge-shortage' : 'badge-pending'}`}>
                          {store.isOverdue ? 'Past Deadline' : 'Awaiting'}
                        </span>
                      )}
                      {store.status === 'NO_DATA' && <span className="badge badge-no-data">No Data</span>}
                      <RiskTag level={store.riskLevel} />
                    </div>
                  </div>
                  <ShortageBar rate={store.shortageRate} />
                  {store.topRemark && (
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', fontStyle: 'italic' }} title={store.topRemark}>
                      {store.topRemark}
                    </div>
                  )}
                  {store.shortageCount > 0 && (
                    <button
                      onClick={() => navigate(`/admin/inventory?storeId=${store.storeId}&discrepancy=shortage`)}
                      style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 12, color: 'var(--red)', textDecoration: 'underline', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {store.shortageCount} shortage item{store.shortageCount !== 1 ? 's' : ''} →
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* ── Desktop table (>768px) ────────────────────────────── */}
            <div className="table-wrap scorecard-table-desktop">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Shortage Rate</th>
                    <th scope="col">Shortages</th>
                    <th scope="col">Top Remark</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {storeScorecard.map(store => (
                    <tr
                      key={store.storeId}
                      className={store.riskLevel === 'RED' ? 'row-risk-high' : store.riskLevel === 'YELLOW' ? 'row-risk-mid' : ''}
                    >
                      <td>
                        <div className="score-store-name">{store.storeName}</div>
                        <div className="score-store-code">{store.storeCode || store.storeId}</div>
                      </td>
                      <td><RiskTag level={store.riskLevel} /></td>
                      <td style={{ minWidth: 130 }}><ShortageBar rate={store.shortageRate} /></td>
                      <td>
                        <button
                          onClick={() => store.shortageCount > 0 && navigate(`/admin/inventory?storeId=${store.storeId}&discrepancy=shortage`)}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            fontWeight: 700, fontSize: 'inherit',
                            color: store.shortageCount > 0 ? 'var(--red)' : 'var(--t2)',
                            textDecoration: store.shortageCount > 0 ? 'underline' : 'none',
                            cursor: store.shortageCount > 0 ? 'pointer' : 'default',
                          }}
                        >
                          {store.shortageCount}
                        </button>
                      </td>
                      <td>
                        <span className="score-remark" title={store.topRemark || ''}>
                          {store.topRemark || '—'}
                        </span>
                      </td>
                      <td>
                        {store.status === 'SUBMITTED' && <span className="badge badge-submitted">Submitted</span>}
                        {store.status === 'PENDING' && (
                          <span className={`badge ${store.isOverdue ? 'badge-shortage' : 'badge-pending'}`}>
                            {store.isOverdue ? 'Past Deadline' : 'Awaiting'}
                          </span>
                        )}
                        {store.status === 'NO_DATA' && <span className="badge badge-no-data">No Data</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Recurring Loss Items — full-width compact grid below scorecard ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <IcoHotspot />
            Recurring Loss Items
          </span>
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 500 }}>
            Items with shortages in 2+ consecutive cycles
          </span>
        </div>

        {hotspots.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 4px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(22,163,74,0.10)', border: '1.5px solid rgba(22,163,74,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>No Recurring Loss Items Detected</div>
              <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>No materials with repeat shortages found across recent cycles.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {hotspots.map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 'var(--r)',
                border: `1px solid ${i === 0 ? 'rgba(220,38,38,0.25)' : 'var(--red-border)'}`,
                background: i === 0 ? 'rgba(220,38,38,0.04)' : 'rgba(255,248,245,0.70)',
                borderLeft: i === 0 ? '3px solid #dc2626' : undefined,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: i === 0 ? 'rgba(220,38,38,0.14)' : i === 1 ? 'rgba(217,119,6,0.12)' : 'rgba(185,28,28,0.08)',
                  color: i === 0 ? '#b91c1c' : i === 1 ? '#b45309' : 'var(--tx3)',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx1)', wordBreak: 'break-word', lineHeight: 1.3 }}>{h.materialCode}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 600, marginTop: 2 }}>{h.storeName}</div>
                  {h.dominantRemark && <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>{h.dominantRemark}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ padding: '2px 7px', borderRadius: 99, background: 'rgba(220,38,38,0.10)', color: '#b91c1c', fontSize: 10, fontWeight: 700, border: '1px solid rgba(220,38,38,0.18)' }}>
                    {h.batchCount} cycles
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>−{h.totalShortage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
