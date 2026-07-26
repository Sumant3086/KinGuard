import { useState, useEffect } from 'react';
import AdminLayout from '../layout/AdminLayout';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import Modal from '../../../shared/components/ui/Modal';
import { SkeletonTable } from '../../../shared/components/ui/LoadingCard';
import * as adminApi from '../../../shared/api/adminApi';
import { useToast } from '../../../shared/context/ToastContext';
import { fmtDate } from '../../../shared/utils/dateUtils';

const FREQ_LABELS = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' };
const DOW_LABELS  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeSchedule(s) {
  if (s.frequency === 'weekly')    return `Every ${DOW_LABELS[s.dayOfWeek ?? 1]}`;
  if (s.frequency === 'monthly')   return `Monthly on day ${s.dayOfMonth ?? 1}`;
  if (s.frequency === 'quarterly') return `Quarterly on day ${s.dayOfMonth ?? 1}`;
  return s.frequency;
}

const BLANK = { name: '', frequency: 'monthly', dayOfMonth: 1, dayOfWeek: 1, submissionWindowDays: 7 };

export default function Schedules() {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | 'create' | schedule object
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(null);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      setSchedules(await adminApi.getSchedules());
    } catch (e) {
      console.error('Schedules load:', e);
      toast.error('Could not load schedules.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() { setForm(BLANK); setModal('create'); }
  function openEdit(s)  { setForm({ name: s.name, frequency: s.frequency, dayOfMonth: s.dayOfMonth ?? 1, dayOfWeek: s.dayOfWeek ?? 1, submissionWindowDays: s.submissionWindowDays }); setModal(s); }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name:                 form.name.trim(),
        frequency:            form.frequency,
        dayOfMonth:           form.frequency !== 'weekly'  ? parseInt(form.dayOfMonth) : null,
        dayOfWeek:            form.frequency === 'weekly'  ? parseInt(form.dayOfWeek)  : null,
        submissionWindowDays: parseInt(form.submissionWindowDays) || 7,
      };
      if (modal === 'create') {
        await adminApi.createSchedule(payload);
        toast.success('Schedule created');
      } else {
        await adminApi.updateSchedule(modal.id, payload);
        toast.success('Schedule updated');
      }
      setModal(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s) {
    try {
      await adminApi.updateSchedule(s.id, { isActive: !s.isActive });
      setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    } catch { toast.error('Could not update schedule.'); }
  }

  async function handleDelete(s) {
    if (deleting === s.id) {
      try {
        await adminApi.deleteSchedule(s.id);
        toast.success('Schedule deleted');
        setDeleting(null);
        await load();
      } catch { toast.error('Could not delete schedule.'); }
    } else {
      setDeleting(s.id);
      setTimeout(() => setDeleting(d => d === s.id ? null : d), 3000);
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Scheduled Cycles"
        subtitle="Automatically create inventory cycles on a recurring schedule"
        actions={
          <button className="btn btn-primary" onClick={openCreate}>+ New Schedule</button>
        }
      />

      {loading ? <SkeletonTable rows={4} cols={5} /> : (
        schedules.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>
            <p style={{ marginBottom: 12 }}>No recurring schedules set up yet.</p>
            <button className="btn btn-primary" onClick={openCreate}>Create your first schedule</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* ── Mobile cards (≤768px) ─────────────────────────── */}
            <div className="schedules-cards" style={{ padding: 12 }}>
              {schedules.map(s => (
                <div key={s.id} className="schedule-card">
                  <div className="schedule-card-top">
                    <div>
                      <div className="schedule-card-name">{s.name}</div>
                      <div className="schedule-card-freq">{describeSchedule(s)} · {s.submissionWindowDays}-day window</div>
                    </div>
                    <button
                      onClick={() => toggleActive(s)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                        background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.12)',
                        color: s.isActive ? '#059669' : '#64748b',
                      }}
                    >
                      {s.isActive ? 'Active' : 'Paused'}
                    </button>
                  </div>
                  <div className="schedule-card-meta">
                    <span>Next: <strong>{s.nextRunAt ? fmtDate(s.nextRunAt) : '—'}</strong></span>
                    <span>Last run: {s.lastRunAt ? fmtDate(s.lastRunAt) : 'Never'}</span>
                  </div>
                  <div className="schedule-card-actions">
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => openEdit(s)}>Edit</button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="btn btn-sm"
                      style={{
                        flex: 1, border: '1px solid', fontWeight: 600,
                        background: deleting === s.id ? '#dc2626' : 'transparent',
                        color: deleting === s.id ? '#fff' : '#dc2626',
                        borderColor: '#dc2626',
                      }}
                    >
                      {deleting === s.id ? 'Confirm?' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Desktop table (>768px) ────────────────────────── */}
            <div className="schedules-table-desktop">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Frequency</th>
                      <th>Submission Window</th>
                      <th>Next Run</th>
                      <th>Last Run</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ fontSize: 13, color: 'var(--t2)' }}>{describeSchedule(s)}</td>
                        <td style={{ fontSize: 13 }}>{s.submissionWindowDays} days</td>
                        <td style={{ fontSize: 13 }}>{s.nextRunAt ? fmtDate(s.nextRunAt) : '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--t3)' }}>{s.lastRunAt ? fmtDate(s.lastRunAt) : 'Never'}</td>
                        <td>
                          <button
                            onClick={() => toggleActive(s)}
                            style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                              background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.12)',
                              color: s.isActive ? '#059669' : '#64748b',
                            }}
                          >
                            {s.isActive ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', marginRight: 6 }} onClick={() => openEdit(s)}>Edit</button>
                          <button
                            onClick={() => handleDelete(s)}
                            style={{
                              fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid',
                              cursor: 'pointer', fontWeight: 600,
                              background: deleting === s.id ? '#dc2626' : 'transparent',
                              color: deleting === s.id ? '#fff' : '#dc2626',
                              borderColor: '#dc2626',
                            }}
                          >
                            {deleting === s.id ? 'Confirm?' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {modal && (
        <Modal onClose={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{modal === 'create' ? 'New Schedule' : 'Edit Schedule'}</h3>
              <button className="close-btn" onClick={() => setModal(null)} aria-label="Close">&times;</button>
            </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0 4px' }}>
            <div className="form-group">
              <label>Schedule Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Cycle" />
            </div>

            <div className="form-group">
              <label>Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            {form.frequency === 'weekly' ? (
              <div className="form-group">
                <label>Day of Week</label>
                <select value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: parseInt(e.target.value) }))}>
                  {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Day of Month (1–28)</label>
                <input type="number" min={1} max={28} value={form.dayOfMonth}
                  onChange={e => setForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) || 1 }))} />
              </div>
            )}

            <div className="form-group">
              <label>Submission Window (days)</label>
              <input type="number" min={1} max={90} value={form.submissionWindowDays}
                onChange={e => setForm(f => ({ ...f, submissionWindowDays: parseInt(e.target.value) || 7 }))} />
              <small style={{ fontSize: 11, color: 'var(--t3)' }}>
                The deadline is set to inventory date + this many days.
              </small>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create Schedule' : 'Save Changes'}
              </button>
            </div>
          </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
