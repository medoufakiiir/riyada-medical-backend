const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const STATUS_COLORS = {
  confirmed: '#22c55e',
  pending: '#f59e0b',
  cancelled: '#ef4444',
  completed: '#3355EE',
};

function to24h(time) {
  if (!time) return '09:00';
  // Already 24h format like "14:30"
  if (!time.toLowerCase().includes('am') && !time.toLowerCase().includes('pm')) return time;
  const [timePart, ampm] = time.trim().split(/\s+/);
  let [h, m] = timePart.split(':').map(Number);
  if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

// ── GET /admin/calendar/bookings — FullCalendar event feed ──
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({ orderBy: { date: 'asc' } });

    const events = bookings.map(b => {
      const t24 = to24h(b.time);
      const startDt = `${b.date}T${t24}:00`;
      const endH = String(parseInt(t24.split(':')[0]) + 1).padStart(2, '0');
      const endDt = `${b.date}T${endH}:${t24.split(':')[1]}:00`;
      return {
        id: b.id,
        title: `${b.childName} — ${b.service}`,
        start: startDt,
        end: endDt,
        color: STATUS_COLORS[b.status] || STATUS_COLORS.pending,
        extendedProps: {
          bookingId: b.id,
          ref: b.ref,
          parentName: b.parentName,
          childName: b.childName,
          childAge: b.childAge,
          phone: b.phone,
          email: b.email,
          service: b.service,
          status: b.status,
          notes: b.notes,
          adminNotes: b.adminNotes,
        },
      };
    });

    res.json(events);
  } catch (err) {
    console.error('Calendar bookings error:', err);
    res.status(500).json({ error: 'Failed to load calendar events' });
  }
});

// ── BLOCKED SLOTS ──
router.get('/blocked', async (_req, res) => {
  const slots = await prisma.blockedSlot.findMany({ orderBy: { date: 'asc' } });
  res.json(slots);
});

