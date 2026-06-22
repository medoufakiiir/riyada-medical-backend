const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN', 'MARKETING'));

router.get('/', async (req, res) => {
  const { search, source, page = '1', limit = '50' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [bookings, messages, chatbotAppts] = await Promise.all([
    prisma.booking.findMany({
      select: { id: true, parentName: true, childName: true, childAge: true, email: true, phone: true, service: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.findMany({
      select: { id: true, name: true, email: true, phone: true, service: true, concern: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chatbotAppointment.findMany({
      select: { id: true, parentName: true, childName: true, childAge: true, phone: true, service: true, language: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  let contacts = [];

  if (!source || source === 'all' || source === 'bookings') {
    for (const b of bookings) {
      contacts.push({
        id: `b-${b.id}`, name: b.parentName, childName: b.childName || '',
        childAge: b.childAge || '', email: b.email || '', phone: b.phone,
        service: b.service, source: 'booking', date: b.createdAt,
      });
    }
  }

  if (!source || source === 'all' || source === 'messages') {
    for (const m of messages) {
      contacts.push({
        id: `m-${m.id}`, name: m.name, childName: '', childAge: '',
        email: m.email, phone: m.phone || '', service: m.service || '',
        source: 'message', date: m.createdAt,
      });
    }
  }

  if (!source || source === 'all' || source === 'chatbot') {
    for (const c of chatbotAppts) {
      contacts.push({
        id: `c-${c.id}`, name: c.parentName, childName: c.childName || '',
        childAge: c.childAge || '', email: '', phone: c.phone,
        service: c.service, source: 'chatbot', date: c.createdAt,
      });
    }
  }

  contacts.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) {
    const q = search.toLowerCase();
    contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.service.toLowerCase().includes(q) ||
      c.childName.toLowerCase().includes(q)
    );
  }

  const total = contacts.length;
  const paged = contacts.slice(skip, skip + parseInt(limit));

  res.json({ contacts: paged, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.get('/export', async (req, res) => {
  const { source } = req.query;

  const [bookings, messages, chatbotAppts] = await Promise.all([
    prisma.booking.findMany({
      select: { parentName: true, childName: true, childAge: true, email: true, phone: true, service: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.findMany({
      select: { name: true, email: true, phone: true, service: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chatbotAppointment.findMany({
      select: { parentName: true, childName: true, childAge: true, phone: true, service: true, language: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const rows = [['Name', 'Child Name', 'Child Age', 'Email', 'Phone', 'Service', 'Source', 'Date']];

  if (!source || source === 'all' || source === 'bookings') {
    for (const b of bookings) {
      rows.push([esc(b.parentName), esc(b.childName), b.childAge, b.email, b.phone, esc(b.service), 'Booking', b.createdAt]);
    }
  }
  if (!source || source === 'all' || source === 'messages') {
    for (const m of messages) {
      rows.push([esc(m.name), '', '', m.email, m.phone, esc(m.service), 'Message', m.createdAt]);
    }
  }
  if (!source || source === 'all' || source === 'chatbot') {
    for (const c of chatbotAppts) {
      rows.push([esc(c.parentName), esc(c.childName), c.childAge, '', c.phone, esc(c.service), 'Chatbot', c.createdAt]);
    }
  }

  const csv = rows.map(r => r.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
  res.send(csv);
});

function esc(str) {
  if (!str) return '';
  return `"${str.replace(/"/g, '""')}"`;
}

module.exports = router;
