import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const data = await adminApi.getDashboard();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <AdminLayout><div className="loading">Loading...</div></AdminLayout>;

  return (
    <AdminLayout>
      <h2>Admin Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Stores</h4>
          <div className="value">{stats.totalStores}</div>
        </div>
        <div className="stat-card">
          <h4>Stores Pending</h4>
          <div className="value">{stats.storesPending}</div>
        </div>
        <div className="stat-card">
          <h4>Stores Submitted</h4>
          <div className="value">{stats.storesSubmitted}</div>
        </div>
        <div className="stat-card">
          <h4>Total Records</h4>
          <div className="value">{stats.totalRecords}</div>
        </div>
        <div className="stat-card">
          <h4>Matched Items</h4>
          <div className="value">{stats.matchedItems}</div>
        </div>
        <div className="stat-card">
          <h4>Shortage Items</h4>
          <div className="value">{stats.shortageItems}</div>
        </div>
        <div className="stat-card">
          <h4>Excess Items</h4>
          <div className="value">{stats.excessItems}</div>
        </div>
      </div>
    </AdminLayout>
  );
}
