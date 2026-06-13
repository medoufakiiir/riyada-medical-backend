const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { status, search, page = '1', limit = '20' } = req.query;
  const where = {};
  if (status && status !== 'all') where.status = status;
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

router.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

router.patch('/:id', async (req, res) => {
  const { status, adminNotes } = req.body;
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { ...(status && { status }), ...(adminNotes !== undefined && { adminNotes }) },
  });
  res.json(booking);
});

router.delete('/:id', async (req, res) => {
  await prisma.booking.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
