const express = require('express');
const prisma = require('../db');
const { bookingEmail, contactEmail } = require('../email');

const router = express.Router();

function genRef() {
  return 'RYD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// GET /services (public — returns active services)
router.get('/services', async (_req, res) => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    select: { slug: true, titleEn: true, titleAr: true, descEn: true, descAr: true, order: true },
  });
  res.json(services);
});

// POST /bookings
router.post('/bookings', async (req, res) => {
  const { parentName, childName, childAge, phone, email, service, package: pkg, date, time, notes } = req.body;
  if (!parentName || !childName || !phone || !service || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const nameRegex = /^[\p{L}\s'-]{2,50}$/u;
  const phoneClean = (phone || '').replace(/[\s\-()]/g, '');
  const phoneRegex = /^(\+966|05|5)\d{8}$/;
  const age = parseInt(childAge);

  if (!nameRegex.test(childName.trim())) return res.status(400).json({ error: 'Invalid child name' });
  if (!nameRegex.test(parentName.trim())) return res.status(400).json({ error: 'Invalid parent name' });
  if (!phoneRegex.test(phoneClean)) return res.status(400).json({ error: 'Invalid phone number' });
  if (childAge && (isNaN(age) || age < 1 || age > 18)) return res.status(400).json({ error: 'Invalid age' });
  let ref = genRef();
  while (await prisma.booking.findUnique({ where: { ref } })) ref = genRef();

  const booking = await prisma.booking.create({
    data: { ref, parentName, childName, childAge: childAge || '', phone, email: email || '', service, package: pkg || '', date, time, notes: notes || '' },
  });

  bookingEmail(booking).catch(() => {});

  res.status(201).json({ booking, ref: booking.ref });
});

// POST /contact
router.post('/contact', async (req, res) => {
  const { name, email, phone, service, childAge, concern, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const msg = await prisma.contactMessage.create({
    data: { name, email, phone: phone || '', service: service || '', childAge: childAge || '', concern: concern || '', message },
  });

  contactEmail(msg).catch(() => {});

  res.status(201).json({ message: msg });
});

// GET /availability — public, returns blocked dates/times + booked slots
router.get('/availability', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const blocked = await prisma.blockedSlot.findMany({
      where: { date: { gte: today } },
      select: { date: true, time: true },
    });
    const bookings = await prisma.booking.findMany({
      where: { date: { gte: today }, status: { not: 'cancelled' } },
      select: { date: true, time: true },
    });
    res.json({ blocked, bookings });
  } catch {
    res.json({ blocked: [], bookings: [] });
  }
});

// POST /track — lightweight page view tracking
router.post('/track', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'Missing path' });
    const ua = req.headers['user-agent'] || '';
    const device = /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
    const referrer = req.headers.referer || req.body.referrer || '';
    await prisma.pageView.create({ data: { path, referrer, device } });
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

module.exports = router;
