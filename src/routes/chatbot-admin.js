const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Stats
router.get('/stats', async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalSessions, totalMessages, totalAppointments, pendingAppointments, todaySessions] =
    await Promise.all([
      prisma.chatbotSession.count(),
      prisma.chatbotMessage.count(),
      prisma.chatbotAppointment.count(),
      prisma.chatbotAppointment.count({ where: { status: 'pending' } }),
      prisma.chatbotSession.count({ where: { startedAt: { gte: today } } }),
    ]);

  res.json({ totalSessions, totalMessages, totalAppointments, pendingAppointments, todaySessions });
});

// Sessions list
router.get('/sessions', async (req, res) => {
  const { limit = '50', search } = req.query;
  const where = search
    ? { OR: [{ sessionId: { contains: search } }, { pageUrl: { contains: search } }] }
    : {};
  const sessions = await prisma.chatbotSession.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: parseInt(limit),
    include: { _count: { select: { messages: true } } },
  });
  res.json({ sessions });
});

// Messages for a session
router.get('/sessions/:sessionId/messages', async (req, res) => {
  const messages = await prisma.chatbotMessage.findMany({
    where: { sessionId: req.params.sessionId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ messages });
});

// Appointments list
router.get('/appointments', async (req, res) => {
  const { limit = '50', status, search } = req.query;
  const where = {};
  if (status && status !== 'all') where.status = status;
  if (search) {
    where.OR = [
      { parentName: { contains: search, mode: 'insensitive' } },
      { childName:  { contains: search, mode: 'insensitive' } },
      { phone:      { contains: search } },
    ];
  }
  const appointments = await prisma.chatbotAppointment.findMany({
    where, orderBy: { createdAt: 'desc' }, take: parseInt(limit),
  });
  res.json({ appointments });
});

// Update appointment status
router.patch('/appointments/:id', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });
  const appt = await prisma.chatbotAppointment.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(appt);
});

module.exports = router;
