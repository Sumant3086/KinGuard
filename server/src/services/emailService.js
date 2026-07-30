// emailService.js — Brevo HTTP API (not SMTP)
// Render's free tier blocks outbound SMTP (ports 25/465/587).
// The Brevo REST API uses HTTPS (port 443) which is never blocked.
// Set BREVO_API_KEY in server/.env to enable email notifications.

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function isConfigured() {
  return !!process.env.BREVO_API_KEY;
}

const SENDER = (() => {
  const raw = (process.env.SMTP_FROM || '').trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: 'KinMarché', email: raw || 'noreply@kinmarche.com' };
})();

const EMAIL_TIMEOUT_MS = 10_000;

async function sendOne({ to, toName, subject, htmlContent }) {
  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
}

// ── Shared boilerplate for bulk sends ─────────────────────────────────────────
// Filters out managers with no email, sends all in parallel, returns counts.
async function sendBulk(managers, buildEmail, tag) {
  if (!isConfigured()) {
    console.warn('[email] BREVO_API_KEY not set — email notifications disabled');
    return { configured: false, sent: 0, failed: 0 };
  }
  const notifiable = managers.filter(m => m.email);
  if (!notifiable.length) return { configured: true, sent: 0, failed: 0 };

  const results = await Promise.allSettled(notifiable.map(m => sendOne(buildEmail(m))));
  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  results.filter(r => r.status === 'rejected').forEach(r =>
    console.error(`[email] ${tag} send failed:`, r.reason?.message)
  );
  console.warn(`[email] ${tag}: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}

// ── HTML email template ───────────────────────────────────────────────────────
function html(body) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#dc2626;padding:22px 32px">
    <p style="margin:0;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px">KinMarché</p>
    <p style="margin:4px 0 0;font-size:10px;color:rgba(255,255,255,.65);letter-spacing:1.5px;text-transform:uppercase">Loss &amp; Prevention Platform</p>
  </td></tr>
  <tr><td style="padding:32px">${body}</td></tr>
  <tr><td style="background:#f8fafc;padding:14px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
    KinMarché · Kinshasa, DRC · This is an automated notification — do not reply.
  </td></tr>
</table></td></tr></table></body></html>`;
}

// Store names, user names and free-text remarks all end up inside these templates.
// Without escaping, an apostrophe-free name like "R&D <Gombe>" mangles the layout and
// anything resembling a tag would be delivered as live markup in a mail that looks
// like it came from the platform. Subjects are plain text in the Brevo payload, so
// only HTML bodies are escaped.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Every call site passes plain text as the value, so escaping here covers them all.
function row(label, value, valueColor) {
  return `<tr>
    <td style="padding:10px 14px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;background:#f8fafc">${esc(label)}</td>
    <td style="padding:10px 14px;font-weight:600;color:${valueColor || '#1e293b'};border-bottom:1px solid #f1f5f9">${esc(value)}</td>
  </tr>`;
}

// ── Notify area managers when a new cycle is uploaded ────────────────────────
export function sendNewCycleEmailAM({ managers, inventoryDate, deadline }) {
  const dateStr = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr   = deadline
    ? new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'No deadline set';
  return sendBulk(managers, m => ({
    to: m.email, toName: m.name,
    subject: `New Inventory Cycle — ${dateStr}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">New Inventory Cycle Uploaded</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${esc(m.name)}, a new inventory cycle has been published. Your store managers will begin their physical counts.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Inventory Date', dateStr)}
        ${row('Submission Deadline', dlStr, deadline ? '#dc2626' : undefined)}
        ${row('Stores Under You', String(m.storeCount || '—'))}
      </table>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">You will receive submissions from your store managers for review. Log in to monitor progress.</p>
    `),
  }), 'new-cycle-am');
}

// ── Remind pending stores before deadline ─────────────────────────────────────
export function sendDeadlineReminderEmail({ managers, inventoryDate, deadline }) {
  if (!deadline) return Promise.resolve({ configured: true, sent: 0, failed: 0 });
  const dateStr   = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr     = new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const hoursLeft = Math.max(0, Math.round((new Date(deadline) - Date.now()) / 3_600_000));
  return sendBulk(managers, m => ({
    to: m.email, toName: m.name,
    subject: `Reminder — Submit inventory by ${dlStr}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#dc2626;margin:0 0 6px">Submission Deadline Approaching</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${esc(m.name)}, your inventory count for <strong>${dateStr}</strong> is due in <strong style="color:#dc2626">${hoursLeft}h</strong>.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Deadline', dlStr, '#dc2626')}
        ${row('Store', m.store?.storeName || '')}
      </table>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">Please log in and complete your count before the deadline. If you cannot meet it, contact your administrator for an extension.</p>
    `),
  }), 'reminder');
}

