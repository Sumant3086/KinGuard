import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import { useToast } from '../../context/ToastContext';

const ACTION_LABELS = {
  LOGIN:                    'Signed in',
  LOGOUT:                   'Signed out',
  UPLOAD_INVENTORY:         'Uploaded inventory batch',
  CREATE_USER:              'Created user',
  UPDATE_USER:              'Updated user',
  DELETE_USER:              'Deleted user',
  CREATE_STORE:             'Created store',
  UPDATE_STORE:             'Updated store',
  DELETE_STORE:             'Deleted store',
  FORCE_DELETE_STORE:       'Force-deleted store',
  SUBMIT_INVENTORY:         'Store submitted inventory',
  OVERRIDE_RECORD:          'Admin override on record',
  UNLOCK_STORE_SUBMISSION:  'Unlocked store submission',
  UPDATE_BATCH_DEADLINE:    'Updated batch deadline',
  GRANT_STORE_EXTENSION:    'Granted store deadline extension',
  DELETE_BATCH:             'Deleted inventory cycle',
  DOWNLOAD_REPORT:          'Downloaded reconciliation report',
  DOWNLOAD_BATCH_EXPORT:    'Downloaded batch export',
  DOWNLOAD_ADMIN_INVENTORY_EXPORT: 'Downloaded inventory export',
};

function humanize(action) {
  if (!action) return '—';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

const ACTION_COLOR = {
  LOGIN:   'badge-matched',  LOGOUT:  'badge-inactive',
  CREATE:  'badge-active',   UPDATE:  'badge-warning',
  DELETE:  'badge-shortage', FORCE:   'badge-shortage',
  UPLOAD:  'badge-submitted', SUBMIT: 'badge-submitted',
  DOWNLOAD:'badge-excess',   OVERRIDE:'badge-repeat',
  UNLOCK:  'badge-warning',  GRANT:   'badge-pending',
};

function badgeClass(action) {
  const upper = (action || '').toUpperCase();
  const key = Object.keys(ACTION_COLOR).find(k => upper.startsWith(k) || upper.includes(k));
  return key ? ACTION_COLOR[key] : 'badge-inactive';
}

export default function AdminAuditLogs() {
  const toast = useToast();
  const [limit, setLimit]     = useState(100);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    setLogs([]);
    adminApi.getAuditLogs(null, limit)
      .then(data => setLogs(data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [limit]);

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleExport() {
    try {
      const blob = await adminApi.exportAuditLogs({ limit: 2000 });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `KinGuard_ActivityLog_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Export failed');
    }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Activity Log</h2>
          <p>Complete immutable trail of every admin and store action</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
          <button onClick={handleExport} className="btn btn-success">↓ Export Excel</button>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading activity log…</div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>No activity found.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                  const isExpanded  = expanded.has(log.id);
                  return (
                    <>
                      <tr key={log.id} style={{ cursor: hasMetadata ? 'pointer' : 'default' }} onClick={() => hasMetadata && toggleExpand(log.id)}>
                        <td style={{ textAlign: 'center', color: 'var(--t4)', fontSize: 10 }}>
                          {hasMetadata ? (isExpanded ? '▼' : '▶') : ''}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
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
                        <td>
                          <span className={`badge ${badgeClass(log.action)}`}>{humanize(log.action)}</span>
                        </td>
                        <td style={{ color: 'var(--t3)', fontSize: 12 }}>{log.entityType || '—'}</td>
                        <td style={{ color: 'var(--t4)', fontSize: 12, fontFamily: 'monospace' }}>{log.entityId ?? '—'}</td>
                      </tr>
                      {isExpanded && hasMetadata && (
                        <tr key={`${log.id}-meta`} style={{ background: 'var(--surface-2)' }}>
                          <td />
                          <td colSpan={5} style={{ padding: '8px 16px 12px' }}>
                            <pre style={{
                              fontSize: 11, color: 'var(--t3)', margin: 0,
                              fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              maxHeight: 200, overflowY: 'auto',
                            }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--t3)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Showing {logs.length} entries · Click a row to expand metadata</span>
            <span>Actions with ▶ contain additional details</span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
