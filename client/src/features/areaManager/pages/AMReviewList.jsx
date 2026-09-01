import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AMLayout from '../layout/AMLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import { useToast } from '../../../shared/context/ToastContext';
import * as amApi from '../../../shared/api/amApi';
import { fmtDate } from '../../../shared/utils/dateUtils';

export default function AMReviewList() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast    = useToast();

  useEffect(() => {
    let live = true;
    amApi.getBatches()
      .then(d => { if (live) setBatches(d); })
      .catch(e => { console.error('AM batches:', e); if (live) toast.error('Could not load review cycles. Please refresh.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to check if a cycle can be approved (today or yesterday only)
  const canApprove = (inventoryDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const cycleDate = new Date(inventoryDate);
    cycleDate.setHours(0, 0, 0, 0);
    
    return cycleDate.getTime() === today.getTime() || cycleDate.getTime() === yesterday.getTime();
  };

  return (
    <AMLayout>
      <PageHeader title="Review Submissions" subtitle="All inventory cycles for your stores" />

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : batches.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
          No inventory cycles yet.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Desktop table */}
          <div className="table-wrap batch-table-desktop">
            <table>
              <thead>
                <tr>
                  <th>Cycle Date</th>
                  <th>Deadline</th>
                  <th style={{ textAlign: 'center' }}>Total Stores</th>
                  <th style={{ textAlign: 'center' }}>Pending Review</th>
                  <th style={{ textAlign: 'center' }}>Approved</th>
                  <th style={{ textAlign: 'center' }}>Returned</th>
                  <th style={{ textAlign: 'center' }}>Not Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => {
                  const isApprovalAvailable = canApprove(b.inventoryDate);
                  return (
                    <tr key={b.id} style={{ opacity: isApprovalAvailable ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 700 }}>
                        {fmtDate(b.inventoryDate, 'long')}
                        {!isApprovalAvailable && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>
                            (Approval locked)
                          </span>
                        )}
                      </td>
                      <td>{b.submissionDeadline ? fmtDate(b.submissionDeadline, 'time') : '—'}</td>
                      <td style={{ textAlign: 'center' }}>{b.totalStores}</td>
                      <td style={{ textAlign: 'center', color: '#d97706', fontWeight: b.pendingReview > 0 ? 700 : 400 }}>{b.pendingReview || '—'}</td>
                      <td style={{ textAlign: 'center', color: '#16a34a', fontWeight: b.approved > 0 ? 700 : 400 }}>{b.approved || '—'}</td>
                      <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: b.returned > 0 ? 700 : 400 }}>{b.returned || '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--tx3)' }}>{b.notSubmitted || '—'}</td>
                      <td>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.22)' }}
                          onClick={() => navigate(`/am/review/${b.id}`)}
                        >
                          {isApprovalAvailable ? 'Open →' : 'View Only →'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="batch-cards">
            {batches.map(b => {
              const isApprovalAvailable = canApprove(b.inventoryDate);
              return (
                <div key={b.id} className="batch-card" style={{ opacity: isApprovalAvailable ? 1 : 0.6 }}>
                  <div className="batch-card-top">
                    <span className="batch-card-date">{fmtDate(b.inventoryDate, 'long')}</span>
                    {!isApprovalAvailable && (
                      <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>
                        (Locked)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
                    {b.submissionDeadline ? `Deadline: ${fmtDate(b.submissionDeadline, 'time')}` : 'No deadline'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {b.pendingReview > 0 && <span style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>⏳ {b.pendingReview} pending</span>}
                    {b.approved > 0      && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✓ {b.approved} approved</span>}
                    {b.returned > 0      && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>↩ {b.returned} returned</span>}
                    {b.notSubmitted > 0  && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>◌ {b.notSubmitted} not submitted</span>}
                  </div>
                  <div className="batch-card-actions" style={{ gridTemplateColumns: '1fr', marginTop: 4 }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.22)' }}
                      onClick={() => navigate(`/am/review/${b.id}`)}
                    >
                      {isApprovalAvailable ? 'Open & Review →' : 'View Only →'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AMLayout>
  );
}
