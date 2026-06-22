const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

async function checkChatbotAccess(req, res, next) {
  if (req.admin.role === 'SUPER_ADMIN') return next();
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'chatbotDisabledUsers' } });
  const disabled = setting ? JSON.parse(setting.value) : [];
  if (disabled.includes(req.admin.id)) {
    return res.status(403).json({ error: 'Chatbot access disabled for your account' });
  }
  if (['MANAGER', 'RECEPTIONIST', 'MARKETING'].includes(req.admin.role)) return next();
  return res.status(403).json({ error: 'Insufficient permissions' });
}
router.use(checkChatbotAccess);

// ═══════════════════════════════════════
// STATS
// ═══════════════════════════════════════
router.get('/stats', async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalSessions, totalMessages, totalAppointments, pendingAppointments, todaySessions, weekSessions, confirmedAppointments] =
    await Promise.all([
      prisma.chatbotSession.count(),
      prisma.chatbotMessage.count(),
      prisma.chatbotAppointment.count(),
      prisma.chatbotAppointment.count({ where: { status: 'pending' } }),
      prisma.chatbotSession.count({ where: { startedAt: { gte: today } } }),
      prisma.chatbotSession.count({ where: { startedAt: { gte: weekAgo } } }),
      prisma.chatbotAppointment.count({ where: { status: 'confirmed' } }),
    ]);

  res.json({ totalSessions, totalMessages, totalAppointments, pendingAppointments, todaySessions, weekSessions, confirmedAppointments });
});

// ═══════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════
router.get('/sessions', async (req, res) => {
  const { limit = '50', search, language, status } = req.query;
  const where = {};
  if (search) where.OR = [{ sessionId: { contains: search } }, { pageUrl: { contains: search } }];
  if (language && language !== 'all') where.language = language;
  if (status && status !== 'all') where.status = status;

  const sessions = await prisma.chatbotSession.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: parseInt(limit),
    include: { _count: { select: { messages: true } } },
  });
  res.json({ sessions });
});

router.get('/sessions/:sessionId/messages', async (req, res) => {
  const messages = await prisma.chatbotMessage.findMany({
    where: { sessionId: req.params.sessionId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ messages });
});

router.delete('/sessions/:sessionId', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { sessionId } = req.params;
  await prisma.chatbotMessage.deleteMany({ where: { sessionId } });
  await prisma.chatbotAppointment.deleteMany({ where: { sessionId } });
  await prisma.chatbotSession.delete({ where: { sessionId } }).catch(() => {});
  res.json({ success: true });
});

router.delete('/sessions', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
  for (const sessionId of ids) {
    await prisma.chatbotMessage.deleteMany({ where: { sessionId } });
    await prisma.chatbotAppointment.deleteMany({ where: { sessionId } });
    await prisma.chatbotSession.delete({ where: { sessionId } }).catch(() => {});
  }
  res.json({ success: true, deleted: ids.length });
});

// ═══════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════
router.get('/appointments', async (req, res) => {
  const { limit = '100', status, search } = req.query;
  const where = {};
  if (status && status !== 'all') where.status = status;
  if (search) {
    where.OR = [
      { parentName: { contains: search, mode: 'insensitive' } },
      { childName:  { contains: search, mode: 'insensitive' } },
      { phone:      { contains: search } },
      { service:    { contains: search, mode: 'insensitive' } },
    ];
  }
  const appointments = await prisma.chatbotAppointment.findMany({
    where, orderBy: { createdAt: 'desc' }, take: parseInt(limit),
  });
  res.json({ appointments });
});

router.patch('/appointments/:id', requireRole('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });
  const appt = await prisma.chatbotAppointment.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(appt);
});

router.delete('/appointments/:id', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.chatbotAppointment.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.delete('/appointments', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
  await prisma.chatbotAppointment.deleteMany({ where: { id: { in: ids } } });
  res.json({ success: true, deleted: ids.length });
});

// ═══════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════
router.get('/export/conversations', async (req, res) => {
  const { format = 'csv' } = req.query;
  const sessions = await prisma.chatbotSession.findMany({
    orderBy: { startedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=conversations.json');
    return res.json(sessions);
  }

  const rows = [['Session ID', 'Language', 'Status', 'Started', 'Role', 'Message', 'Timestamp']];
  for (const s of sessions) {
    for (const m of s.messages) {
      rows.push([s.sessionId, s.language, s.status, s.startedAt, m.role, `"${m.content.replace(/"/g, '""')}"`, m.createdAt]);
    }
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=conversations.csv');
  res.send(csv);
});

router.get('/export/appointments', async (_req, res) => {
  const appointments = await prisma.chatbotAppointment.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = [['Parent Name', 'Child Name', 'Child Age', 'Service', 'Phone', 'Preferred Time', 'Language', 'Status', 'Date']];
  for (const a of appointments) {
    rows.push([
      `"${a.parentName}"`, `"${a.childName}"`, a.childAge, `"${a.service}"`,
      a.phone, `"${a.preferredTime || ''}"`, a.language, a.status, a.createdAt,
    ]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=appointments.csv');
  res.send(csv);
});

router.get('/export/contacts', async (_req, res) => {
  const appointments = await prisma.chatbotAppointment.findMany({
    orderBy: { createdAt: 'desc' },
    select: { parentName: true, phone: true, service: true, language: true, createdAt: true },
  });
  const seen = new Set();
  const unique = appointments.filter(a => {
    if (seen.has(a.phone)) return false;
    seen.add(a.phone);
    return true;
  });
  const rows = [['Name', 'Phone', 'Service', 'Language', 'Date']];
  for (const a of unique) {
    rows.push([`"${a.parentName}"`, a.phone, `"${a.service}"`, a.language, a.createdAt]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
  res.send(csv);
});

// ═══════════════════════════════════════
// CLEAR ALL
// ═══════════════════════════════════════
router.delete('/clear-all', requireRole('SUPER_ADMIN'), async (_req, res) => {
  await prisma.chatbotMessage.deleteMany();
  await prisma.chatbotAppointment.deleteMany();
  await prisma.chatbotSession.deleteMany();
  res.json({ success: true });
});

module.exports = router;
