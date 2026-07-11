import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../layout/AdminLayout';
import ConfirmModal from '../../../shared/components/ui/ConfirmModal';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { useDownload } from '../../../shared/hooks/useDownload';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDateTZ } from '../../../shared/utils/dateUtils';

const KINSHASA_TZ = 'Africa/Kinshasa';

function formatKinshasaDate(dateStr) {
  return fmtDateTZ(dateStr + 'T00:00:00', KINSHASA_TZ, 'long');
}

function getRowClass(status) {
  if (status === 'valid')   return 'preview-row-valid';
  if (status === 'warning') return 'preview-row-warning';
  if (status === 'error')   return 'preview-row-error';
  return '';
}

export default function Upload() {
  const navigate = useNavigate();
  const toast = useToast();
  const { downloading: dlTemplate, download: downloadTemplate } = useDownload();

  const [file, setFile]                         = useState(null);
  const [inventoryDate, setInventoryDate]       = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [uploading, setUploading]               = useState(false);
  const [previewing, setPreviewing]             = useState(false);
  const [result, setResult]                     = useState(null);
  const [preview, setPreview]                   = useState(null);
  const [error, setError]                       = useState('');

  // Date range warning confirmation
  const [showDateConfirm, setShowDateConfirm]     = useState(false);
  const [dateConfirmAction, setDateConfirmAction] = useState(null);
  const [dateWarningMessage, setDateWarningMessage] = useState('');

  // Duplicate batch confirmation
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateMessage, setDuplicateMessage]         = useState('');

  const fileInputRef = useRef(null);

  /** Warn if the date is suspiciously far in the past or future. Returns false if blocked. */
  function validateDate(dateStr, action) {
    if (!dateStr) return true;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((new Date(dateStr) - todayStart) / 86_400_000);
    if (daysDiff < -90) {
      setDateWarningMessage(`The inventory date you selected is ${Math.abs(daysDiff)} days in the past (${formatKinshasaDate(dateStr)}). This seems quite old. Do you want to proceed?`);
      setDateConfirmAction(() => action);
      setShowDateConfirm(true);
      return false;
    }
    if (daysDiff > 30) {
      setDateWarningMessage(`The inventory date you selected is ${daysDiff} days in the future (${formatKinshasaDate(dateStr)}). This seems too far ahead. Do you want to proceed?`);
      setDateConfirmAction(() => action);
      setShowDateConfirm(true);
      return false;
    }
    return true;
  }

  function resetForm() {
    setFile(null);
    setInventoryDate('');
    setSubmissionDeadline('');
    setPreview(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearUploadedFile() {
    setFile(null);
    setInventoryDate('');
    setSubmissionDeadline('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function executePreview() {
    setPreviewing(true);
    try {
      setPreview(await adminApi.previewUpload(file, inventoryDate));
    } catch (err) {
      setError(err.response?.data?.error || 'Preview failed. Check your file format.');
      toast.error(err.response?.data?.error || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  function handlePreview(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!validateDate(inventoryDate, () => executePreview())) return;
    executePreview();
  }

  async function handleConfirmUpload() {
    setError('');
    setUploading(true);
    try {
      setResult(await adminApi.uploadInventory(file, inventoryDate, submissionDeadline));
      setPreview(null);
      clearUploadedFile();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.warning === 'duplicate_batch') {
        setDuplicateMessage(err.response.data.message || 'A batch for this date already exists.');
        setShowDuplicateConfirm(true);
      } else {
        setError(err.response?.data?.error || 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleForceUpload() {
    setShowDuplicateConfirm(false);
    setUploading(true);
    try {
      setResult(await adminApi.uploadInventoryForce(file, inventoryDate, submissionDeadline));
      setPreview(null);
      clearUploadedFile();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed.');
      setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const handleDownloadTemplate = () =>
    downloadTemplate(adminApi.downloadSampleTemplate, 'KinGuard_InventoryTemplate.xlsx');

  const allErrors = preview && preview.statistics.valid === 0;

  return (
    <AdminLayout>
      <PageHeader
        title="Upload Inventory File"
        subtitle="Upload a master Excel or CSV file to start a new inventory cycle for all plants"
        actions={
          <button onClick={handleDownloadTemplate} disabled={dlTemplate} className="btn btn-secondary">
            {dlTemplate ? '…' : '↓'} Download Template
          </button>
        }
      />

      {/* Step 1 — File selection */}
      {!preview && !result && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 18 }}>Step 1 — Select file and date</h3>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handlePreview}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="upload-inv-date">Inventory Date</label>
                <input id="upload-inv-date" type="date" value={inventoryDate} onChange={e => setInventoryDate(e.target.value)} required disabled={previewing} />
              </div>
              <div className="form-group">
                <label htmlFor="upload-deadline">Submission Deadline <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input id="upload-deadline" type="date" value={submissionDeadline} onChange={e => setSubmissionDeadline(e.target.value)} disabled={previewing} min={inventoryDate} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="file-input">Excel or CSV File</label>
              <input id="file-input" ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => {
                const f = e.target.files[0];
                if (f && f.size > 10 * 1024 * 1024) { setError('File exceeds the 10 MB limit'); e.target.value = ''; return; }
                setFile(f); setError('');
              }} required disabled={previewing} />
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
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Step 2 — Review file before publishing</h3>
              <p style={{ color: 'var(--t3)', fontSize: 13 }}>
                {preview.fileName} · {preview.totalRows} rows · {fmtDateTZ(preview.inventoryDate + 'T00:00:00', KINSHASA_TZ, 'long')}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={resetForm} disabled={uploading}>← Start over</button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {preview.statistics.valid} valid</div>
            <div style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ {preview.statistics.warnings} warnings</div>
            <div style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {preview.statistics.errors} errors</div>
            {preview.showingPartial && <div style={{ color: 'var(--t3)', fontSize: 12 }}>(showing first {preview.previewRows} of {preview.totalRows} rows)</div>}
          </div>

          {allErrors && <div className="alert alert-error" style={{ marginBottom: 16 }}>All rows have errors. Fix the file and start over.</div>}

          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 16 }}>
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th scope="col">#</th><th scope="col">Plant</th><th scope="col">Store</th><th scope="col">Material Code</th>
                  <th scope="col">Description</th><th scope="col" style={{ textAlign: 'right' }}>Sys Qty</th>
                  <th scope="col">Status</th><th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map(row => (
                  <tr key={row.row} className={getRowClass(row.status)}>
                    <td>{row.row}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.storeCode}</td>
                    <td>{row.storeName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.materialCode}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.materialName}</td>
                    <td style={{ textAlign: 'right' }}>{row.systemQuantity}</td>
                    <td><span className={`badge badge-${row.status}`}>{row.status}</span></td>
                    <td style={{ color: 'var(--t3)' }}>{row.message !== 'OK' ? row.message : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleConfirmUpload} disabled={uploading || allErrors}>
              {uploading ? 'Publishing…' : '✓ Confirm & Publish to Plants'}
            </button>
            <button className="btn btn-secondary" onClick={resetForm} disabled={uploading}>Cancel</button>
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
              <div style={{ fontSize: 22, fontWeight: 800, color: result.rejectedRows > 0 ? 'var(--red)' : 'var(--t3)' }}>{result.rejectedRows}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Rejected rows</div>
            </div>
          </div>

          {result.autoCreatedUsers?.length > 0 && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r)', marginBottom: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: '#d97706', marginTop: 2 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
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

          {result.errors?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 13 }}>Rejected rows (first 10):</strong>
              <ul style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)', paddingLeft: 20 }}>
                {result.errors.slice(0, 10).map((err, idx) => <li key={idx}>Row {err.row}: {err.error}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={resetForm}>Upload another file</button>
            <button className="btn btn-secondary" onClick={() => navigate('/admin/batches')}>View in Cycles →</button>
          </div>
        </div>
      )}

      {/* Date confirmation */}
      <ConfirmModal
        isOpen={showDateConfirm}
        onClose={() => setShowDateConfirm(false)}
        onConfirm={() => { setShowDateConfirm(false); if (dateConfirmAction) dateConfirmAction(); }}
        title="Date Confirmation"
        message={dateWarningMessage}
        confirmText="Proceed Anyway"
        cancelText="Cancel"
        type="warning"
      />

      {/* Duplicate batch confirmation */}
      <ConfirmModal
        isOpen={showDuplicateConfirm}
        onClose={() => setShowDuplicateConfirm(false)}
        onConfirm={handleForceUpload}
        title="Duplicate Cycle Detected"
        message={`${duplicateMessage} Do you want to upload anyway and create a second batch?`}
        confirmText="Upload Anyway"
        cancelText="Cancel"
        type="warning"
      />
    </AdminLayout>
  );
}
