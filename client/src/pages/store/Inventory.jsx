import { useState, useEffect } from 'react';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';

export default function StoreInventory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadInventory();
  }, [search, statusFilter]);

  async function loadInventory() {
    try {
      setLoading(true);
      const data = await storeApi.getInventory(search, statusFilter);
      setRecords(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(record) {
    setEditingId(record.id);
    setEditValues({
      physicalQuantity: record.physicalQuantity ?? '',
      remarks: record.remarks ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit(id) {
    try {
      await storeApi.updateRecord(id, editValues.physicalQuantity, editValues.remarks);
      setEditingId(null);
      setEditValues({});
      loadInventory();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    }
  }

  async function handleSubmit() {
    const batchId = records[0]?.batchId;
    if (!batchId) {
      alert('No batch found');
      return;
    }

    if (!confirm('Are you sure you want to submit your inventory? This will mark all pending items as submitted.')) {
      return;
    }

    try {
      setSubmitting(true);
      await storeApi.submitInventory(batchId);
      alert('Inventory submitted successfully');
      loadInventory();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit inventory');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    try {
      const blob = await storeApi.downloadInventory();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to download inventory');
    }
  }

  const pendingCount = records.filter(r => r.status === 'PENDING').length;

  return (
    <StoreLayout>
      <h2>Inventory Reconciliation</h2>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="actions">
        {pendingCount > 0 && (
          <button onClick={handleSubmit} disabled={submitting} className="btn btn-success">
            {submitting ? 'Submitting...' : `Submit Inventory (${pendingCount} pending)`}
          </button>
        )}
        <button onClick={handleDownload} className="btn btn-primary">
          Download My Inventory
        </button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search materials..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SUBMITTED">Submitted</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : records.length === 0 ? (
        <div className="card">
          <p>No inventory records found.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>System Qty</th>
                  <th>Physical Qty</th>
                  <th>Difference</th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.materialCode}</td>
                    <td>{record.materialName}</td>
                    <td>{record.systemQuantity}</td>
                    <td>
                      {editingId === record.id ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValues.physicalQuantity}
                          onChange={(e) => setEditValues({ ...editValues, physicalQuantity: e.target.value })}
                          style={{ width: '100px' }}
                        />
                      ) : (
                        record.physicalQuantity ?? '-'
                      )}
                    </td>
                    <td>
                      {record.difference !== null ? (
                        <span className={
                          record.difference === 0 ? 'badge badge-matched' :
                          record.difference < 0 ? 'badge badge-shortage' :
                          'badge badge-excess'
                        }>
                          {record.difference}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {editingId === record.id ? (
                        <input
                          type="text"
                          value={editValues.remarks}
                          onChange={(e) => setEditValues({ ...editValues, remarks: e.target.value })}
                          style={{ width: '150px' }}
                        />
                      ) : (
                        record.remarks || '-'
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${record.status.toLowerCase()}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>
                      {editingId === record.id ? (
                        <>
                          <button onClick={() => saveEdit(record.id)} className="btn btn-success" style={{ marginRight: '5px', padding: '4px 8px', fontSize: '12px' }}>
                            Save
                          </button>
                          <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                            Cancel
                          </button>
                        </>
                      ) : record.status === 'PENDING' ? (
                        <button onClick={() => startEdit(record)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                          Edit
                        </button>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </StoreLayout>
  );
}
