import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import * as adminApi from '../../api/admin';

export default function AdminUpload() {
  const [file, setFile] = useState(null);
  const [inventoryDate, setInventoryDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !inventoryDate) {
      alert('Please select a file and inventory date');
      return;
    }

    try {
      setUploading(true);
      setResult(null);
      const data = await adminApi.uploadInventory(file, inventoryDate);
      setResult(data);
      setFile(null);
      setInventoryDate('');
      loadUploads();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminLayout>
      <h2>Upload Inventory</h2>

      <div className="card">
        <h3>Upload Master File</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Inventory Date</label>
            <input
              type="date"
              value={inventoryDate}
              onChange={(e) => setInventoryDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Excel or CSV File</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>

        {result && (
          <div className={`alert ${result.rejectedRows > 0 ? 'alert-info' : 'alert-success'}`} style={{ marginTop: '20px' }}>
            <h4>Upload Complete</h4>
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
