const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN', 'MARKETING'));

router.get('/', async (_req, res) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);

    const [totalBookings, pendingBookings, confirmedBookings, cancelledBookings, weekBookings, monthBookings] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'pending' } }),
      prisma.booking.count({ where: { status: 'confirmed' } }),
      prisma.booking.count({ where: { status: 'cancelled' } }),
      prisma.booking.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.booking.count({ where: { createdAt: { gte: monthAgo } } }),
    ]);

    const [totalMessages, unreadMessages, weekMessages, monthMessages] = await Promise.all([
      prisma.contactMessage.count(),
      prisma.contactMessage.count({ where: { isRead: false } }),
      prisma.contactMessage.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.contactMessage.count({ where: { createdAt: { gte: monthAgo } } }),
    ]);

    const [totalChatSessions, weekChatSessions, monthChatSessions, totalChatAppointments, pendingChatAppts] = await Promise.all([
      prisma.chatbotSession.count(),
      prisma.chatbotSession.count({ where: { startedAt: { gte: weekAgo } } }),
      prisma.chatbotSession.count({ where: { startedAt: { gte: monthAgo } } }),
      prisma.chatbotAppointment.count(),
      prisma.chatbotAppointment.count({ where: { status: 'pending' } }),
    ]);

    // Visitors
    const [totalVisitors, weekVisitors, monthVisitors, todayVisitors] = await Promise.all([
      prisma.pageView.count(),
      prisma.pageView.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.pageView.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.pageView.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } } }),
    ]);

    const allBookings = await prisma.booking.findMany({
      where: { createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, service: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    const allMessages = await prisma.contactMessage.findMany({
      where: { createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, service: true },
      orderBy: { createdAt: 'asc' },
    });
    const allChatSessions3m = await prisma.chatbotSession.findMany({
      where: { startedAt: { gte: threeMonthsAgo } },
      select: { startedAt: true, language: true },
      orderBy: { startedAt: 'asc' },
    });
    const allPageViews3m = await prisma.pageView.findMany({
      where: { createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, path: true, device: true },
      orderBy: { createdAt: 'asc' },
    });

    const bookingsByWeek = groupByWeek(allBookings, 'createdAt', 12);
    const messagesByWeek = groupByWeek(allMessages, 'createdAt', 12);
    const chatSessionsByWeek = groupByWeek(allChatSessions3m, 'startedAt', 12);
    const visitorsByWeek = groupByWeek(allPageViews3m, 'createdAt', 12);

    const serviceCounts = {};
    for (const b of allBookings) {
      serviceCounts[b.service] = (serviceCounts[b.service] || 0) + 1;
    }
    const topServices = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Top pages
    const pageCounts = {};
    for (const v of allPageViews3m) {
      pageCounts[v.path] = (pageCounts[v.path] || 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // Device split
    const deviceCounts = {};
    for (const v of allPageViews3m) {
      deviceCounts[v.device || 'unknown'] = (deviceCounts[v.device || 'unknown'] || 0) + 1;
    }

    const statusBreakdown = { pending: pendingBookings, confirmed: confirmedBookings, cancelled: cancelledBookings };

    const langCounts = {};
    for (const s of allChatSessions3m) {
      langCounts[s.language] = (langCounts[s.language] || 0) + 1;
    }

    const conversionRate = totalChatSessions > 0 ? ((totalChatAppointments / totalChatSessions) * 100).toFixed(1) : '0';

    res.json({
      overview: {
        totalBookings, pendingBookings, confirmedBookings, cancelledBookings,
        weekBookings, monthBookings,
        totalMessages, unreadMessages, weekMessages, monthMessages,
        totalChatSessions, weekChatSessions, monthChatSessions,
        totalChatAppointments, pendingChatAppts,
        totalVisitors, weekVisitors, monthVisitors, todayVisitors,
        conversionRate: parseFloat(conversionRate),
      },
      trends: { bookingsByWeek, messagesByWeek, chatSessionsByWeek, visitorsByWeek },
      topServices,
      topPages,
      deviceSplit: deviceCounts,
      statusBreakdown,
      chatLanguages: langCounts,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ── EXPORTS ──────────────────────────────────────────────

router.get('/export/bookings', async (_req, res) => {
  const bookings = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = [['Ref', 'Parent Name', 'Child Name', 'Child Age', 'Phone', 'Email', 'Service', 'Package', 'Date', 'Time', 'Status', 'Notes', 'Admin Notes', 'Created']];
  for (const b of bookings) {
    rows.push([b.ref, esc(b.parentName), esc(b.childName), b.childAge, b.phone, b.email, esc(b.service), esc(b.package), b.date, b.time, b.status, esc(b.notes), esc(b.adminNotes), b.createdAt]);
  }
  sendCsv(res, rows, 'bookings-export.csv');
});

router.get('/export/messages', async (_req, res) => {
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = [['Name', 'Email', 'Phone', 'Service', 'Child Age', 'Concern', 'Message', 'Read', 'Created']];
  for (const m of messages) {
    rows.push([esc(m.name), m.email, m.phone, esc(m.service), m.childAge, esc(m.concern), esc(m.message), m.isRead, m.createdAt]);
  }
  sendCsv(res, rows, 'messages-export.csv');
});

router.get('/export/chatbot-sessions', async (_req, res) => {
  const sessions = await prisma.chatbotSession.findMany({
    orderBy: { startedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  });
  const rows = [['Session ID', 'Language', 'Status', 'Page URL', 'Messages', 'Started', 'Last Seen']];
  for (const s of sessions) {
    rows.push([s.sessionId, s.language, s.status, esc(s.pageUrl), s._count.messages, s.startedAt, s.lastSeen]);
  }
  sendCsv(res, rows, 'chatbot-sessions-export.csv');
});

router.get('/export/chatbot-appointments', async (_req, res) => {
  const appts = await prisma.chatbotAppointment.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = [['Parent Name', 'Child Name', 'Child Age', 'Service', 'Phone', 'Preferred Time', 'Language', 'Status', 'Source', 'Created']];
  for (const a of appts) {
    rows.push([esc(a.parentName), esc(a.childName), a.childAge, esc(a.service), a.phone, esc(a.preferredTime || ''), a.language, a.status, a.source, a.createdAt]);
  }
  sendCsv(res, rows, 'chatbot-appointments-export.csv');
});

router.get('/export/visitors', async (_req, res) => {
  const views = await prisma.pageView.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = [['Path', 'Device', 'Referrer', 'Created']];
  for (const v of views) {
    rows.push([v.path, v.device, esc(v.referrer), v.createdAt]);
  }
  sendCsv(res, rows, 'visitors-export.csv');
});

router.get('/export/contacts', async (_req, res) => {
  const [bookings, messages, chatAppts] = await Promise.all([
    prisma.booking.findMany({ select: { parentName: true, childName: true, childAge: true, email: true, phone: true, service: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.contactMessage.findMany({ select: { name: true, email: true, phone: true, service: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.chatbotAppointment.findMany({ select: { parentName: true, childName: true, childAge: true, phone: true, service: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  const rows = [['Name', 'Child Name', 'Child Age', 'Email', 'Phone', 'Service', 'Source', 'Date']];
  for (const b of bookings) rows.push([esc(b.parentName), esc(b.childName), b.childAge, b.email, b.phone, esc(b.service), 'Booking', b.createdAt]);
  for (const m of messages) rows.push([esc(m.name), '', '', m.email, m.phone, esc(m.service), 'Message', m.createdAt]);
  for (const c of chatAppts) rows.push([esc(c.parentName), esc(c.childName), c.childAge, '', c.phone, esc(c.service), 'Chatbot', c.createdAt]);
  sendCsv(res, rows, 'all-contacts-export.csv');
});

function esc(str) {
  if (!str) return '';
  return `"${String(str).replace(/"/g, '""')}"`;
}

function sendCsv(res, rows, filename) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(rows.map(r => r.join(',')).join('\n'));
}

function groupByWeek(items, dateField, weeks) {
  const now = new Date();
  const result = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 86400000);
    const weekEnd = new Date(now.getTime() - i * 7 * 86400000);
    const count = items.filter(item => {
      const d = new Date(item[dateField]);
      return d >= weekStart && d < weekEnd;
    }).length;
    result.push({ week: weekStart.toISOString().slice(0, 10), count });
  }
  return result;
}

module.exports = router;
