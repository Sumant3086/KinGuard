import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

function rateColor(rate) {
  if (rate >= 20) return { background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 700 };
  if (rate >= 5)  return { background: 'rgba(245,158,11,0.15)', color: '#d97706', fontWeight: 700 };
  return { background: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 600 };
}

export default function AdminAnalytics() {
  const [trendsData, setTrendsData] = useState(null);
  const [batches, setBatches]       = useState([]);
  const [batchA, setBatchA]         = useState('');
  const [batchB, setBatchB]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [trends, batchList] = await Promise.all([
        adminApi.getTrends(6),
        adminApi.getBatches(),
      ]);
      setTrendsData(trends);
      setBatches(batchList);
      if (batchList.length >= 2) {
        setBatchA(batchList[1].id.toString());
        setBatchB(batchList[0].id.toString());
      }
    } catch (e) {
      setError('Failed to load analytics data.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <AdminLayout title="Performance Analytics">
      <div className="loading"><div className="spinner" />Loading analytics…</div>
    </AdminLayout>
  );

  if (error) return (
    <AdminLayout title="Performance Analytics">
      <div className="alert alert-error">{error}</div>
    </AdminLayout>
  );

  const { batches: trendBatches, series } = trendsData || { batches: [], series: [] };

  // Compute network totals per batch
  const networkTotals = trendBatches.map(b => {
    let total = 0, shortages = 0, unitsLost = 0;
    series.forEach(s => {
      const d = s.data.find(x => x.batchId === b.id);
      if (d) { total += d.totalItems; shortages += d.shortageCount; unitsLost += d.totalUnitsLost; }
    });
    const rate = total > 0 ? Math.round((shortages / total) * 1000) / 10 : 0;
    return { batchId: b.id, totalItems: total, shortageCount: shortages, shortageRate: rate, totalUnitsLost: Math.round(unitsLost * 10) / 10 };
  });

  // Batch comparison
  const batchAId = parseInt(batchA);
  const batchBId = parseInt(batchB);
  const comparisonRows = series.map(s => {
    const dA = s.data.find(x => x.batchId === batchAId);
    const dB = s.data.find(x => x.batchId === batchBId);
    return { storeId: s.storeId, storeName: s.storeName, dA, dB };
  }).filter(r => r.dA || r.dB);

  const batchADate = batches.find(b => b.id === batchAId);
  const batchBDate = batches.find(b => b.id === batchBId);

  return (
    <AdminLayout title="Performance Analytics">
      <div className="page-header">
        <div>
          <h2>Performance Analytics</h2>
          <p>Shortage trends and cycle-over-cycle comparisons across the network</p>
        </div>
      </div>

      {/* Trend Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20h20"/>
            </svg>
            Cycle-over-Cycle Trends — Last {trendBatches.length} Cycles
          </span>
        </div>
        {trendBatches.length === 0 ? (
          <div className="empty"><div className="empty-icon">📊</div><p>No cycle data available yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="scorecard">
              <thead>
                <tr>
                  <th>Store</th>
                  {trendBatches.map(b => (
                    <th key={b.id} style={{ textAlign: 'center', minWidth: 90, fontSize: 11 }}>
                      {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map(s => (
                  <tr key={s.storeId}>
                    <td className="store-col">{s.storeName}</td>
                    {trendBatches.map(b => {
                      const d = s.data.find(x => x.batchId === b.id);
                      return (
                        <td key={b.id} style={{ textAlign: 'center', padding: '6px 8px' }}>
                          {d ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              ...rateColor(d.shortageRate),
                            }}>
                              {d.shortageRate}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Network total row */}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td className="store-col" style={{ fontWeight: 700 }}>Network Total</td>
                  {networkTotals.map(n => (
                    <td key={n.batchId} style={{ textAlign: 'center', padding: '6px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        ...rateColor(n.shortageRate),
                      }}>
                        {n.shortageRate}%
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--t3)' }}>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.3)', marginRight: 4 }} />
            ≥20% High Risk
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(245,158,11,0.3)', marginRight: 4 }} />
            ≥5% Watch
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(16,185,129,0.25)', marginRight: 4 }} />
            &lt;5% On Track
          </span>
        </div>
      </div>

      {/* Store Deep Dive / Batch Comparison */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Store Deep Dive — Cycle Comparison
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="filter-group">
            <span className="filter-label">Cycle A (Earlier)</span>
            <select value={batchA} onChange={e => setBatchA(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Select cycle…</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
          <div style={{ color: 'var(--t3)', fontWeight: 700, paddingBottom: 4 }}>vs</div>
          <div className="filter-group">
            <span className="filter-label">Cycle B (Later)</span>
            <select value={batchB} onChange={e => setBatchB(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Select cycle…</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {batchA && batchB && comparisonRows.length > 0 ? (
          <div className="table-wrap">
            <table className="scorecard">
              <thead>
                <tr>
                  <th>Store</th>
                  <th style={{ textAlign: 'center' }}>
                    {batchADate ? new Date(batchADate.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Cycle A'} — Shortages
                  </th>
                  <th style={{ textAlign: 'center' }}>
                    {batchBDate ? new Date(batchBDate.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Cycle B'} — Shortages
                  </th>
                  <th style={{ textAlign: 'center' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(r => {
                  const countA = r.dA?.shortageCount ?? 0;
                  const countB = r.dB?.shortageCount ?? 0;
                  const delta = countB - countA;
                  return (
                    <tr key={r.storeId}>
                      <td className="store-col">{r.storeName}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.dA ? countA : '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.dB ? countB : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.dA && r.dB ? (
                          <span style={{
                            fontWeight: 700,
                            color: delta > 0 ? 'var(--red)' : delta < 0 ? '#059669' : 'var(--t2)',
                          }}>
                            {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><div className="empty-icon">📊</div><p>Select two cycles to compare.</p></div>
        )}
      </div>
    </AdminLayout>
  );
}
