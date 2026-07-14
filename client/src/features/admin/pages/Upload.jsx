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
      setDateWarningMessage(`The selected date is ${Math.abs(daysDiff)} days in the past (${formatKinshasaDate(dateStr)}). Confirm to proceed.`);
      setDateConfirmAction(() => action);
      setShowDateConfirm(true);
      return false;
    }
    if (daysDiff > 30) {
      setDateWarningMessage(`The selected date is ${daysDiff} days in the future (${formatKinshasaDate(dateStr)}). Confirm to proceed.`);
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
    setError('');
    try {
      setPreview(await adminApi.previewUpload(file, inventoryDate));
    } catch (firstErr) {
      let lastErr = firstErr;
      // On 503 (server cold-start), retry once automatically after a short delay
      if (firstErr.response?.status === 503) {
        try {
          await new Promise(r => setTimeout(r, 2000));
          setPreview(await adminApi.previewUpload(file, inventoryDate));
          return;
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
      const msg = lastErr.response?.data?.error || 'Preview failed. Check your file format and try again.';
      setError(msg);
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
      let result;
      try {
        result = await adminApi.uploadInventory(file, inventoryDate, submissionDeadline);
      } catch (firstErr) {
        // On 503 (server cold-start), retry once automatically after a short delay
        if (firstErr.response?.status === 503) {
          await new Promise(r => setTimeout(r, 2000));
          result = await adminApi.uploadInventory(file, inventoryDate, submissionDeadline);
        } else {
          throw firstErr;
        }
      }
      setResult(result);
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
        subtitle="Upload a master file to create a new inventory cycle and assign inventory items to all stores."
        actions={
          <button onClick={handleDownloadTemplate} disabled={dlTemplate} className="btn btn-secondary">
            {dlTemplate ? '…' : '↓'} Download Template
          </button>
        }
      />

      {/* Step 1 — File selection */}
      {!preview && !result && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 18 }}>Step 1 — Select File and Date</h3>

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
                Max 10 MB · Required columns: Plant Code, Material, Material Description, System Stock.
              </small>
            </div>
            <button type="submit" className="btn btn-primary" disabled={previewing || !file}>
              {previewing ? 'Validating…' : 'Validate & Preview →'}
            </button>
            {previewing && (
              <div style={{ marginTop: 14 }}>
                <div className="progress-loader"><div className="progress-loader-bar" /></div>
                <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>Uploading and validating your file…</p>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Step 2 — Preview */}
      {preview && !result && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Step 2 — Review Before Publishing</h3>
              <p style={{ color: 'var(--t3)', fontSize: 13 }}>
                {preview.fileName} · {preview.totalRows} rows · {fmtDateTZ(preview.inventoryDate + 'T00:00:00', KINSHASA_TZ, 'long')}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={resetForm} disabled={uploading}>← Start over</button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {preview.statistics.valid} valid</div>
              <div style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ {preview.statistics.warnings} warnings</div>
              <div style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {preview.statistics.errors} errors</div>
            </div>
            {preview.showingPartial && (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                Showing first {preview.previewRows} of {preview.totalRows} rows
              </div>
            )}
          </div>

          {allErrors && <div className="alert alert-error" style={{ marginBottom: 16 }}>All rows contain errors. Correct the file and start over.</div>}

          {preview.showingPartial && !allErrors && (
            <div className="alert alert-info" style={{ marginBottom: 16, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: '#1e40af' }}>
              <strong>Preview showing first {preview.previewRows} rows only.</strong> All {preview.totalRows} rows will be validated and published when you confirm.
            </div>
          )}

          <div style={{ maxHeight: 360, overflowY: 'auto', overflowX: 'auto', marginBottom: 16 }}>
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
              {uploading ? 'Publishing…' : '✓ Confirm & Publish'}
            </button>
            <button className="btn btn-secondary" onClick={resetForm} disabled={uploading}>Cancel</button>
          </div>
          {uploading && (
            <div style={{ marginTop: 14 }}>
              <div className="progress-loader"><div className="progress-loader-bar" /></div>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
                Publishing cycle — processing rows, creating stores, and notifying managers. This can take a moment…
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Result */}
      {result && (
        <div className="card">
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            <strong>Inventory cycle published.</strong> Stores can now begin submitting their physical counts.
          </div>

          <div className="upload-result-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
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
                  {result.autoCreatedUsers.length} new store account{result.autoCreatedUsers.length !== 1 ? 's' : ''} pending approval
                </strong>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '4px 0 8px' }}>
                  A login account was automatically created for each new store found in this file ({result.autoCreatedUsers.map(u => u.storeCode).join(', ')}). Approve them in User Management to issue login credentials.
                </p>
                <button className="btn btn-sm" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706', border: '1px solid rgba(217,119,6,0.28)' }} onClick={() => navigate('/admin/users')}>
                  Go to User Management →
                </button>
              </div>
            </div>
          )}

          {/* Email notification status */}
          {(() => {
            const n = result.notifications;
            if (!n) return null;
            const noEmail = n.managersWithoutEmail || [];
            const hasFailures = n.emailsFailed > 0;
            const allFailed = n.emailsSent === 0 && n.emailsFailed > 0;
            
            if (n.emailsSent > 0 || n.managersEmailed?.length > 0 || hasFailures) {
              const emailed = n.managersEmailed || [];
              const typos   = emailed.filter(m => m.suspectedTypo);
              
              // Determine banner style based on results
              const bannerStyle = allFailed || (hasFailures && n.emailsSent === 0)
                ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' } // Red for all failed
                : hasFailures
                ? { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' } // Orange for partial failures
                : { background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.22)' }; // Green for all success
              
              const iconColor = allFailed || (hasFailures && n.emailsSent === 0)
                ? 'var(--red)'
                : hasFailures
                ? '#f59e0b'
                : 'var(--green)';
              
              const textColor = allFailed || (hasFailures && n.emailsSent === 0)
                ? 'var(--red)'
                : hasFailures
                ? '#d97706'
                : 'var(--green)';
              
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 12, padding: '11px 14px', ...bannerStyle, borderRadius: 'var(--r)', marginBottom: typos.length ? 8 : 0 }}>
                    <span style={{ color: iconColor, marginTop: 1, flexShrink: 0 }}>
                      {allFailed || (hasFailures && n.emailsSent === 0) ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      )}
                    </span>
                    <div>
                      <strong style={{ fontSize: 13, color: textColor }}>
                        {allFailed || (hasFailures && n.emailsSent === 0)
                          ? `Email sent to 0 store managers`
                          : `Email sent to ${n.emailsSent} store manager${n.emailsSent !== 1 ? 's' : ''}`
                        }
                      </strong>
                      {emailed.map(m => (
                        <p key={m.employeeId} style={{ fontSize: 12, color: 'var(--t3)', margin: '2px 0 0' }}>
                          {m.employeeId} ({m.storeName}) — <code style={{ fontSize: 11 }}>{m.email}</code>
                        </p>
                      ))}
                      {n.emailsFailed > 0 && <p style={{ fontSize: 12, color: 'var(--red)', margin: '4px 0 0', fontWeight: 700 }}>{n.emailsFailed} failed to deliver — check SMTP settings.</p>}
                      {noEmail.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                          <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 4px', fontWeight: 600 }}>No email on file — skipped:</p>
                          {noEmail.map(m => (
                            <p key={m.employeeId} style={{ fontSize: 12, color: 'var(--t3)', margin: '2px 0 0' }}>
                              {m.employeeId} ({m.storeName}) — <em>no email address</em>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {typos.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 'var(--r)' }}>
                      <span style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </span>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--red)' }}>Possible email address typo detected</strong>
                        {typos.map(m => (
                          <p key={m.employeeId} style={{ fontSize: 12, color: 'var(--t3)', margin: '3px 0 0' }}>
                            {m.employeeId}: <code style={{ fontSize: 11 }}>{m.email}</code> — {m.suspectedTypo} Fix it in{' '}
                            <button onClick={() => navigate('/admin/users')} style={{ background: 'none', border: 'none', color: 'var(--vi)', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>User Management</button>.
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            if (!n.smtpConfigured) {
              return (
                <div style={{ display: 'flex', gap: 12, padding: '11px 14px', background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.20)', borderRadius: 'var(--r)', marginBottom: 16 }}>
                  <span style={{ color: 'var(--t3)', marginTop: 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </span>
                  <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>SMTP not configured — email notifications are disabled. Add SMTP credentials to <code>server/.env</code> to enable them.</p>
                </div>
              );
            }
            if (noEmail.length > 0) {
              return (
                <div style={{ display: 'flex', gap: 12, padding: '11px 14px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r)', marginBottom: 16 }}>
                  <span style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13, color: '#d97706' }}>No email notifications sent</strong>
                    <p style={{ fontSize: 12, color: 'var(--t3)', margin: '3px 0 6px' }}>
                      {noEmail.length === 1
                        ? `${noEmail[0].employeeId} (${noEmail[0].storeName}) has no email address on file.`
                        : `${noEmail.length} store manager${noEmail.length !== 1 ? 's have' : ' has'} no email address on file: ${noEmail.map(m => m.employeeId).join(', ')}.`}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 6px' }}>
                      Add email addresses in User Management so managers receive cycle notifications automatically.
                    </p>
                    <button className="btn btn-sm" style={{ background: 'rgba(217,119,6,0.14)', color: '#d97706', border: '1px solid rgba(217,119,6,0.28)' }} onClick={() => navigate('/admin/users')}>
                      Go to User Management →
                    </button>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {result.errors?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 13 }}>Rejected Rows (first 10):</strong>
              <ul style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)', paddingLeft: 20 }}>
                {result.errors.slice(0, 10).map((err, idx) => <li key={idx}>Row {err.row}: {err.error}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={resetForm}>Upload New File</button>
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
