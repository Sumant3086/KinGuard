import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

function RiskTag({ level }) {
  const cls = level === 'RED' ? 'risk-tag risk-high' : level === 'YELLOW' ? 'risk-tag risk-mid' : 'risk-tag risk-low';
  const label = level === 'RED' ? 'High Risk' : level === 'YELLOW' ? 'Watch' : 'Healthy';
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
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setData(await adminApi.getDashboard()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (loading) return (
    <AdminLayout title="Dashboard">
      <div className="loading"><div className="spinner" />Loading dashboard…</div>
    </AdminLayout>
  );

  if (!data) return (
    <AdminLayout title="Dashboard">
      <div className="alert alert-error">Failed to load dashboard data.</div>
    </AdminLayout>
  );

  const { totalStores, currentBatch: cb, storeScorecard, hotspots, networkSummary: ns } = data;
  const now = new Date();

  return (
    <AdminLayout title="Dashboard">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Overview of the current reconciliation cycle</p>
        </div>
      </div>

      {/* Deadline / overdue banner */}
      {cb?.submissionDeadline && (() => {
        const dl = new Date(cb.submissionDeadline);
        const passed = now > dl;
        const hrs = Math.round((dl - now) / 3600000);
        if (passed && cb.overdueStores?.length > 0) return (
          <div className="deadline-banner overdue">
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
          <div className="deadline-banner">
            <span className="deadline-banner-icon">⏰</span>
            <p><strong>Submission deadline</strong> in {hrs < 1 ? '<1' : hrs}h — {cb.storesPending} store{cb.storesPending > 1 ? 's' : ''} still pending.</p>
          </div>
        );
        return null;
      })()}

      {/* Network metrics */}
      <div className="metrics-row">
        {[
          { label: 'Total Stores',    value: totalStores,         cls: 'm-blue'   },
          { label: 'Stores Submitted',value: cb?.storesSubmitted ?? 0, cls: 'm-green'  },
          { label: 'Stores Pending',  value: cb?.storesPending   ?? 0, cls: 'm-amber'  },
          { label: 'Shortage Items',  value: ns.shortageItems,    cls: 'm-red'    },
          { label: 'Matched Items',   value: ns.matchedItems,     cls: ''         },
          { label: 'Excess Items',    value: ns.excessItems,      cls: 'm-violet' },
        ].map(m => (
          <div key={m.label} className={`metric-card ${m.cls}`}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        {/* Store Risk Scorecard */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Store Risk Scorecard
            </span>
            {cb && (
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>
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
                    <tr key={store.storeId}>
                      <td className="store-col">{store.storeName}</td>
                      <td><RiskTag level={store.riskLevel} /></td>
                      <td><ShortageBar rate={store.shortageRate} /></td>
                      <td style={{ fontWeight: 700 }}>{store.shortageCount}</td>
                      <td style={{ fontSize: 12, color: 'var(--t3)' }}>{store.topRemark || '—'}</td>
                      <td>
                        {store.status === 'SUBMITTED' && <span className="badge badge-submitted">Submitted</span>}
                        {store.status === 'PENDING'   && <span className={`badge ${store.isOverdue ? 'badge-shortage' : 'badge-pending'}`}>{store.isOverdue ? 'Overdue' : 'Pending'}</span>}
                        {store.status === 'NO_DATA'   && <span className="badge badge-no-data">No Data</span>}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
              Shrinkage Hotspots
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
            Items with shortages across multiple recent cycles
          </p>
          {hotspots.length === 0 ? (
            <div className="empty"><div className="empty-icon">✅</div><p>No recurring shortages detected.</p></div>
          ) : (
            <div className="hotspot-list">
              {hotspots.map((h, i) => (
                <div key={i} className="hotspot-row">
                  <div className="hotspot-num">{i + 1}</div>
                  <div className="hotspot-info">
                    <div className="hotspot-mat">{h.materialCode}</div>
                    <div className="hotspot-store">{h.storeName} · {h.dominantRemark || 'No remark'}</div>
                  </div>
                  <span className="hotspot-cycles">{h.batchCount} cycles</span>
                  <span className="hotspot-units">−{h.totalShortage}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
