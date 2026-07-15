// emailService.js — Brevo HTTP API (not SMTP)
// Render free tier blocks outbound SMTP ports (25/465/587). The Brevo REST API
// uses HTTPS (port 443) which is never blocked by cloud providers.

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function isConfigured() {
  return !!process.env.BREVO_API_KEY;
}

function parseSender() {
  const raw = (process.env.SMTP_FROM || '').trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: 'KinMarché', email: raw || 'noreply@kinmarche.com' };
}

async function sendOne({ to, toName, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = parseSender();
  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      sender,
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

function row(label, value, valueColor) {
  return `<tr>
    <td style="padding:10px 14px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;background:#f8fafc">${label}</td>
    <td style="padding:10px 14px;font-weight:600;color:${valueColor || '#1e293b'};border-bottom:1px solid #f1f5f9">${value}</td>
  </tr>`;
}

// ── Notify all store managers when a new cycle is uploaded ────────────────────
export async function sendNewCycleEmail({ managers, inventoryDate, deadline }) {
  if (!isConfigured()) {
    console.warn('[email] BREVO_API_KEY not set — email notifications disabled');
    return { configured: false, sent: 0, failed: 0 };
  }

  const dateStr = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr   = deadline
    ? new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'No deadline set';

  const notifiable = managers.filter(m => m.email);
  if (notifiable.length === 0) return { configured: true, sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    notifiable.map(m => sendOne({
      to: m.email,
      toName: m.name,
      subject: `New Inventory Cycle — ${dateStr}`,
      htmlContent: html(`
        <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">New Inventory Cycle Ready</p>
        <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${m.name}, a new cycle has been published. Log in to begin your physical count.</p>
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
          ${row('Inventory Date', dateStr)}
          ${row('Submission Deadline', dlStr, deadline ? '#dc2626' : undefined)}
          ${row('Your Store', m.store?.storeName || 'Your store')}
        </table>
        <p style="color:#64748b;font-size:13px;margin:20px 0 0">Complete and submit your count before the deadline above. Contact your administrator if you need an extension.</p>
      `),
    }))
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  results.filter(r => r.status === 'rejected').forEach(r =>
    console.error('[email] New-cycle send failed:', r.reason?.message)
  );
  console.warn(`[email] New-cycle: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}

// ── Remind pending stores before deadline ─────────────────────────────────────
export async function sendDeadlineReminderEmail({ managers, inventoryDate, deadline }) {
  if (!isConfigured()) {
    console.warn('[email] BREVO_API_KEY not set — email notifications disabled');
    return { configured: false, sent: 0, failed: 0 };
  }
  if (!deadline) return { configured: true, sent: 0, failed: 0 };

  const dateStr   = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr     = new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const hoursLeft = Math.max(0, Math.round((new Date(deadline) - Date.now()) / 3_600_000));

  const notifiable = managers.filter(m => m.email);
  if (notifiable.length === 0) return { configured: true, sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    notifiable.map(m => sendOne({
      to: m.email,
      toName: m.name,
      subject: `Reminder — Submit inventory by ${dlStr}`,
      htmlContent: html(`
        <p style="font-size:17px;font-weight:800;color:#dc2626;margin:0 0 6px">Submission Deadline Approaching</p>
        <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${m.name}, your inventory count for <strong>${dateStr}</strong> is due in <strong style="color:#dc2626">${hoursLeft}h</strong>.</p>
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
          ${row('Deadline', dlStr, '#dc2626')}
          ${row('Store', m.store?.storeName || '')}
        </table>
        <p style="color:#64748b;font-size:13px;margin:20px 0 0">Please log in and complete your count before the deadline. If you cannot meet it, contact your administrator for an extension.</p>
      `),
    }))
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  results.filter(r => r.status === 'rejected').forEach(r =>
    console.error('[email] Reminder send failed:', r.reason?.message)
  );
  console.warn(`[email] Reminder: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}

// ── Notify admin when a store submits ─────────────────────────────────────────
export async function sendSubmissionEmail({ adminEmail, adminName, store, batchDate, recordCount, shortages }) {
  if (!isConfigured() || !adminEmail) return;
  await sendOne({
    to: adminEmail,
    toName: adminName,
    subject: `${store.storeName} submitted inventory`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Store Submission Received</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${adminName}, <strong>${store.storeName}</strong> (${store.storeCode}) has submitted their inventory count.</p>
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
  const shortageColor = shortages > 0 ? '#dc2626' : '#059669';
  await sendOne({
    to: managerEmail,
    toName: managerName,
    subject: `Submission confirmed — ${store.storeName} · ${batchDate}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Inventory Submission Confirmed</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${managerName}, your inventory count for <strong>${store.storeName}</strong> has been successfully submitted. Here is your summary:</p>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        ${row('Store', `${store.storeCode} — ${store.storeName}`)}
        ${row('Cycle Date', batchDate)}
        ${row('Total Records Submitted', String(recordCount))}
        ${row('Matched Items', String(matched), '#059669')}
        ${row('Shortage Items', String(shortages), shortageColor)}
        ${row('Excess Items', String(excess))}
      </table>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">Your submission has been recorded and your administrator has been notified. No further action is required unless you receive an extension request.</p>
    `),
  });
}

// ── Notify admin when Area Manager approves a store's submission ──────────────
export async function sendAMApprovalEmail({ adminEmail, adminName, store, areaManagerName, batchDate, remarks }) {
  if (!isConfigured() || !adminEmail) return;
  await sendOne({
    to: adminEmail,
    toName: adminName,
    subject: `${store.storeName} approved by ${areaManagerName}`,
    htmlContent: html(`
      <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">Area Manager Approved Submission</p>
      <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${adminName}, <strong>${areaManagerName}</strong> has reviewed and approved the inventory submission from <strong>${store.storeName}</strong>.</p>
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

// ── Notify Area Manager when a new cycle is uploaded ─────────────────────────
export async function sendNewCycleEmailAM({ managers, inventoryDate, deadline }) {
  if (!isConfigured()) {
    console.warn('[email] BREVO_API_KEY not set — AM email notifications disabled');
    return { configured: false, sent: 0, failed: 0 };
  }

  const dateStr = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr   = deadline
    ? new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'No deadline set';

  const notifiable = managers.filter(m => m.email);
  if (notifiable.length === 0) return { configured: true, sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    notifiable.map(m => sendOne({
      to: m.email,
      toName: m.name,
      subject: `New Inventory Cycle — ${dateStr}`,
      htmlContent: html(`
        <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">New Inventory Cycle Uploaded</p>
        <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${m.name}, a new inventory cycle has been published. Your store managers will begin their physical counts.</p>
        <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
          ${row('Inventory Date', dateStr)}
          ${row('Submission Deadline', dlStr, deadline ? '#dc2626' : undefined)}
          ${row('Stores Under You', String(m.storeCount || '—'))}
        </table>
        <p style="color:#64748b;font-size:13px;margin:20px 0 0">You will receive submissions from your store managers for review. Log in to monitor progress.</p>
      `),
    }))
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  results.filter(r => r.status === 'rejected').forEach(r =>
    console.error('[email] AM new-cycle send failed:', r.reason?.message)
  );
  console.warn(`[email] AM new-cycle: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}
