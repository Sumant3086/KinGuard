import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminUpload() {
  const [file, setFile] = useState(null);
  const [inventoryDate, setInventoryDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUploads();
  }, []);

  async function loadUploads() {
    try {
      const data = await adminApi.getUploads();
      setUploads(data);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview(e) {
    e.preventDefault();
    if (!file || !inventoryDate) {
      alert('Please select a file and inventory date');
      return;
    }

    try {
      setPreviewing(true);
      setResult(null);
      const data = await adminApi.previewUpload(file, inventoryDate);
      setPreview(data);
    } catch (err) {
      alert(err.response?.data?.error || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmUpload() {
    if (!file || !inventoryDate) {
      alert('Please select a file and inventory date');
      return;
    }

    if (!confirm(`Confirm upload of ${preview.totalRows} rows?\n\nValid: ${preview.statistics.valid}\nErrors: ${preview.statistics.errors}\nWarnings: ${preview.statistics.warnings}`)) {
      return;
    }

    try {
      setUploading(true);
      setResult(null);
      const data = await adminApi.uploadInventory(file, inventoryDate, submissionDeadline);
      setResult(data);
      setFile(null);
      setInventoryDate('');
      setSubmissionDeadline('');
      setPreview(null);
      loadUploads();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.warning === 'duplicate_batch') {
        const { message } = err.response.data;
        if (confirm(`⚠️ ${message}\n\nDo you want to upload anyway?`)) {
          try {
            const data = await adminApi.uploadInventoryForce(file, inventoryDate, submissionDeadline);
            setResult(data);
            setFile(null);
            setInventoryDate('');
            setSubmissionDeadline('');
            setPreview(null);
            loadUploads();
          } catch (forceErr) {
            alert(forceErr.response?.data?.error || 'Upload failed');
          }
        }
        return;
      }
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleCancelPreview() {
    setPreview(null);
  }

  function getRowClass(status) {
    if (status === 'valid') return 'preview-row-valid';
    if (status === 'warning') return 'preview-row-warning';
    if (status === 'error') return 'preview-row-error';
    return '';
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <h2>Upload Master Inventory File</h2>
          <p>Upload an Excel or CSV file to create a new inventory cycle for all stores</p>
        </div>
      </div>

      <div className="card">
        <h3>Select File</h3>
        <form onSubmit={handlePreview}>
          <div className="form-row">
            <div className="form-group">
              <label>Inventory Date</label>
              <input
                type="date"
                value={inventoryDate}
                onChange={(e) => setInventoryDate(e.target.value)}
                required
                disabled={previewing || uploading}
              />
            </div>
            <div className="form-group">
              <label>Submission Deadline <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                type="date"
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
                disabled={previewing || uploading}
                min={inventoryDate}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Excel or CSV File</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setFile(e.target.files[0]);
                setPreview(null);
                setResult(null);
              }}
              required
              disabled={previewing || uploading}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary" disabled={previewing || uploading || preview}>
              {previewing ? 'Validating...' : 'Preview Upload'}
            </button>
            {preview && (
              <>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleConfirmUpload}
                  disabled={uploading || preview.statistics.errors === preview.totalRows}
                >
                  {uploading ? 'Uploading...' : 'Confirm & Publish to Stores'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelPreview}
                  disabled={uploading}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>

        {preview && (
          <div className="alert alert-info" style={{ marginTop: '20px' }}>
            <h4>📋 Preview: {preview.fileName}</h4>
            <p><strong>Inventory Date:</strong> {new Date(preview.inventoryDate).toLocaleDateString()}</p>
            <p><strong>Total Rows:</strong> {preview.totalRows}</p>
            {preview.showingPartial && (
              <p style={{ color: '#f59e0b' }}><em>Showing first {preview.previewRows} rows (preview limit)</em></p>
            )}

            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', marginBottom: '10px' }}>
              <div style={{ color: '#10b981', fontWeight: 'bold' }}>
                ✓ Valid: {preview.statistics.valid}
              </div>
              <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                ⚠ Warnings: {preview.statistics.warnings}
              </div>
              <div style={{ color: '#ef4444', fontWeight: 'bold' }}>
                ✗ Errors: {preview.statistics.errors}
              </div>
            </div>

            {preview.statistics.errors === preview.totalRows && (
              <div className="alert alert-error" style={{ marginTop: '10px' }}>
                ❌ All rows have errors. Please fix the file and try again.
              </div>
            )}

            <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '15px' }}>
              <table style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Store Code</th>
                    <th>Store Name</th>
                    <th>Material Name</th>
                    <th>Material Description</th>
                    <th>System Qty</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row) => (
                    <tr key={row.row} className={getRowClass(row.status)}>
                      <td>{row.row}</td>
                      <td>{row.storeCode}</td>
                      <td>{row.storeName}</td>
                      <td>{row.materialCode}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.materialName}
                      </td>
                      <td>{row.systemQuantity}</td>
                      <td>
                        <span className={`badge badge-${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className={`alert ${result.rejectedRows > 0 ? 'alert-info' : 'alert-success'}`} style={{ marginTop: '20px' }}>
            <h4>✅ Upload successful! Stores can now begin counting.</h4>
            <p>Total Rows: {result.totalRows}</p>
            <p>Successful: {result.successfulRows}</p>
            <p>Rejected: {result.rejectedRows}</p>
            {result.errors && result.errors.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <strong>Errors:</strong>
                <ul>
                  {result.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>Row {err.row}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Upload History</h3>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : uploads.length === 0 ? (
          <p>No uploads yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Uploaded By</th>
                <th>Uploaded At</th>
                <th>Inventory Date</th>
                <th>Total Rows</th>
                <th>Successful</th>
                <th>Rejected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.originalFileName}</td>
                  <td>{upload.uploader.name}</td>
                  <td>{new Date(upload.uploadedAt).toLocaleString()}</td>
                  <td>{new Date(upload.inventoryDate).toLocaleDateString()}</td>
                  <td>{upload.totalRows}</td>
                  <td>{upload.successfulRows}</td>
                  <td>{upload.rejectedRows}</td>
                  <td>
                    <span className={`badge badge-${upload.status.toLowerCase()}`}>
                      {upload.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
