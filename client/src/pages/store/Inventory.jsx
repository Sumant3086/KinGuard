import { useState, useEffect } from 'react';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';

export default function StoreInventory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editedRecords, setEditedRecords] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInventory();
  }, [search, statusFilter]);

  async function loadInventory() {
    try {
      setLoading(true);
      const data = await storeApi.getInventory(search, statusFilter);
      setRecords(data);
      // Clear edited records when reloading
      setEditedRecords({});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }

  function updateField(recordId, field, value) {
    setEditedRecords(prev => ({
      ...prev,
      [recordId]: {
        ...prev[recordId],
        [field]: value
      }
    }));
  }

  function getFieldValue(record, field) {
    // Return edited value if exists, otherwise original value
    if (editedRecords[record.id] && editedRecords[record.id][field] !== undefined) {
      return editedRecords[record.id][field];
    }
    return record[field] ?? '';
  }

  async function saveAll() {
    const recordsToUpdate = Object.keys(editedRecords);
    if (recordsToUpdate.length === 0) {
      alert('No changes to save');
      return;
    }

    try {
      setSaving(true);
      let successCount = 0;
      let errorCount = 0;

      for (const recordId of recordsToUpdate) {
        try {
          const edits = editedRecords[recordId];
          await storeApi.updateRecord(
            recordId, 
            edits.physicalQuantity, 
            edits.remarks
          );
          successCount++;
        } catch (err) {
          console.error(`Failed to update record ${recordId}:`, err);
          errorCount++;
        }
      }

      if (errorCount === 0) {
        alert(`Successfully saved ${successCount} record(s)`);
      } else {
        alert(`Saved ${successCount} record(s), ${errorCount} failed`);
      }

      setEditedRecords({});
      loadInventory();
    } catch (err) {
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  function cancelAll() {
    if (Object.keys(editedRecords).length > 0) {
      if (confirm('Discard all unsaved changes?')) {
        setEditedRecords({});
      }
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
  const hasUnsavedChanges = Object.keys(editedRecords).length > 0;

  return (
    <StoreLayout>
      <h2>Inventory Reconciliation</h2>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="actions">
        {hasUnsavedChanges && (
          <>
            <button onClick={saveAll} disabled={saving} className="btn btn-success">
              {saving ? 'Saving...' : `Save All Changes (${Object.keys(editedRecords).length})`}
            </button>
            <button onClick={cancelAll} disabled={saving} className="btn btn-secondary">
              Cancel Changes
            </button>
          </>
        )}
        {pendingCount > 0 && (
          <button onClick={handleSubmit} disabled={submitting || hasUnsavedChanges} className="btn btn-success">
            {submitting ? 'Submitting...' : `Submit Inventory (${pendingCount} pending)`}
          </button>
        )}
        <button onClick={handleDownload} className="btn btn-primary">
          Download My Inventory
        </button>
      </div>

      {hasUnsavedChanges && (
        <div className="alert alert-warning">
          You have unsaved changes. Click "Save All Changes" to save or "Cancel Changes" to discard.
        </div>
      )}

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
                {records.map((record) => {
                  const isPending = record.status === 'PENDING';
                  const isEdited = editedRecords[record.id] !== undefined;
                  
                  return (
                    <tr key={record.id} className={isEdited ? 'edited-row' : ''}>
                      <td>{record.materialCode}</td>
                      <td>{record.materialName}</td>
                      <td>{record.systemQuantity}</td>
                      <td>
                        {isPending ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={getFieldValue(record, 'physicalQuantity')}
                            onChange={(e) => updateField(record.id, 'physicalQuantity', e.target.value)}
                            placeholder="Enter qty"
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
                        {isPending ? (
                          <input
                            type="text"
                            value={getFieldValue(record, 'remarks')}
                            onChange={(e) => updateField(record.id, 'remarks', e.target.value)}
                            placeholder="Optional notes"
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
                        {isEdited && (
                          <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 'bold' }}>
                            Modified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </StoreLayout>
  );
}
