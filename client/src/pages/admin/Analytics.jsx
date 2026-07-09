import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

/* ── Pure-SVG sparkline — no library needed ─────────────────────── */
function Sparkline({ values, width = 80, height = 28 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  // Color based on last value trend
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const stroke = last > prev ? '#ef4444' : last < prev ? '#10b981' : '#64748b';

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Last value dot */}
      {(() => {
        const last_pt = pts.split(' ').pop().split(',');
        return (
          <circle cx={last_pt[0]} cy={last_pt[1]} r="2.5" fill={stroke} />
        );
      })()}
    </svg>
  );
}

function rateColor(rate) {
  if (rate >= 20) return { background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 700 };
  if (rate >= 5)  return { background: 'rgba(245,158,11,0.15)', color: '#d97706', fontWeight: 700 };
  return { background: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 600 };
}

function TrendArrow({ values }) {
  if (!values || values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (last > prev) return <span style={{ color: 'var(--red)', fontSize: 11, marginLeft: 4 }}>↑</span>;
  if (last < prev) return <span style={{ color: 'var(--green)', fontSize: 11, marginLeft: 4 }}>↓</span>;
  return <span style={{ color: 'var(--t4)', fontSize: 11, marginLeft: 4 }}>→</span>;
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
        adminApi.getTrends(8),
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
    <AdminLayout>
      <div className="loading"><div className="spinner" />Loading analytics…</div>
    </AdminLayout>
  );

  if (error) return (
    <AdminLayout>
      <div className="alert alert-error">{error}</div>
    </AdminLayout>
  );

  const { batches: trendBatches, series } = trendsData || { batches: [], series: [] };

  // Network totals per batch
  const networkTotals = trendBatches.map(b => {
    let total = 0, shortages = 0, unitsLost = 0;
    series.forEach(s => {
      const d = s.data.find(x => x.batchId === b.id);
      if (d) { total += d.totalItems; shortages += d.shortageCount; unitsLost += d.totalUnitsLost; }
    });
    const rate = total > 0 ? Math.round((shortages / total) * 1000) / 10 : 0;
    return { batchId: b.id, rate, totalItems: total, shortageCount: shortages, totalUnitsLost: Math.round(unitsLost * 10) / 10 };
  });

  const networkRates = networkTotals.map(n => n.rate);

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
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Performance Analytics</h2>
          <p>Shortage rate trends and cycle-over-cycle comparisons across the network</p>
        </div>
      </div>

      {/* ── Network sparkline summary ── */}
      {trendBatches.length >= 2 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Network Shortage Rate — Last {trendBatches.length} Cycles</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              Latest: <strong style={rateColor(networkRates[networkRates.length - 1])}>{networkRates[networkRates.length - 1]}%</strong>
              <TrendArrow values={networkRates} />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
            <Sparkline values={networkRates} width={200} height={48} />
            <div style={{ display: 'flex', gap: 32 }}>
              {networkTotals.map((n, i) => (
                <div key={n.batchId} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, ...rateColor(n.rate), padding: '2px 8px', borderRadius: 4 }}>
                    {n.rate}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 3 }}>
                    {new Date(trendBatches[i].inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Per-store trend table with sparklines ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Store Trend — Shortage Rate per Cycle</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>↑ worsening · ↓ improving</span>
        </div>
        {trendBatches.length === 0 ? (
          <div className="empty"><div className="empty-icon">📊</div><p>No cycle data yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="scorecard">
              <thead>
                <tr>
                  <th>Store</th>
                  <th style={{ minWidth: 90 }}>Trend</th>
                  {trendBatches.map(b => (
                    <th key={b.id} style={{ textAlign: 'center', minWidth: 80, fontSize: 11 }}>
                      {new Date(b.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', minWidth: 90 }}>Units Lost</th>
                </tr>
              </thead>
              <tbody>
                {series.map(s => {
                  const rates = trendBatches.map(b => {
                    const d = s.data.find(x => x.batchId === b.id);
                    return d ? d.shortageRate : null;
                  });
                  const filledRates = rates.filter(r => r !== null);
                  const totalUnitsLost = s.data.reduce((sum, d) => sum + (d.totalUnitsLost || 0), 0);
                  return (
                    <tr key={s.storeId}>
                      <td style={{ fontWeight: 600, minWidth: 130 }}>{s.storeName}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Sparkline values={filledRates} width={72} height={24} />
                          <TrendArrow values={filledRates} />
                        </div>
                      </td>
                      {trendBatches.map(b => {
                        const d = s.data.find(x => x.batchId === b.id);
                        return (
                          <td key={b.id} style={{ textAlign: 'center', padding: '6px 8px' }}>
                            {d ? (
                              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, ...rateColor(d.shortageRate) }}>
                                {d.shortageRate}%
                              </span>
                            ) : (
                              <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right', fontSize: 12, color: totalUnitsLost > 0 ? 'var(--red)' : 'var(--t3)', fontWeight: totalUnitsLost > 0 ? 600 : 400, paddingRight: 16 }}>
                        {totalUnitsLost > 0 ? `−${Math.round(totalUnitsLost * 10) / 10}` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {/* Network row */}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 700 }}>Network Total</td>
                  <td>
                    <Sparkline values={networkRates} width={72} height={24} />
                  </td>
                  {networkTotals.map(n => (
                    <td key={n.batchId} style={{ textAlign: 'center', padding: '6px 8px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, ...rateColor(n.rate) }}>
                        {n.rate}%
                      </span>
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--t2)', fontWeight: 600, paddingRight: 16 }}>
                    −{Math.round(networkTotals.reduce((s, n) => s + n.totalUnitsLost, 0) * 10) / 10}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--t3)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.3)', marginRight: 4 }} />≥20% High Risk</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(245,158,11,0.3)', marginRight: 4 }} />≥5% Watch</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(16,185,129,0.25)', marginRight: 4 }} />&lt;5% On Track</span>
        </div>
      </div>

      {/* ── Cycle-over-cycle comparison ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Cycle-over-Cycle Comparison</span>
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
                    {batchADate ? new Date(batchADate.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Cycle A'}
                  </th>
                  <th style={{ textAlign: 'center' }}>
                    {batchBDate ? new Date(batchBDate.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Cycle B'}
                  </th>
                  <th style={{ textAlign: 'center' }}>Shortage Δ</th>
                  <th style={{ textAlign: 'center' }}>Rate Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(r => {
                  const countA = r.dA?.shortageCount ?? 0;
                  const countB = r.dB?.shortageCount ?? 0;
                  const rateA  = r.dA?.shortageRate  ?? 0;
                  const rateB  = r.dB?.shortageRate  ?? 0;
                  const deltaCount = countB - countA;
                  const deltaRate  = Math.round((rateB - rateA) * 10) / 10;
                  return (
                    <tr key={r.storeId}>
                      <td style={{ fontWeight: 600 }}>{r.storeName}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r.dA ? <span style={{ ...rateColor(rateA), display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{rateA}% ({countA})</span> : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.dB ? <span style={{ ...rateColor(rateB), display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{rateB}% ({countB})</span> : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: deltaCount > 0 ? 'var(--red)' : deltaCount < 0 ? 'var(--green)' : 'var(--t2)' }}>
                        {r.dA && r.dB ? (deltaCount > 0 ? `+${deltaCount}` : deltaCount === 0 ? '—' : deltaCount) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: deltaRate > 0 ? 'var(--red)' : deltaRate < 0 ? 'var(--green)' : 'var(--t2)' }}>
                        {r.dA && r.dB ? (deltaRate > 0 ? `+${deltaRate}%` : deltaRate === 0 ? '—' : `${deltaRate}%`) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><div className="empty-icon">📊</div><p>Select two cycles above to compare stores.</p></div>
        )}
      </div>
    </AdminLayout>
  );
}
