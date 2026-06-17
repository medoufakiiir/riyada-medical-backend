const BREVO_KEY    = process.env.BREVO_API_KEY;
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL   || 'admin@riyada.com';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@riyada.com';
const SITE_URL     = process.env.SITE_URL      || 'https://rc.riyada-ventures.com';
const LOGO_URL     = `${SITE_URL}/logo/Riyada%20Center%20Logo%20Souce-01.png`;
const ADMIN_URL    = `${SITE_URL}/admin`;

function header(title, subtitle, bgColor) {
  return `
    <div style="background:${bgColor};padding:24px 24px 20px;border-radius:8px 8px 0 0;text-align:center">
      <img src="${LOGO_URL}" alt="Riyada Center" style="width:60px;height:60px;border-radius:12px;margin-bottom:14px;background:#fff;padding:4px" />
      <h1 style="color:#fff;margin:0;font-size:20px">${title}</h1>
      <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px">${subtitle}</p>
    </div>`;
}

async function send(subject, htmlContent) {
  if (!BREVO_KEY) return;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Riyada Center', email: SENDER_EMAIL },
        to: [{ email: ADMIN_EMAIL }],
        subject,
        htmlContent,
      }),
    });
    if (!res.ok) console.error('[Email] Brevo error:', await res.text());
  } catch (e) {
    console.error('[Email] Failed to send:', e.message);
  }
}

function bookingEmail(booking) {
  const optRow = (label, val) =>
    val ? `<tr><td style="padding:6px 0;color:#6b7280;width:140px">${label}</td><td style="padding:6px 0">${val}</td></tr>` : '';

  return send(
    `📅 New Booking ${booking.ref} — ${booking.service}`,
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${header('New Booking Received', 'Riyada Center Admin', '#3355EE')}
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#6b7280;width:140px">Reference</td>
              <td style="padding:6px 0;font-weight:700;color:#3355EE">${booking.ref}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Parent</td>
              <td style="padding:6px 0">${booking.parentName}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Child</td>
              <td style="padding:6px 0">${booking.childName}${booking.childAge ? `, Age ${booking.childAge}` : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Service</td>
              <td style="padding:6px 0">${booking.service}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Date &amp; Time</td>
              <td style="padding:6px 0">${booking.date} at ${booking.time}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Phone</td>
              <td style="padding:6px 0"><strong>${booking.phone}</strong></td></tr>
          ${optRow('Email', booking.email)}
          ${optRow('Notes', booking.notes)}
        </table>
        <div style="margin-top:20px;text-align:center">
          <a href="${ADMIN_URL}"
             style="display:inline-block;background:#3355EE;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
            View in Admin Panel →
          </a>
        </div>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0">
        Riyada Center · <a href="${SITE_URL}" style="color:#9ca3af">${SITE_URL.replace('https://', '')}</a>
      </p>
    </div>`
  );
}

function contactEmail(msg) {
  const optRow = (label, val) =>
    val ? `<tr><td style="padding:6px 0;color:#6b7280;width:120px">${label}</td><td style="padding:6px 0">${val}</td></tr>` : '';

  return send(
    `💬 New Message from ${msg.name}`,
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      ${header('New Contact Message', 'Riyada Center Admin', '#059669')}
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#6b7280;width:120px">From</td>
              <td style="padding:6px 0;font-weight:700">${msg.name}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Email</td>
              <td style="padding:6px 0"><a href="mailto:${msg.email}" style="color:#3355EE">${msg.email}</a></td></tr>
          ${optRow('Phone', msg.phone)}
          ${optRow('Service', msg.service)}
          ${optRow('Child Age', msg.childAge)}
          ${optRow('Concern', msg.concern)}
        </table>
        <div style="margin-top:16px;padding:14px;background:#fff;border-radius:6px;border:1px solid #e5e7eb;font-size:14px;color:#374151;line-height:1.6">
          ${msg.message.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
        </div>
        <div style="margin-top:20px;text-align:center">
          <a href="${ADMIN_URL}"
             style="display:inline-block;background:#059669;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">
            View in Admin Panel →
          </a>
        </div>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0">
        Riyada Center · <a href="${SITE_URL}" style="color:#9ca3af">${SITE_URL.replace('https://', '')}</a>
      </p>
    </div>`
  );
}

module.exports = { bookingEmail, contactEmail };
