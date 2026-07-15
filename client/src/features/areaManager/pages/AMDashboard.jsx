import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import * as amApi from '../../../shared/api/amApi';
import { fmtDate } from '../../../shared/utils/dateUtils';

export default function AMDashboard() {
  const [data, setData]     = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([amApi.getDashboard(), amApi.getBatches()])
      .then(([d, b]) => { setData(d); setBatches(b); })
      .catch(e => console.error('AM dashboard:', e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AMLayout>
      <PageHeader title="Area Manager Dashboard" subtitle="Overview of your stores and pending reviews" />

      {loading ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)' }}>Loading…</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            {[
              { label: 'Stores Under You',   value: data?.storeCount    ?? 0, color: '#3b82f6' },
              { label: 'Pending Your Review', value: data?.pendingReview ?? 0, color: '#d97706' },
              { label: 'Approved by You',     value: data?.approved      ?? 0, color: '#16a34a' },
              { label: 'Returned to Stores',  value: data?.returned      ?? 0, color: '#dc2626' },
            ].map(k => (
              <div key={k.label} className="kpi-card" style={{ borderLeft: `3px solid ${k.color}` }}>
                <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Cycles list */}
          <div className="card">
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--red-border)', fontWeight: 700, fontSize: 14, color: 'var(--tx1)' }}>
              Inventory Cycles
            </div>
            {batches.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>No cycles yet.</div>
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
                      <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                        {b.pendingReview > 0 && <span style={{ marginRight: 10, color: '#d97706' }}>⏳ {b.pendingReview} pending review</span>}
                        {b.approved > 0      && <span style={{ marginRight: 10, color: '#16a34a' }}>✓ {b.approved} approved</span>}
                        {b.returned > 0      && <span style={{ marginRight: 10, color: '#dc2626' }}>↩ {b.returned} returned</span>}
                        {b.notSubmitted > 0  && <span style={{ color: 'var(--tx3)' }}>◌ {b.notSubmitted} not yet submitted</span>}
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
        </>
      )}
    </AMLayout>
  );
}