router.post('/blocked', async (req, res) => {
  const { date, time, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required' });
  const slot = await prisma.blockedSlot.create({
    data: { date, time: time || null, reason: reason || '' },
  });
  res.status(201).json(slot);
});

router.delete('/blocked/:id', async (req, res) => {
  await prisma.blockedSlot.delete({ where: { id: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});

// ── GET /admin/calendar/status — connection status ──
router.get('/status', async (req, res) => {
  try {
    const token = await prisma.calendarToken.findUnique({ where: { userId: req.admin.id } });
    if (!token) return res.json({ connected: false, provider: null, lastSynced: null });
    res.json({
      connected: true,
      provider: token.provider,
      lastSynced: token.lastSynced,
      calendarId: token.calendarId,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ══════════════════════════════════════════
// GOOGLE CALENDAR
// ══════════════════════════════════════════
/*
 GOOGLE CLOUD CONSOLE SETUP:
 1. Go to https://console.cloud.google.com
 2. Create/select your project
 3. Enable "Google Calendar API"
 4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
 5. Add Authorized redirect URI: https://rc.riyada-ventures.com/api/calendar/google/callback
    AND for local dev: http://localhost:4000/admin/calendar/google/callback
 6. Copy Client ID → GOOGLE_CAL_CLIENT_ID in .env
 7. Copy Client Secret → GOOGLE_CAL_CLIENT_SECRET in .env
*/

router.get('/google/connect', (req, res) => {
  const clientId = process.env.GOOGLE_CAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google Calendar not configured' });

  const redirect = process.env.GOOGLE_CAL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/admin/calendar/google/callback`;
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ].join(' ');

  const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline&prompt=consent&state=${req.admin.id}`;

  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const redirect = process.env.GOOGLE_CAL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/admin/calendar/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code.toString(),
        client_id: process.env.GOOGLE_CAL_CLIENT_ID,
        client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await prisma.calendarToken.upsert({
      where: { userId: userId || req.admin.id },
      update: {
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
        calendarId: 'primary',
      },
      create: {
        userId: userId || req.admin.id,
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        calendarId: 'primary',
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://rc.riyada-ventures.com';
    res.redirect(`${frontendUrl}/admin/calendar?connected=google`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.status(500).json({ error: 'Google OAuth failed' });
  }
});

router.post('/google/sync', async (req, res) => {
  try {
    const token = await prisma.calendarToken.findUnique({ where: { userId: req.admin.id } });
    if (!token || token.provider !== 'google') return res.status(400).json({ error: 'Google Calendar not connected' });

    let accessToken = token.accessToken;
    if (token.expiresAt && new Date() >= token.expiresAt && token.refreshToken) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CAL_CLIENT_ID,
          client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET,
          refresh_token: token.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        await prisma.calendarToken.update({
          where: { userId: req.admin.id },
          data: { accessToken, expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000) },
        });
      }
    }

    const bookings = await prisma.booking.findMany({
      where: { status: 'confirmed', date: { gte: new Date().toISOString().slice(0, 10) } },
    });

    let synced = 0;
    for (const b of bookings) {
      const t24 = to24h(b.time);
      const startDt = `${b.date}T${t24}:00`;
      const endH = String(parseInt(t24.split(':')[0]) + 1).padStart(2, '0');
      const endDt = `${b.date}T${endH}:${t24.split(':')[1]}:00`;

      const event = {
        summary: `${b.childName} — ${b.service}`,
        description: `Parent: ${b.parentName}\nPhone: ${b.phone}\nService: ${b.service}\nRef: ${b.ref}\nNotes: ${b.notes || 'N/A'}`,
        start: { dateTime: startDt, timeZone: 'Asia/Riyadh' },
        end: { dateTime: endDt, timeZone: 'Asia/Riyadh' },
      };

      const createRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${token.calendarId || 'primary'}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (createRes.ok) synced++;
    }

    await prisma.calendarToken.update({
      where: { userId: req.admin.id },
      data: { lastSynced: new Date() },
    });

    res.json({ synced });
  } catch (err) {
    console.error('Google sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.delete('/google/disconnect', async (req, res) => {
  await prisma.calendarToken.deleteMany({ where: { userId: req.admin.id, provider: 'google' } });
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// MICROSOFT OUTLOOK
// ══════════════════════════════════════════
/*
 AZURE APP REGISTRATION SETUP:
 1. Go to https://portal.azure.com → Azure Active Directory → App registrations
 2. New registration → Name: "Riyada Center Calendar"
 3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
 4. Redirect URI (Web): https://rc.riyada-ventures.com/api/calendar/microsoft/callback
    AND for local dev: http://localhost:4000/admin/calendar/microsoft/callback
 5. Go to "Certificates & secrets" → New client secret → copy to MS_CAL_CLIENT_SECRET
 6. Go to "API permissions" → Add: Calendars.ReadWrite (Delegated) → Grant admin consent
 7. Copy Application (client) ID → MS_CAL_CLIENT_ID
 8. Copy Directory (tenant) ID or use "common" → MS_CAL_TENANT_ID
*/

router.get('/microsoft/connect', (req, res) => {
  const clientId = process.env.MS_CAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Microsoft Calendar not configured' });

  const tenant = process.env.MS_CAL_TENANT_ID || 'common';
  const redirect = process.env.MS_CAL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/admin/calendar/microsoft/callback`;
  const scopes = 'Calendars.ReadWrite offline_access';

  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=${encodeURIComponent(scopes)}&state=${req.admin.id}`;

  res.json({ url });
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const tenant = process.env.MS_CAL_TENANT_ID || 'common';
    const redirect = process.env.MS_CAL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/admin/calendar/microsoft/callback`;

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code.toString(),
        client_id: process.env.MS_CAL_CLIENT_ID,
        client_secret: process.env.MS_CAL_CLIENT_SECRET,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
        scope: 'Calendars.ReadWrite offline_access',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await prisma.calendarToken.upsert({
      where: { userId: userId || req.admin.id },
      update: {
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt,
      },
      create: {
        userId: userId || req.admin.id,
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://rc.riyada-ventures.com';
    res.redirect(`${frontendUrl}/admin/calendar?connected=microsoft`);
  } catch (err) {
    console.error('Microsoft callback error:', err);
    res.status(500).json({ error: 'Microsoft OAuth failed' });
  }
});

router.post('/microsoft/sync', async (req, res) => {
  try {
    const token = await prisma.calendarToken.findUnique({ where: { userId: req.admin.id } });
    if (!token || token.provider !== 'microsoft') return res.status(400).json({ error: 'Outlook not connected' });

    let accessToken = token.accessToken;
    if (token.expiresAt && new Date() >= token.expiresAt && token.refreshToken) {
      const tenant = process.env.MS_CAL_TENANT_ID || 'common';
      const refreshRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.MS_CAL_CLIENT_ID,
          client_secret: process.env.MS_CAL_CLIENT_SECRET,
          refresh_token: token.refreshToken,
          grant_type: 'refresh_token',
          scope: 'Calendars.ReadWrite offline_access',
        }),
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        await prisma.calendarToken.update({
          where: { userId: req.admin.id },
          data: { accessToken, expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000) },
        });
      }
    }

    const bookings = await prisma.booking.findMany({
      where: { status: 'confirmed', date: { gte: new Date().toISOString().slice(0, 10) } },
    });

    let synced = 0;
    for (const b of bookings) {
      const t24 = to24h(b.time);
      const startDt = `${b.date}T${t24}:00`;
      const endH = String(parseInt(t24.split(':')[0]) + 1).padStart(2, '0');
      const endDt = `${b.date}T${endH}:${t24.split(':')[1]}:00`;

      const event = {
        subject: `${b.childName} — ${b.service}`,
        body: { contentType: 'Text', content: `Parent: ${b.parentName}\nPhone: ${b.phone}\nService: ${b.service}\nRef: ${b.ref}` },
        start: { dateTime: startDt, timeZone: 'Asia/Riyadh' },
        end: { dateTime: endDt, timeZone: 'Asia/Riyadh' },
      };

      const createRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (createRes.ok) synced++;
    }

    await prisma.calendarToken.update({
      where: { userId: req.admin.id },
      data: { lastSynced: new Date() },
    });

    res.json({ synced });
  } catch (err) {
    console.error('Microsoft sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

router.delete('/microsoft/disconnect', async (req, res) => {
  await prisma.calendarToken.deleteMany({ where: { userId: req.admin.id, provider: 'microsoft' } });
  res.json({ ok: true });
});

module.exports = router;
