import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import ConfirmModal from '../../components/ConfirmModal';
import * as adminApi from '../../api/admin';
import { useToast } from '../../context/ToastContext';

export default function AdminUpload() {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [inventoryDate, setInventoryDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [dateConfirmAction, setDateConfirmAction] = useState(null);
  const [dateWarningMessage, setDateWarningMessage] = useState('');

  // Kinshasa timezone formatting
  const formatKinshasaDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      timeZone: 'Africa/Kinshasa'
    });
  };

  // Date validation
  const validateDate = (dateStr, action) => {
    if (!dateStr) return true;
    
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daysDiff = Math.floor((selectedDate - today) / (1000 * 60 * 60 * 24));
    
    // Warn if more than 90 days in past
    if (daysDiff < -90) {
      setDateWarningMessage(
        `The inventory date you selected is ${Math.abs(daysDiff)} days in the past (${formatKinshasaDate(dateStr)}). This seems quite old. Do you want to proceed?`
      );
      setDateConfirmAction(() => action);
      setShowDateConfirm(true);
      return false;
    }
    
    // Warn if more than 30 days in future
    if (daysDiff > 30) {
      setDateWarningMessage(
        `The inventory date you selected is ${daysDiff} days in the future (${formatKinshasaDate(dateStr)}). This seems too far ahead. Do you want to proceed?`
      );
      setDateConfirmAction(() => action);
      setShowDateConfirm(true);
      return false;
    }
    
    return true;
  };

  function resetForm() {
    setFile(null);
    setInventoryDate('');
    setSubmissionDeadline('');
    setPreview(null);
    setResult(null);
    setError('');
    const input = document.getElementById('file-input');
    if (input) input.value = '';
  }

  async function handlePreview(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    
    // Validate date first
    const isValid = validateDate(inventoryDate, () => executePreview());
    if (!isValid) return; // Wait for confirmation
    
    executePreview();
  }

  async function executePreview() {
    setPreviewing(true);
    try {
      const data = await adminApi.previewUpload(file, inventoryDate);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Preview failed. Check your file format.');
      toast.error(err.response?.data?.error || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmUpload() {
    setError('');
    setUploading(true);
    try {
      const data = await adminApi.uploadInventory(file, inventoryDate, submissionDeadline);
      setResult(data);
      setPreview(null);
      setFile(null);
      setInventoryDate('');
      setSubmissionDeadline('');
      const input = document.getElementById('file-input');
      if (input) input.value = '';
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.warning === 'duplicate_batch') {
        const { message } = err.response.data;
        if (confirm(`⚠️ ${message}\n\nUpload anyway?`)) {
          try {
            const data = await adminApi.uploadInventoryForce(file, inventoryDate, submissionDeadline);
            setResult(data);
            setPreview(null);
            setFile(null);
            setInventoryDate('');
            setSubmissionDeadline('');
            const input = document.getElementById('file-input');
            if (input) input.value = '';
          } catch (forceErr) {
            toast.error(forceErr.response?.data?.error || 'Upload failed.');
            setError(forceErr.response?.data?.error || 'Upload failed.');
          }
        }
      } else {
        setError(err.response?.data?.error || 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await adminApi.downloadSampleTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'KinGuard_InventoryTemplate.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to download template');
    }
  }

  function getRowClass(status) {
    if (status === 'valid')   return 'preview-row-valid';
    if (status === 'warning') return 'preview-row-warning';
    if (status === 'error')   return 'preview-row-error';
    return '';
  }

  const allErrors = preview && preview.statistics.errors > 0
    && preview.statistics.valid === 0 && preview.statistics.warnings === 0;

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Upload Inventory File</h2>
          <p>Upload a master Excel or CSV file to start a new inventory cycle for all plants</p>
        </div>
        <button onClick={handleDownloadTemplate} className="btn btn-secondary">
          ↓ Download Template
        </button>
      </div>

      {/* Step 1 — File selection */}
      {!preview && !result && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 18 }}>Step 1 — Select file and date</h3>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          <form onSubmit={handlePreview}>
            <div className="form-row">
              <div className="form-group">
                <label>Inventory Date</label>
                <input
                  type="date"
                  value={inventoryDate}
                  onChange={(e) => setInventoryDate(e.target.value)}
                  required
                  disabled={previewing}
                />
              </div>
              <div className="form-group">
                <label>
                  Submission Deadline{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                </label>
                <input
                  type="date"
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  disabled={previewing}
                  min={inventoryDate}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Excel or CSV File</label>
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { setFile(e.target.files[0]); setError(''); }}
                required
                disabled={previewing}
              />
              <small style={{ color: 'var(--t3)', fontSize: 11, marginTop: 4, display: 'block' }}>
                Max 10 MB. Required columns: Plant (Store Code), Material, Material Description, System Stock.
              </small>
            </div>
            <button type="submit" className="btn btn-primary" disabled={previewing || !file}>
              {previewing ? 'Validating file…' : 'Validate File →'}
            </button>
          </form>
        </div>
      )}

      {/* Step 2 — Preview */}
      {preview && !result && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                Step 2 — Review file before publishing
              </h3>
              <p style={{ color: 'var(--t3)', fontSize: 13 }}>
                {preview.fileName} · {preview.totalRows} rows ·{' '}
                {new Date(preview.inventoryDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={resetForm} disabled={uploading}>
              ← Start over
            </button>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>
          )}

          {/* Summary row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--green)', fontWeight: 700 }}>
              ✓ {preview.statistics.valid} valid
            </div>
            <div style={{ color: 'var(--amber)', fontWeight: 700 }}>
              ⚠ {preview.statistics.warnings} warnings
            </div>
            <div style={{ color: 'var(--red)', fontWeight: 700 }}>
              ✗ {preview.statistics.errors} errors
            </div>
            {preview.showingPartial && (
              <div style={{ color: 'var(--t3)', fontSize: 12 }}>
                (showing first {preview.previewRows} of {preview.totalRows} rows)
              </div>
            )}
          </div>

          {allErrors && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              All rows have errors. Fix the file and start over.
            </div>
          )}

          {/* Preview table */}
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 16 }}>
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Plant</th>
                  <th>Store</th>
                  <th>Material Code</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Sys Qty</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row) => (
                  <tr key={row.row} className={getRowClass(row.status)}>
                    <td>{row.row}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.storeCode}</td>
                    <td>{row.storeName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.materialCode}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.materialName}
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.systemQuantity}</td>
                    <td>
                      <span className={`badge badge-${row.status}`}>{row.status}</span>
                    </td>
                    <td style={{ color: 'var(--t3)' }}>{row.message !== 'OK' ? row.message : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={handleConfirmUpload}
              disabled={uploading || allErrors}
            >
              {uploading ? 'Publishing…' : '✓ Confirm & Publish to Plants'}
            </button>
            <button className="btn btn-secondary" onClick={resetForm} disabled={uploading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Result */}
      {result && (
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <strong>Upload published successfully.</strong> Plant managers can now begin counting.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{result.totalRows}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Total rows</div>
            </div>
            <div style={{ padding: '12px 16px', background: 'var(--green-bg)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{result.successfulRows}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Published</div>
            </div>
            <div style={{ padding: '12px 16px', background: result.rejectedRows > 0 ? 'var(--red-bg)' : 'var(--surface-2)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: result.rejectedRows > 0 ? 'var(--red)' : 'var(--t3)' }}>
                {result.rejectedRows}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Rejected rows</div>
            </div>
          </div>

          {/* Auto-created pending users notice */}
          {result.autoCreatedUsers && result.autoCreatedUsers.length > 0 && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r)', marginBottom: 16 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13, color: '#d97706' }}>
                  {result.autoCreatedUsers.length} new plant account{result.autoCreatedUsers.length !== 1 ? 's' : ''} pending approval
                </strong>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '4px 0 8px' }}>
                  A login account was automatically created for each new plant found in this file ({result.autoCreatedUsers.map(u => u.storeCode).join(', ')}). Go to User Management to approve them and get their login credentials.
                </p>
                <button className="btn btn-sm" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706', border: '1px solid rgba(217,119,6,0.28)' }} onClick={() => navigate('/admin/users')}>
                  Go to User Management →
                </button>
              </div>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 13 }}>Rejected rows (first 10):</strong>
              <ul style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)', paddingLeft: 20 }}>
                {result.errors.slice(0, 10).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={resetForm}>
              Upload another file
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/admin/batches')}>
              View in Cycles →
            </button>
          </div>
        </div>
      )}

      {/* ── Date Confirmation Modal ── */}
      <ConfirmModal
        isOpen={showDateConfirm}
        onClose={() => setShowDateConfirm(false)}
        onConfirm={() => {
          setShowDateConfirm(false);
          if (dateConfirmAction) dateConfirmAction();
        }}
        title="Date Confirmation"
        message={dateWarningMessage}
        confirmText="Proceed Anyway"
        cancelText="Cancel"
        type="warning"
      />
    </AdminLayout>
  );
}
