import { useState, useEffect } from 'react';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';

export default function StoreDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const data = await storeApi.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <StoreLayout><div className="loading">Loading...</div></StoreLayout>;
  if (error) return <StoreLayout><div className="alert alert-error">{error}</div></StoreLayout>;
  if (!dashboard?.batch) {
    return (
      <StoreLayout>
        <div className="card">
          <h3>No Inventory Assigned</h3>
          <p>There are no inventory records assigned to your store yet.</p>
        </div>
      </StoreLayout>
    );
  }

  const { store, batch, stats } = dashboard;

  return (
    <StoreLayout>
      <h2>Store Dashboard</h2>

      <div className="card">
        <h3>Store Information</h3>
        <p><strong>Store Code:</strong> {store.storeCode}</p>
        <p><strong>Store Name:</strong> {store.storeName}</p>
        <p><strong>Inventory Date:</strong> {new Date(batch.inventoryDate).toLocaleDateString()}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Items</h4>
          <div className="value">{stats.totalItems}</div>
        </div>
        <div className="stat-card">
          <h4>Pending</h4>
          <div className="value">{stats.pendingItems}</div>
        </div>
        <div className="stat-card">
          <h4>Submitted</h4>
          <div className="value">{stats.submittedItems}</div>
        </div>
        <div className="stat-card">
          <h4>Matched</h4>
          <div className="value">{stats.matchedItems}</div>
        </div>
        <div className="stat-card">
          <h4>Shortage</h4>
          <div className="value">{stats.shortageItems}</div>
        </div>
        <div className="stat-card">
          <h4>Excess</h4>
          <div className="value">{stats.excessItems}</div>
        </div>
      </div>

      <div className="card">
        <h3>Next Steps</h3>
        {stats.pendingItems > 0 ? (
          <p>You have {stats.pendingItems} items pending verification. Go to Inventory to complete your stock check.</p>
        ) : (
          <p>All items have been submitted. You can download your inventory report from the Inventory page.</p>
        )}
      </div>
    </StoreLayout>
  );
}
