const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  const [totalBookings, pendingBookings, totalMessages, unreadMessages, recentBookings, recentMessages] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'pending' } }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { isRead: false } }),
    prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  res.json({ stats: { totalBookings, pendingBookings, totalMessages, unreadMessages }, recentBookings, recentMessages });
});

module.exports = router;
