import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [inventoryDate, setInventoryDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  function resetForm() {
    setFile(null);
    setInventoryDate('');
    setSubmissionDeadline('');
    setPreview(null);
    setResult(null);
    setError('');
    // Clear the file input
    const input = document.getElementById('file-input');
    if (input) input.value = '';
  }

  async function handlePreview(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setPreviewing(true);
    try {
      const data = await adminApi.previewUpload(file, inventoryDate);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Preview failed. Check your file format.');
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

  function getRowClass(status) {
    if (status === 'valid')   return 'preview-row-valid';
    if (status === 'warning') return 'preview-row-warning';
    if (status === 'error')   return 'preview-row-error';
    return '';
  }

  const allErrors = preview && preview.statistics.errors === preview.totalRows;

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Upload Inventory File</h2>
          <p>Upload a master Excel or CSV file to start a new inventory cycle for all stores</p>
        </div>
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
              {uploading ? 'Publishing…' : '✓ Confirm & Publish to Stores'}
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
            <strong>Upload published successfully.</strong> Store managers can now begin counting.
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
    </AdminLayout>
  );
}
