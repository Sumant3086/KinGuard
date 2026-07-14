import { useState, useEffect, Fragment } from 'react';
import AdminLayout from '../layout/AdminLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDateTime } from '../../../shared/utils/dateUtils';

const ACTION_LABELS = {
  LOGIN:                           'User signed in',
  LOGOUT:                          'User signed out',
  UPLOAD_INVENTORY:                'Inventory cycle uploaded',
  CREATE_USER:                     'User account created',
  UPDATE_USER:                     'User account updated',
  DELETE_USER:                     'User account deleted',
  CREATE_STORE:                    'Store created',
  UPDATE_STORE:                    'Store updated',
  DELETE_STORE:                    'Store deleted',
  FORCE_DELETE_STORE:              'Store force-deleted',
  SUBMIT_INVENTORY:                'Inventory submitted by store',
  OVERRIDE_RECORD:                 'Admin override applied',
  UNLOCK_STORE_SUBMISSION:         'Store submission unlocked',
  UPDATE_BATCH_DEADLINE:           'Cycle deadline updated',
  GRANT_STORE_EXTENSION:           'Deadline extension granted',
  DELETE_BATCH:                    'Inventory cycle deleted',
  DOWNLOAD_REPORT:                 'Reconciliation report downloaded',
  DOWNLOAD_BATCH_EXPORT:           'Cycle export downloaded',
  DOWNLOAD_ADMIN_INVENTORY_EXPORT: 'Inventory export downloaded',
};

const ACTION_COLOR = {
  LOGIN:    'badge-matched',   LOGOUT:   'badge-inactive',
  CREATE:   'badge-active',    UPDATE:   'badge-warning',
  DELETE:   'badge-shortage',  FORCE:    'badge-shortage',
  UPLOAD:   'badge-submitted', SUBMIT:   'badge-submitted',
  DOWNLOAD: 'badge-excess',    OVERRIDE: 'badge-repeat',
  UNLOCK:   'badge-warning',   GRANT:    'badge-pending',
};

function humanize(action) {
  if (!action) return '—';
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function badgeClass(action) {
  const upper = (action || '').toUpperCase();
  const key = Object.keys(ACTION_COLOR).find(k => upper.startsWith(k) || upper.includes(k));
  return key ? ACTION_COLOR[key] : 'badge-inactive';
}

const EmptyIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="56" height="56">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="2"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="16" x2="12" y2="16"/>
  </svg>
);

export default function AuditLogs() {
  const toast = useToast();
  const { downloading, download } = useDownload();
  const [limit,    setLimit]    = useState(100);
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLogs([]);
    adminApi.getAuditLogs(null, limit)
      .then(data  => { if (live) setLogs(data); })
      .catch(e    => { if (live) toast.error(e.response?.data?.error || 'Failed to load activity logs. Please try again.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [limit]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const handleExport = () =>
    download(adminApi.exportAuditLogs, `KinGuard_ActivityLog_${new Date().toISOString().split('T')[0]}.xlsx`, { limit: 2000 });

  const limitSelect = (
    <select
      value={limit}
      onChange={e => setLimit(Number(e.target.value))}
      style={{ padding: '7px 11px', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--t1)', background: 'var(--surface)' }}
    >
      <option value="50">50 entries</option>
      <option value="100">100 entries</option>
      <option value="250">250 entries</option>
      <option value="500">500 entries</option>
    </select>
  );

  return (
    <AdminLayout>
      <PageHeader
        title="Activity Log"
        subtitle="A complete, immutable audit trail of all system actions."
        actions={<>{limitSelect}<button onClick={handleExport} disabled={downloading} className="btn btn-success">↓ Export Excel</button></>}
      />

      {loading ? (
        <SkeletonTable rows={8} cols={5} />
      ) : logs.length === 0 ? (
        <div className="card">
          <EmptyState icon={EmptyIcon} title="No Activity Found" description="No log entries found for the selected limit." />
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {/* ── Mobile cards (≤768px) ─────────────────────────────── */}
          <div className="audit-cards" style={{ padding: 12 }}>
            {logs.map(log => {
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
              const isExpanded  = expanded.has(log.id);
              return (
                <div key={log.id} className="audit-card">
                  <div className="audit-card-top">
                    <span className={`badge ${badgeClass(log.action)}`}>{humanize(log.action)}</span>
                    {hasMetadata && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleExpand(log.id)}
                        style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                      >
                        {isExpanded ? '▼ Hide' : '▶ Details'}
                      </button>
                    )}
                  </div>
                  <div className="audit-card-by">
                    {log.user
                      ? <span><strong>{log.user.name}</strong> <span style={{ fontFamily: 'monospace', fontSize: 10 }}>({log.user.employeeId})</span></span>
                      : <span style={{ color: 'var(--t4)' }}>System</span>
                    }
                    {' · '}
                    <span style={{ fontSize: 11 }}>{fmtDateTime(log.createdAt)}</span>
                  </div>
                  {isExpanded && hasMetadata && (
                    <pre className="audit-card-meta">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (>768px) ────────────────────────────── */}
          <div className="table-container audit-table-desktop">
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 24 }} />
                  <th scope="col">Time</th>
                  <th scope="col">User</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                  <th scope="col">ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                  const isExpanded  = expanded.has(log.id);
                  return (
                    <Fragment key={log.id}>
                      <tr style={{ cursor: hasMetadata ? 'pointer' : 'default' }} onClick={() => hasMetadata && toggleExpand(log.id)}>
                        <td style={{ textAlign: 'center', color: 'var(--t4)', fontSize: 10 }}>
                          {hasMetadata ? (isExpanded ? '▼' : '▶') : ''}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {fmtDateTime(log.createdAt)}
                        </td>
                        <td>
                          {log.user ? (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{log.user.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace' }}>{log.user.employeeId}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--t4)', fontSize: 12 }}>System</span>
                          )}
                        </td>
                        <td><span className={`badge ${badgeClass(log.action)}`}>{humanize(log.action)}</span></td>
                        <td style={{ color: 'var(--t3)', fontSize: 12 }}>{log.entityType || '—'}</td>
                        <td style={{ color: 'var(--t4)', fontSize: 12, fontFamily: 'monospace' }}>{log.entityId ?? '—'}</td>
                      </tr>
                      {isExpanded && hasMetadata && (
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td />
                          <td colSpan={5} style={{ padding: '8px 16px 12px' }}>
                            <pre style={{ fontSize: 11, color: 'var(--t3)', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--t3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Showing {logs.length} entries · Click any row to expand metadata</span>
            <span>Actions with ▶ contain additional details</span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
