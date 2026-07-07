import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import * as cache from '../../api/cache';

const CACHE_KEY = 'admin/dashboard';
const CACHE_TTL = 30_000;

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
    GREEN:  { cls: 'risk-tag risk-low',  label: 'Healthy'   },
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

export default function AdminDashboard() {
  const [data, setData]       = useState(() => cache.get(CACHE_KEY) ?? null);
  const [loading, setLoading] = useState(!cache.get(CACHE_KEY));
  const navigate = useNavigate();

  useEffect(() => {
    if (cache.get(CACHE_KEY)) return;
    let live = true;
    adminApi.getDashboard()
      .then(d => { if (live) { cache.set(CACHE_KEY, d, CACHE_TTL); setData(d); } })
      .catch(e => console.error(e))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  return (
    <AdminLayout>
      {loading ? (
        <div className="loading"><div className="spinner" />Loading dashboard…</div>
      ) : !data ? (
        <div className="alert alert-error">Failed to load dashboard data.</div>
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
        <div>
          <div className="dash-cmd-title">Network Overview</div>
          <div className="dash-cmd-sub">
            {cb
              ? `Active cycle · ${new Date(cb.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'No active inventory cycle — upload a master file to begin'}
          </div>
        </div>
        {cb && (
          <div className="dash-cmd-badges">
            <span className={`dash-cmd-badge ${submittedPct === 100 ? 'good' : submittedPct >= 50 ? 'warning' : 'danger'}`}>
              {submittedPct}% submitted
            </span>
            <span className="dash-cmd-badge">{totalStores} store{totalStores !== 1 ? 's' : ''}</span>
            {cb.submissionDeadline && (
              <span className={`dash-cmd-badge ${now > new Date(cb.submissionDeadline) ? 'danger' : 'warning'}`}>
                Deadline: {new Date(cb.submissionDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Deadline / overdue banner ── */}
      {cb?.submissionDeadline && (() => {
        const dl = new Date(cb.submissionDeadline);
        const passed = now > dl;
        const hrs = Math.round((dl - now) / 3600000);
        if (passed && cb.overdueStores?.length > 0) return (
          <div className="deadline-banner overdue" style={{ marginBottom: 16 }}>
            <span className="deadline-banner-icon">🔒</span>
            <div>
              <p><strong>Deadline passed.</strong> {cb.overdueStores.length} store{cb.overdueStores.length > 1 ? 's have' : ' has'} not submitted.</p>
              <div className="overdue-chips">
                {cb.overdueStores.map(s => <span key={s} className="overdue-chip">{s}</span>)}
              </div>
            </div>
          </div>
        );
        if (!passed && hrs <= 48 && cb.storesPending > 0) return (
          <div className="deadline-banner" style={{ marginBottom: 16 }}>
            <span className="deadline-banner-icon">⏰</span>
            <p><strong>Submission deadline</strong> in {hrs < 1 ? '<1' : hrs}h — {cb.storesPending} store{cb.storesPending > 1 ? 's' : ''} still pending.</p>
          </div>
        );
        return null;
      })()}

      {/* ── Repeat discrepancy alert ── */}
      {hotspots.length > 0 && (
        <div className="banner banner-over" style={{ marginBottom: 20 }}>
          <span className="banner-icon">🔁</span>
          <div>
            <strong>Repeat Shortages Detected</strong>
            <p style={{ marginTop: 4, fontSize: 13 }}>
              {hotspots.length} material{hotspots.length !== 1 ? 's' : ''} appeared as shortages in multiple cycles.{' '}
              Top: <strong>{hotspots[0].materialCode}</strong> at {hotspots[0].storeName} — {hotspots[0].batchCount} cycles, −{hotspots[0].totalShortage} units lost.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-blue">
          <div className="kpi-icon"><IcoStores /></div>
          <div className="kpi-label">Total Stores</div>
          <div className="kpi-value">{totalStores}</div>
          <div className="kpi-sub">active locations</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-icon"><IcoCheckCircle /></div>
          <div className="kpi-label">Stores Submitted</div>
          <div className="kpi-value">{cb?.storesSubmitted ?? 0}</div>
          <div className="kpi-sub">{submittedPct}% of network</div>
        </div>
        <div className="kpi-card kpi-amber">
          <div className="kpi-icon"><IcoClock /></div>
          <div className="kpi-label">Stores Pending</div>
          <div className="kpi-value">{cb?.storesPending ?? 0}</div>
          <div className="kpi-sub">awaiting submission</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-icon"><IcoTrendDown /></div>
          <div className="kpi-label">Shortage Items</div>
          <div className="kpi-value">{ns.shortageItems}</div>
          <div className="kpi-sub">Sold &lt; SYS</div>
        </div>
        <div className="kpi-card kpi-teal">
          <div className="kpi-icon"><IcoCheck /></div>
          <div className="kpi-label">Matched Items</div>
          <div className="kpi-value">{ns.matchedItems}</div>
          <div className="kpi-sub">Sold = SYS</div>
        </div>
        <div className="kpi-card kpi-purple">
          <div className="kpi-icon"><IcoTrendUp /></div>
          <div className="kpi-label">Excess Items</div>
          <div className="kpi-value">{ns.excessItems}</div>
          <div className="kpi-sub">Sold &gt; SYS</div>
        </div>
      </div>

      {/* ── Main content grid ── */}
      <div className="dash-grid">

        {/* Store Risk Scorecard */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <IcoBarChart />
              Store Risk Scorecard
            </span>
            {cb && (
              <span className="card-header-meta">
                {new Date(cb.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>

          {storeScorecard.length === 0 ? (
            <div className="empty"><div className="empty-icon">📭</div><p>No inventory data available yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Risk</th>
                    <th>Shortage Rate</th>
                    <th>Shortages</th>
                    <th>Top Remark</th>
                    <th>Status</th>
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
                        {/* Clickable drill-down to inventory filtered by store + shortage */}
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
                            {store.isOverdue ? 'Overdue' : 'Pending'}
                          </span>
                        )}
                        {store.status === 'NO_DATA' && <span className="badge badge-no-data">No Data</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Shrinkage Hotspots */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <IcoHotspot />
              Shrinkage Hotspots
            </span>
          </div>
          <p className="card-sub">Items with shortages across multiple recent cycles</p>

          {hotspots.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">✅</div>
              <p>No recurring shortages detected.</p>
            </div>
          ) : (
            <div className="hotspot-list">
              {hotspots.map((h, i) => (
                <div key={i} className={`hotspot-item-premium${i === 0 ? ' hotspot-top' : ''}`}>
                  <div className={`hotspot-rank-badge${i === 0 ? ' rank-1' : i === 1 ? ' rank-2' : ''}`}>
                    {i + 1}
                  </div>
                  <div className="hotspot-body">
                    <div className="hotspot-material-name">{h.materialCode}</div>
                    <div className="hotspot-store-line">
                      <span className="hotspot-store-tag">{h.storeName}</span>
                      {h.dominantRemark && <span className="hotspot-remark-tag">· {h.dominantRemark}</span>}
                    </div>
                  </div>
                  <div className="hotspot-stats">
                    <span className="hotspot-cycles-badge">{h.batchCount} cycles</span>
                    <span className="hotspot-units-lost">−{h.totalShortage}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
