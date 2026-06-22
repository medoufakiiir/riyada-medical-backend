const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { status, search, page = '1', limit = '20' } = req.query;
  const where = {};

  if (req.admin.role === 'RECEPTIONIST') {
    where.status = 'pending';
  } else if (status && status !== 'all') {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { parentName: { contains: search } },
      { childName:  { contains: search } },
      { ref:        { contains: search } },
      { phone:      { contains: search } },
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
    prisma.booking.count({ where }),
  ]);
  res.json({ bookings, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// Static routes MUST be before /:id
router.post('/bulk-delete', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  res.json({ ok: true, deleted: ids.length });
});

router.get('/export/ics', async (req, res) => {
  const bookings = await prisma.booking.findMany({ where: { status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' } });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Riyada Center//Bookings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const b of bookings) {
    const date = b.date.replace(/-/g, '');
    const time = (b.time || '09:00').replace(':', '') + '00';
    const endTime = String(parseInt(time.slice(0, 2)) + 1).padStart(2, '0') + time.slice(2);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${b.id}@riyada-center`);
    lines.push(`DTSTART:${date}T${time}`);
    lines.push(`DTEND:${date}T${endTime}`);
    lines.push(`SUMMARY:${b.service} - ${b.childName}`);
    lines.push(`DESCRIPTION:Parent: ${b.parentName}\\nChild: ${b.childName} (${b.childAge})\\nPhone: ${b.phone}\\nService: ${b.service}\\nRef: ${b.ref}`);
    lines.push(`LOCATION:Riyada Center, Riyadh`);
    lines.push(`STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=riyada-bookings.ics');
  res.send(lines.join('\r\n'));
});

// Parameterized routes after static ones
router.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

router.patch('/:id', requireRole('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'), async (req, res) => {
  const { status, adminNotes } = req.body;
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { ...(status && { status }), ...(adminNotes !== undefined && { adminNotes }) },
  });
  res.json(booking);
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.booking.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
