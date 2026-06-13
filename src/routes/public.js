const express = require('express');
const prisma = require('../db');

const router = express.Router();

function genRef() {
  return 'RYD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// POST /bookings
router.post('/bookings', async (req, res) => {
  const { parentName, childName, childAge, phone, email, service, package: pkg, date, time, notes } = req.body;
  if (!parentName || !childName || !phone || !service || !date || !time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let ref = genRef();
  while (await prisma.booking.findUnique({ where: { ref } })) ref = genRef();

  const booking = await prisma.booking.create({
    data: { ref, parentName, childName, childAge: childAge || '', phone, email: email || '', service, package: pkg || '', date, time, notes: notes || '' },
  });
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
  res.status(201).json({ message: msg });
});

module.exports = router;
