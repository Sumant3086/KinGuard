import nodemailer from 'nodemailer';

// Returns { transporter, configured } so callers can distinguish "not set up" from errors.
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { transporter: null, configured: false };
  }
  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587'),
      secure: SMTP_PORT === '465',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    }),
    configured: true,
  };
}

const FROM = process.env.SMTP_FROM || 'KinMarché <noreply@kinmarche.com>';

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
// Returns { configured, sent, failed } for caller observability.
export async function sendNewCycleEmail({ managers, inventoryDate, deadline }) {
  const { transporter, configured } = getTransporter();
  if (!configured) {
    console.log('[email] SMTP not configured — skipping new-cycle notifications');
    return { configured: false, sent: 0, failed: 0 };
  }
  const dateStr = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr   = deadline
    ? new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'No deadline set';

  let sent = 0; let failed = 0;
  for (const m of managers.filter(m => m.email)) {
    try {
      await transporter.sendMail({
        from: FROM,
        to: m.email,
        subject: `New Inventory Cycle — ${dateStr}`,
        html: html(`
          <p style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px">New Inventory Cycle Ready</p>
          <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${m.name}, a new cycle has been published. Log in to begin your physical count.</p>
          <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
            ${row('Inventory Date', dateStr)}
            ${row('Submission Deadline', dlStr, deadline ? '#dc2626' : undefined)}
            ${row('Your Store', m.store?.storeName || 'Your store')}
          </table>
          <p style="color:#64748b;font-size:13px;margin:20px 0 0">Complete and submit your count before the deadline above. Contact your administrator if you need an extension.</p>
        `),
      });
      sent++;
    } catch (e) {
      failed++;
      console.error(`[email] New-cycle notification failed for ${m.email}:`, e.message);
    }
  }
  console.log(`[email] New-cycle: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}

// ── Remind pending stores before deadline ─────────────────────────────────────
// Returns { configured, sent, failed }.
export async function sendDeadlineReminderEmail({ managers, inventoryDate, deadline }) {
  const { transporter, configured } = getTransporter();
  if (!configured) {
    console.log('[email] SMTP not configured — skipping reminder notifications');
    return { configured: false, sent: 0, failed: 0 };
  }
  const dateStr  = new Date(inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dlStr    = new Date(deadline).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const hoursLeft = Math.max(0, Math.round((new Date(deadline) - Date.now()) / 3_600_000));

  let sent = 0; let failed = 0;
  for (const m of managers.filter(m => m.email)) {
    try {
      await transporter.sendMail({
        from: FROM,
        to: m.email,
        subject: `Reminder — Submit inventory by ${dlStr}`,
        html: html(`
          <p style="font-size:17px;font-weight:800;color:#dc2626;margin:0 0 6px">Submission Deadline Approaching</p>
          <p style="color:#64748b;font-size:14px;margin:0 0 22px">Hi ${m.name}, your inventory count for <strong>${dateStr}</strong> is due in <strong style="color:#dc2626">${hoursLeft}h</strong>.</p>
          <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
            ${row('Deadline', dlStr, '#dc2626')}
            ${row('Store', m.store?.storeName || '')}
          </table>
          <p style="color:#64748b;font-size:13px;margin:20px 0 0">Please log in and complete your count before the deadline. If you cannot meet it, contact your administrator for an extension.</p>
        `),
      });
      sent++;
    } catch (e) {
      failed++;
      console.error(`[email] Reminder failed for ${m.email}:`, e.message);
    }
  }
  console.log(`[email] Reminder: sent=${sent}, failed=${failed}`);
  return { configured: true, sent, failed };
}

// ── Notify admin when a store submits ─────────────────────────────────────────
// Fire-and-forget; does not throw; logs result for observability.
export async function sendSubmissionEmail({ adminEmail, adminName, store, batchDate, recordCount, shortages }) {
  const { transporter, configured } = getTransporter();
  if (!configured) {
    console.log('[email] SMTP not configured — skipping submission notification');
    return;
  }
  if (!adminEmail) return;
  try {
    await transporter.sendMail({
      from: FROM,
      to: adminEmail,
      subject: `${store.storeName} submitted inventory`,
      html: html(`
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
    console.log(`[email] Submission notification sent to ${adminEmail}`);
  } catch (e) {
    console.error(`[email] Submission notification failed for ${adminEmail}:`, e.message);
  }
}