// ── Notify admin when a store submits ─────────────────────────────────────────
export async function sendSubmissionEmail({ adminEmail, adminName, store, batchDate, recordCount, shortages }) {
  if (!isConfigured() || !adminEmail) return;
  await sendOne({
    to: adminEmail, toName: adminName,
    subject: `${store.storeName} submitted inventory`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Store Submission Received</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${esc(adminName)}, <strong>${esc(store.storeName)}</strong> (${esc(store.storeCode)}) has submitted their inventory count.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Store', `${store.storeCode} — ${store.storeName}`)}
        ${row('Cycle Date', batchDate)}
        ${row('Records Submitted', String(recordCount))}
        ${row('Shortage Items', String(shortages), shortages > 0 ? '#dc2626' : '#059669')}
      </table>
    `),
  });
}

// ── Confirm to store manager that their submission was received ───────────────
export async function sendManagerSubmissionConfirmation({ managerEmail, managerName, store, batchDate, recordCount, shortages, matched, excess }) {
  if (!isConfigured() || !managerEmail) return;
  await sendOne({
    to: managerEmail, toName: managerName,
    subject: `Submission confirmed — ${store.storeName} · ${batchDate}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Inventory Submission Confirmed</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${esc(managerName)}, your inventory count for <strong>${esc(store.storeName)}</strong> has been successfully submitted.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Store', `${store.storeCode} — ${store.storeName}`)}
        ${row('Cycle Date', batchDate)}
        ${row('Total Records', String(recordCount))}
        ${row('Matched', String(matched), '#059669')}
        ${row('Shortage', String(shortages), shortages > 0 ? '#dc2626' : '#059669')}
        ${row('Excess', String(excess))}
      </table>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">Your submission has been recorded and your administrator has been notified.</p>
    `),
  });
}

// ── Notify admin when Area Manager approves a store's submission ──────────────
export async function sendAMApprovalEmail({ adminEmail, adminName, store, areaManagerName, batchDate, remarks }) {
  if (!isConfigured() || !adminEmail) return;
  await sendOne({
    to: adminEmail, toName: adminName,
    subject: `${store.storeName} approved by ${areaManagerName}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Area Manager Approved Submission</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${esc(adminName)}, <strong>${esc(areaManagerName)}</strong> has reviewed and approved the submission from <strong>${esc(store.storeName)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Store', `${store.storeCode} — ${store.storeName}`)}
        ${row('Cycle Date', batchDate)}
        ${row('Approved by', areaManagerName)}
        ${remarks ? row('AM Remarks', remarks) : ''}
      </table>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">This submission is now ready for your final review in the admin panel.</p>
    `),
  });
}

// ── Post-deadline escalation email ────────────────────────────────────────────
// tier 1 → Area Manager  |  tier 2 → Admin (urgent)
export async function sendEscalationEmail({ to, toName, tier, inventoryDate, pendingStores, hoursOverdue }) {
  if (!isConfigured()) return;
  const storeList = pendingStores
    .map(s => `<li style="padding:4px 0;font-size:13px;color:#1e293b">${esc(s.storeCode)} — ${esc(s.storeName)}</li>`)
    .join('');
  const urgency  = tier === 2 ? '🚨 URGENT — ' : '';
  const audience = tier === 2 ? 'Admin Action Required' : 'Area Manager Alert';
  await sendOne({
    to, toName,
    subject: `${urgency}${pendingStores.length} store${pendingStores.length > 1 ? 's have' : ' has'} not submitted — ${inventoryDate}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:${tier === 2 ? '#dc2626' : '#1e293b'};margin:0 0 6px">${audience}</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 16px">
        Hi ${esc(toName)}, the following store${pendingStores.length > 1 ? 's have' : ' has'} not submitted their inventory for
        <strong>${esc(inventoryDate)}</strong> — now <strong>${hoursOverdue}h</strong> past the deadline.
      </p>
      <ul style="margin:0 0 20px;padding-left:20px">${storeList}</ul>
      <p style="color:#64748b;font-size:13px;margin:0">
        ${tier === 2
          ? 'Please take immediate action — contact the stores or their area managers, or grant a deadline extension from the admin panel.'
          : 'Please contact your store managers and ensure they submit their counts as soon as possible.'}
      </p>
    `),
  }).catch(e => console.error('[escalation] Email send error:', e.message));
}
