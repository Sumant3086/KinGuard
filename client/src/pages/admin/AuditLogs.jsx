import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadLogs();
  }, [limit]);

  async function loadLogs() {
    try {
      const data = await adminApi.getAuditLogs(null, limit);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <h2>Audit Logs</h2>

      <div className="card">
        <div className="filters">
          <label>
            Show:
            <select value={limit} onChange={(e) => setLimit(e.target.value)}>
              <option value="50">50 logs</option>
              <option value="100">100 logs</option>
              <option value="200">200 logs</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="card">
          <p>No audit logs found.</p>
        </div>
      ) : (
        <div className="card">
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
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.user ? log.user.name : 'System'}</td>
                  <td>{log.action}</td>
                  <td>{log.entityType || '-'}</td>
                  <td>{log.entityId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
