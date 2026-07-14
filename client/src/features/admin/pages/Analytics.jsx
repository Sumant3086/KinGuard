import { useState, useEffect } from 'react';
import AdminLayout from '../layout/AdminLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { LoadingCard } from '../../../shared/components/ui/LoadingCard';
import * as adminApi from '../../../shared/api/adminApi';
import { fmtDate } from '../../../shared/utils/dateUtils';

/* ── Pure-SVG sparkline — no library needed ─────────────────────── */
function Sparkline({ values, width = 80, height = 28 }) {
  const safe = (values || []).filter(v => typeof v === 'number' && !isNaN(v));
  if (safe.length < 2) return null;
  const max = Math.max(...safe, 1);
  const pts = safe.map((v, i) => {
    const x = (i / (safe.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const last   = safe[safe.length - 1];
  const prev   = safe[safe.length - 2];
  const stroke = last > prev ? '#ef4444' : last < prev ? '#10b981' : '#64748b';

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {(() => {
        const parts = pts.split(' ');
        if (parts.length < 1) return null;
        const lastPt = parts[parts.length - 1].split(',');
        if (lastPt.length < 2) return null;
        return <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={stroke} />;
      })()}
    </svg>
  );
}

function rateColor(rate) {
  if (rate >= 20) return { background: 'rgba(239,68,68,0.15)',  color: 'var(--red)',  fontWeight: 700 };
  if (rate >= 5)  return { background: 'rgba(245,158,11,0.15)', color: '#d97706',     fontWeight: 700 };
  return               { background: 'rgba(16,185,129,0.12)',  color: '#059669',     fontWeight: 600 };
}

function TrendArrow({ values }) {
  if (!values || values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  if (last > prev) return <span style={{ color: 'var(--red)',   fontSize: 11, marginLeft: 4 }}>↑</span>;
  if (last < prev) return <span style={{ color: 'var(--green)', fontSize: 11, marginLeft: 4 }}>↓</span>;
  return                   <span style={{ color: 'var(--t4)',   fontSize: 11, marginLeft: 4 }}>→</span>;
}

const NoTrendIcon = (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
);

export default function Analytics() {
  const [trendsData, setTrendsData] = useState(null);
  const [batches, setBatches]       = useState([]);
  const [batchA, setBatchA]         = useState('');
  const [batchB, setBatchB]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [trends, batchList] = await Promise.all([
          adminApi.getTrends(8),
          adminApi.getBatches(),
        ]);
        if (!live) return;
        setTrendsData(trends);
        setBatches(batchList);
        if (batchList.length >= 2) {
          setBatchA(batchList[1].id.toString());
          setBatchB(batchList[0].id.toString());
        }
      } catch (e) {
        if (!live) return;
        setError(e.response?.data?.error || 'Failed to load analytics data.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  if (loading) return (
    <AdminLayout>
      <LoadingCard rows={2} heights={[100, 300]} />
    </AdminLayout>
  );

  if (error) return (
    <AdminLayout>
      <EmptyState
        variant="error"
        icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        title="Failed to Load Analytics"
        description={error}
        action={<button onClick={() => window.location.reload()} className="btn btn-primary">Retry</button>}
      />
    </AdminLayout>
  );

  const { batches: trendBatches, series } = trendsData || { batches: [], series: [] };

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

  const batchAId = batchA ? parseInt(batchA) : null;
  const batchBId = batchB ? parseInt(batchB) : null;
  const comparisonRows = (batchAId && batchBId) ? series
    .map(s => ({ storeId: s.storeId, storeName: s.storeName, dA: s.data.find(x => x.batchId === batchAId), dB: s.data.find(x => x.batchId === batchBId) }))
    .filter(r => r.dA || r.dB) : [];

  const batchADate = batchAId ? batches.find(b => b.id === batchAId) : null;
  const batchBDate = batchBId ? batches.find(b => b.id === batchBId) : null;

  return (
    <AdminLayout>
      <PageHeader
        title="Performance Analytics"
        subtitle="Shortage rate trends and cycle-over-cycle comparisons across the store network."
      />

      {/* Network sparkline summary */}
      {trendBatches.length >= 2 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Network Shortage Rate — Last {trendBatches.length} Cycles</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              Latest: <strong style={rateColor(networkRates[networkRates.length - 1])}>{networkRates[networkRates.length - 1]}%</strong>
              <TrendArrow values={networkRates} />
            </span>
          </div>
          <div className="analytics-network-row" style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
            <Sparkline values={networkRates} width={160} height={40} />
            <div className="analytics-cycle-badges" style={{ display: 'flex', gap: 20 }}>
              {networkTotals.map((n, i) => (
                <div key={n.batchId} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, ...rateColor(n.rate), padding: '2px 8px', borderRadius: 4 }}>
                    {n.rate}%
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 3 }}>
                    {fmtDate(trendBatches[i].inventoryDate, 'monthDay')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-store trend table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Store Trend — Shortage Rate per Cycle</span>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>↑ worsening · ↓ improving</span>
        </div>
        {trendBatches.length === 0 ? (
          <EmptyState
            icon={NoTrendIcon}
            title="No Trend Data"
            description="Complete at least 2 inventory cycles to see shortage rate trends."
          />
        ) : (
          <>
            {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
            <div className="analytics-trend-cards">
              {series.map(s => {
                const rates = trendBatches.map(b => { const d = s.data.find(x => x.batchId === b.id); return d ? d.shortageRate : null; });
                const filledRates = rates.filter(r => r !== null);
                const totalUnitsLost = s.data.reduce((sum, d) => sum + (d.totalUnitsLost || 0), 0);
                const latestRate = filledRates.length > 0 ? filledRates[filledRates.length - 1] : null;
                return (
                  <div key={s.storeId} className="analytics-trend-card">
                    <div className="analytics-trend-card-row1">
                      <span className="analytics-trend-store">{s.storeName}</span>
                      {totalUnitsLost > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                          −{Math.round(totalUnitsLost * 10) / 10} units
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sparkline values={filledRates} width={80} height={24} />
                      <TrendArrow values={filledRates} />
                      {latestRate !== null && (
                        <span style={{ fontSize: 14, fontWeight: 800, padding: '2px 9px', borderRadius: 5, ...rateColor(latestRate) }}>
                          {latestRate}% latest
                        </span>
                      )}
                    </div>
                    <div className="analytics-trend-cycles">
                      {trendBatches.map((b, i) => {
                        const d = s.data.find(x => x.batchId === b.id);
                        return d ? (
                          <span key={b.id} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, ...rateColor(d.shortageRate), fontWeight: 600 }}>
                            {fmtDate(b.inventoryDate, 'monthDay')}: {d.shortageRate}%
                          </span>
                        ) : (
                          <span key={b.id} style={{ fontSize: 10.5, color: 'var(--t4)', padding: '2px 5px' }}>
                            {fmtDate(b.inventoryDate, 'monthDay')}: —
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Network total card */}
              {series.length > 0 && (
                <div className="analytics-trend-card analytics-trend-card-total">
                  <div className="analytics-trend-card-row1">
                    <span className="analytics-trend-store" style={{ fontWeight: 800 }}>Network Total</span>
                    {networkRates.length > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: rateColor(networkRates[networkRates.length - 1]).color }}>
                        {networkRates[networkRates.length - 1]}% latest
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkline values={networkRates} width={80} height={24} />
                    <TrendArrow values={networkRates} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Desktop table (>768px) ────────────────────────────── */}
            <div className="table-wrap analytics-trend-desktop">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col" style={{ minWidth: 90 }}>Trend</th>
                    {trendBatches.map(b => (
                      <th scope="col" key={b.id} style={{ textAlign: 'center', minWidth: 80, fontSize: 11 }}>
                        {fmtDate(b.inventoryDate, 'monthDay')}
                      </th>
                    ))}
                    <th scope="col" style={{ textAlign: 'right', minWidth: 90 }}>Units Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map(s => {
                    const rates        = trendBatches.map(b => { const d = s.data.find(x => x.batchId === b.id); return d ? d.shortageRate : null; });
                    const filledRates  = rates.filter(r => r !== null);
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
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td style={{ fontWeight: 700 }}>Network Total</td>
                    <td><Sparkline values={networkRates} width={72} height={24} /></td>
                    {networkTotals.map(n => (
                      <td key={n.batchId} style={{ textAlign: 'center', padding: '6px 8px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, ...rateColor(n.rate) }}>
                          {n.rate}%
                        </span>
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--t2)', fontWeight: 600, paddingRight: 16 }}>
                      {(() => { const v = Math.round(networkTotals.reduce((s, n) => s + n.totalUnitsLost, 0) * 10) / 10; return v > 0 ? `−${v}` : '0'; })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 12, color: 'var(--t3)', flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.3)',  marginRight: 4 }} />≥20% High Risk</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(245,158,11,0.3)', marginRight: 4 }} />≥5% Watch</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(16,185,129,0.25)',marginRight: 4 }} />&lt;5% On Track</span>
        </div>
      </div>

      {/* Cycle-over-cycle comparison */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Cycle-over-Cycle Comparison</span>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="filter-group" style={{ flex: '1 1 140px' }}>
            <span className="filter-label">Cycle A (baseline)</span>
            <select value={batchA} onChange={e => setBatchA(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select cycle…</option>
              {batches.map(b => <option key={b.id} value={b.id.toString()}>{fmtDate(b.inventoryDate)}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 140px' }}>
            <span className="filter-label">Cycle B (compare)</span>
            <select value={batchB} onChange={e => setBatchB(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select cycle…</option>
              {batches.map(b => <option key={b.id} value={b.id.toString()}>{fmtDate(b.inventoryDate)}</option>)}
            </select>
          </div>
        </div>

        {batchA && batchB && batchA !== batchB && comparisonRows.length > 0 ? (
          <>
            {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
            <div className="analytics-comp-cards">
              {comparisonRows.map(r => {
                const rateA    = r.dA ? r.dA.shortageRate : null;
                const rateB    = r.dB ? r.dB.shortageRate : null;
                const delta    = rateA !== null && rateB !== null ? Math.round((rateB - rateA) * 10) / 10 : null;
                const improved = delta !== null && delta < 0;
                const worsened = delta !== null && delta > 0;
                return (
                  <div key={r.storeId} className="analytics-comp-card">
                    <div className="analytics-comp-store">{r.storeName}</div>
                    <div className="analytics-comp-row">
                      <div className="analytics-comp-cell">
                        <span className="analytics-comp-label">A — {batchADate ? fmtDate(batchADate.inventoryDate, 'monthDay') : '?'}</span>
                        {rateA !== null
                          ? <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 13, fontWeight: 700, ...rateColor(rateA) }}>{rateA}%</span>
                          : <span style={{ color: 'var(--t3)', fontSize: 13 }}>—</span>}
                      </div>
                      <div className="analytics-comp-cell">
                        <span className="analytics-comp-label">B — {batchBDate ? fmtDate(batchBDate.inventoryDate, 'monthDay') : '?'}</span>
                        {rateB !== null
                          ? <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 13, fontWeight: 700, ...rateColor(rateB) }}>{rateB}%</span>
                          : <span style={{ color: 'var(--t3)', fontSize: 13 }}>—</span>}
                      </div>
                      <div className="analytics-comp-cell">
                        <span className="analytics-comp-label">Change</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: improved ? 'var(--green)' : worsened ? 'var(--red)' : 'var(--t3)' }}>
                          {delta !== null ? (delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}pp`) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table (>768px) ────────────────────────────── */}
            <div className="table-wrap analytics-comp-desktop">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col" style={{ textAlign: 'center' }}>A — {batchADate ? fmtDate(batchADate.inventoryDate, 'monthDay') : '?'}</th>
                    <th scope="col" style={{ textAlign: 'center' }}>B — {batchBDate ? fmtDate(batchBDate.inventoryDate, 'monthDay') : '?'}</th>
                    <th scope="col" style={{ textAlign: 'center' }}>Δ Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map(r => {
                    const rateA    = r.dA ? r.dA.shortageRate : null;
                    const rateB    = r.dB ? r.dB.shortageRate : null;
                    const delta    = rateA !== null && rateB !== null ? Math.round((rateB - rateA) * 10) / 10 : null;
                    const improved = delta !== null && delta < 0;
                    const worsened = delta !== null && delta > 0;
                    return (
                      <tr key={r.storeId}>
                        <td style={{ fontWeight: 600 }}>{r.storeName}</td>
                        <td style={{ textAlign: 'center' }}>
                          {rateA !== null
                            ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, ...rateColor(rateA) }}>{rateA}%</span>
                            : <span style={{ color: 'var(--t3)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {rateB !== null
                            ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, ...rateColor(rateB) }}>{rateB}%</span>
                            : <span style={{ color: 'var(--t3)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: improved ? 'var(--green)' : worsened ? 'var(--red)' : 'var(--t3)' }}>
                          {delta !== null ? (delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}pp`) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--t3)', padding: '20px 0' }}>
            Select two different cycles above to compare store performance.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
