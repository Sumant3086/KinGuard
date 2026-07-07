import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';
import * as cache from '../../api/cache';

const CACHE_TTL = 30_000; // 30 s
const cacheKey  = limit => `admin/audit-logs/${limit}`;

const actionColors = {
  LOGIN: 'badge-matched',
  LOGOUT: 'badge-inactive',
  UPLOAD: 'badge-submitted',
  SUBMIT: 'badge-submitted',
  UPDATE: 'badge-warning',
  CREATE: 'badge-active',
  DELETE: 'badge-error',
};

function getBadgeClass(action) {
  const key = Object.keys(actionColors).find(k => action?.toUpperCase().includes(k));
  return key ? actionColors[key] : 'badge-inactive';
}

export default function AdminAuditLogs() {
  const [limit, setLimit]   = useState(100);
  const [logs, setLogs]     = useState(() => cache.get(cacheKey(100)) ?? []);
  const [loading, setLoading] = useState(!cache.get(cacheKey(100)));

  useEffect(() => {
    const key = cacheKey(limit);
    const cached = cache.get(key);
    if (cached) {
      setLogs(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    adminApi.getAuditLogs(null, limit)
      .then(data => { cache.set(key, data, CACHE_TTL); setLogs(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Audit Logs</h2>
          <p>System activity trail for all users and actions</p>
        </div>
        <div className="filter-group">
          <span className="filter-label">Show</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{
              padding: '7px 11px', border: '1.5px solid var(--border)',
              borderRadius: 'var(--r)', fontSize: 13,
              color: 'var(--t1)', background: 'var(--surface)',
            }}
          >
            <option value="50">50 entries</option>
            <option value="100">100 entries</option>
            <option value="200">200 entries</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Loading logs…</div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>No audit logs found.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {log.user ? log.user.name : <span style={{ color: 'var(--t4)' }}>System</span>}
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>{log.entityType || '—'}</td>
                    <td style={{ color: 'var(--t4)', fontSize: 12, fontFamily: 'monospace' }}>{log.entityId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--t3)', background: 'var(--surface-2)' }}>
            Showing {logs.length} entries
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
