import { useState, useEffect, useRef, useCallback } from 'react';
import StoreLayout from '../../components/StoreLayout';
import * as storeApi from '../../api/store';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function StoreInventory() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editedRecords, setEditedRecords] = useState({});
  const [savingRecords, setSavingRecords] = useState(new Set());
  const [savedRecords, setSavedRecords] = useState(new Set());
  const [errorRecords, setErrorRecords] = useState(new Map());
  const [submitting, setSubmitting] = useState(false);
  const debounceTimers = useRef({});

  // WebSocket connection
  const token = localStorage.getItem('token');
  const { connected, on, off } = useWebSocket(token);

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    loadInventory();
  }, [search, statusFilter, selectedBatch]);

  // WebSocket event listeners
  useEffect(() => {
    if (!connected) return;

    const handleInventoryUpdate = (updated) => {
      console.log('[WebSocket] Received inventory update:', updated);
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
    };

    const handleInventoryBulkUpdate = (data) => {
      console.log('[WebSocket] Received bulk update:', data);
      // Refresh inventory to get latest state
      loadInventory();
    };

    const handleInventorySubmitted = (data) => {
      console.log('[WebSocket] Inventory submitted:', data);
      // Refresh inventory to show submitted status
      loadInventory();
    };

    on('inventoryUpdate', handleInventoryUpdate);
    on('inventoryBulkUpdate', handleInventoryBulkUpdate);
    on('inventorySubmitted', handleInventorySubmitted);

    return () => {
      off('inventoryUpdate', handleInventoryUpdate);
      off('inventoryBulkUpdate', handleInventoryBulkUpdate);
      off('inventorySubmitted', handleInventorySubmitted);
    };
  }, [connected]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, []);

  async function loadBatches() {
    try {
      const data = await storeApi.getBatches();
      setBatches(data);
      // Auto-select the latest batch (first in list)
      if (data.length > 0) {
        setSelectedBatch(data[0].id.toString());
      }
    } catch (err) {
      console.error('Failed to load batches:', err);
    }
  }

  async function loadInventory() {
    try {
      setLoading(true);
      const data = await storeApi.getInventory(search, statusFilter, selectedBatch);
      setRecords(data);
      // Clear edit states when reloading
      setEditedRecords({});
      setSavingRecords(new Set());
      setSavedRecords(new Set());
      setErrorRecords(new Map());
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

    // Clear saved/error state for this record
    setSavedRecords(prev => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
    setErrorRecords(prev => {
      const next = new Map(prev);
      next.delete(recordId);
      return next;
    });

    // Autosave after 700ms
    debouncedSave(recordId);
  }

  const debouncedSave = useCallback((recordId) => {
    // Clear existing timer for this record
    if (debounceTimers.current[recordId]) {
      clearTimeout(debounceTimers.current[recordId]);
    }

    // Set new timer
    debounceTimers.current[recordId] = setTimeout(() => {
      saveRecord(recordId);
    }, 700);
  }, [editedRecords]);

  async function saveRecord(recordId) {
    const edits = editedRecords[recordId];
    if (!edits) return;

    // Mark as saving
    setSavingRecords(prev => new Set(prev).add(recordId));
    setErrorRecords(prev => {
      const next = new Map(prev);
      next.delete(recordId);
      return next;
    });

    try {
      const updated = await storeApi.updateRecord(
        recordId,
        edits.physicalQuantity,
        edits.remarks
      );

      // Update the record in local state with server response
      setRecords(prev => prev.map(r => r.id === parseInt(recordId) ? updated : r));

      // Mark as saved
      setSavedRecords(prev => new Set(prev).add(recordId));
      setSavingRecords(prev => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });

      // Remove from edited records
      setEditedRecords(prev => {
        const next = { ...prev };
        delete next[recordId];
        return next;
      });

      // Clear saved indicator after 2 seconds
      setTimeout(() => {
        setSavedRecords(prev => {
          const next = new Set(prev);
          next.delete(recordId);
          return next;
        });
      }, 2000);
    } catch (err) {
      setSavingRecords(prev => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
      setErrorRecords(prev => new Map(prev).set(recordId, err.response?.data?.error || 'Save failed'));
    }
  }

  function getFieldValue(record, field) {
    // Return edited value if exists, otherwise original value
    if (editedRecords[record.id] && editedRecords[record.id][field] !== undefined) {
      return editedRecords[record.id][field];
    }
    return record[field] ?? '';
  }

  function getRecordState(recordId) {
    if (savingRecords.has(recordId)) return 'saving';
    if (savedRecords.has(recordId)) return 'saved';
    if (errorRecords.has(recordId)) return 'error';
    if (editedRecords[recordId]) return 'unsaved';
    return null;
  }

  function getStateLabel(recordId) {
    const state = getRecordState(recordId);
    if (state === 'saving') return { text: 'Saving...', color: '#3b82f6' };
    if (state === 'saved') return { text: '✓ Saved', color: '#10b981' };
    if (state === 'error') return { text: '✗ ' + errorRecords.get(recordId), color: '#ef4444' };
    if (state === 'unsaved') return { text: 'Unsaved', color: '#f59e0b' };
    return null;
  }

  async function handleSubmit() {
    const batchId = records[0]?.batchId;
    if (!batchId) {
      alert('No batch found');
      return;
    }

    // Check for unsaved changes
    if (Object.keys(editedRecords).length > 0) {
      alert('Please wait for all changes to save before submitting');
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
  const isSaving = savingRecords.size > 0;

  return (
    <StoreLayout>
      <h2>Inventory Reconciliation</h2>

      {error && <div className="alert alert-error">{error}</div>}

      {hasUnsavedChanges && (
        <div className="alert alert-warning">
          You have unsaved changes. Changes will auto-save after 0.7 seconds of inactivity.
        </div>
      )}

      <div className="actions">
        {pendingCount > 0 && (
          <button 
            onClick={handleSubmit} 
            disabled={submitting || hasUnsavedChanges || isSaving} 
            className="btn btn-success"
            title={hasUnsavedChanges || isSaving ? 'Wait for all changes to save' : ''}
          >
            {submitting ? 'Submitting...' : `Submit Inventory (${pendingCount} pending)`}
          </button>
        )}
        <button onClick={handleDownload} className="btn btn-primary">
          Download My Inventory
        </button>
      </div>

      <div className="filters">
        <select 
          value={selectedBatch} 
          onChange={(e) => setSelectedBatch(e.target.value)}
          style={{ minWidth: '200px' }}
        >
          <option value="">All Batches</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {new Date(batch.inventoryDate).toLocaleDateString()} 
              {' '}({batch.pendingCount} pending, {batch.submittedCount} submitted)
            </option>
          ))}
        </select>
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
                  const stateLabel = getStateLabel(record.id);
                  
                  return (
                    <tr key={record.id}>
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
                            disabled={savingRecords.has(record.id)}
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
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={getFieldValue(record, 'remarks')}
                              onChange={(e) => updateField(record.id, 'remarks', e.target.value)}
                              placeholder="Type or select..."
                              style={{ width: '150px' }}
                              disabled={savingRecords.has(record.id)}
                            />
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateField(record.id, 'remarks', e.target.value);
                                  e.target.value = ''; // Reset dropdown
                                }
                              }}
                              disabled={savingRecords.has(record.id)}
                              style={{ width: '40px', padding: '4px' }}
                              title="Quick select remarks"
                            >
                              <option value="">▼</option>
                              <option value="Damaged items removed">Damaged items removed</option>
                              <option value="Stock expired">Stock expired</option>
                              <option value="Theft suspected">Theft suspected</option>
                              <option value="Counting error corrected">Counting error corrected</option>
                              <option value="Transfer to another store">Transfer to another store</option>
                              <option value="Display sample used">Display sample used</option>
                            </select>
                          </div>
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
                        {stateLabel && (
                          <span style={{ color: stateLabel.color, fontSize: '12px', fontWeight: 'bold' }}>
                            {stateLabel.text}
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
