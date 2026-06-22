const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN', 'MARKETING'));

router.get('/', async (_req, res) => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);

  const [
    totalBookings, pendingBookings, confirmedBookings, cancelledBookings,
    weekBookings, monthBookings,
    totalMessages, unreadMessages, weekMessages, monthMessages,
    totalChatSessions, weekChatSessions, monthChatSessions,
    totalChatAppointments, pendingChatAppts,
    allBookings, allMessages, allChatSessions3m,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'pending' } }),
    prisma.booking.count({ where: { status: 'confirmed' } }),
    prisma.booking.count({ where: { status: 'cancelled' } }),
    prisma.booking.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.booking.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { isRead: false } }),
    prisma.contactMessage.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.contactMessage.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.chatbotSession.count(),
    prisma.chatbotSession.count({ where: { startedAt: { gte: weekAgo } } }),
    prisma.chatbotSession.count({ where: { startedAt: { gte: monthAgo } } }),
    prisma.chatbotAppointment.count(),
    prisma.chatbotAppointment.count({ where: { status: 'pending' } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, service: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.contactMessage.findMany({
      where: { createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, service: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.chatbotSession.findMany({
      where: { startedAt: { gte: threeMonthsAgo } },
      select: { startedAt: true, language: true },
      orderBy: { startedAt: 'asc' },
    }),
  ]);

  // Bookings per week (last 12 weeks)
  const bookingsByWeek = groupByWeek(allBookings, 'createdAt', 12);
  const messagesByWeek = groupByWeek(allMessages, 'createdAt', 12);
  const chatSessionsByWeek = groupByWeek(allChatSessions3m, 'startedAt', 12);

  // Top services from bookings
  const serviceCounts = {};
  for (const b of allBookings) {
    serviceCounts[b.service] = (serviceCounts[b.service] || 0) + 1;
  }
  const topServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Booking status breakdown
  const statusBreakdown = { pending: pendingBookings, confirmed: confirmedBookings, cancelled: cancelledBookings };

  // Chatbot language split
  const langCounts = {};
  for (const s of allChatSessions3m) {
    langCounts[s.language] = (langCounts[s.language] || 0) + 1;
  }

  // Conversion rate: chatbot sessions that led to appointments
  const conversionRate = totalChatSessions > 0 ? ((totalChatAppointments / totalChatSessions) * 100).toFixed(1) : '0';

  res.json({
    overview: {
      totalBookings, pendingBookings, confirmedBookings, cancelledBookings,
      weekBookings, monthBookings,
      totalMessages, unreadMessages, weekMessages, monthMessages,
      totalChatSessions, weekChatSessions, monthChatSessions,
      totalChatAppointments, pendingChatAppts,
      conversionRate: parseFloat(conversionRate),
    },
    trends: { bookingsByWeek, messagesByWeek, chatSessionsByWeek },
    topServices,
    statusBreakdown,
    chatLanguages: langCounts,
  });
});

// Contacts/leads summary for marketing
router.get('/contacts-summary', async (_req, res) => {
  const [bookingContacts, messageContacts, chatbotContacts] = await Promise.all([
    prisma.booking.findMany({
      select: { parentName: true, email: true, phone: true, service: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.findMany({
      select: { name: true, email: true, phone: true, service: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chatbotAppointment.findMany({
      select: { parentName: true, phone: true, service: true, language: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalUniqueEmails = new Set([
    ...bookingContacts.map(b => b.email).filter(Boolean),
    ...messageContacts.map(m => m.email).filter(Boolean),
  ]).size;

  const totalUniquePhones = new Set([
    ...bookingContacts.map(b => b.phone).filter(Boolean),
    ...messageContacts.map(m => m.phone).filter(Boolean),
    ...chatbotContacts.map(c => c.phone).filter(Boolean),
  ]).size;

  res.json({
    totalUniqueEmails,
    totalUniquePhones,
    totalBookingLeads: bookingContacts.length,
    totalMessageLeads: messageContacts.length,
    totalChatbotLeads: chatbotContacts.length,
  });
});

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
    result.push({
      week: weekStart.toISOString().slice(0, 10),
      count,
    });
  }
  return result;
}

module.exports = router;
