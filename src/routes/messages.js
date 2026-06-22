const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { read, page = '1', limit = '20' } = req.query;
  const where = {};

  // RECEPTIONIST can only see unread messages
  if (req.admin.role === 'RECEPTIONIST') {
    where.isRead = false;
  } else {
    if (read === 'true')  where.isRead = true;
    if (read === 'false') where.isRead = false;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [messages, total] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
    prisma.contactMessage.count({ where }),
  ]);
  res.json({ messages, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

router.get('/:id', async (req, res) => {
  const msg = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: 'Not found' });
  if (!msg.isRead) await prisma.contactMessage.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json({ ...msg, isRead: true });
});

router.patch('/mark-all-read', requireRole('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'), async (_req, res) => {
  await prisma.contactMessage.updateMany({ where: { isRead: false }, data: { isRead: true } });
  res.json({ ok: true });
});

router.patch('/:id', requireRole('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'), async (req, res) => {
  const msg = await prisma.contactMessage.update({ where: { id: req.params.id }, data: { isRead: req.body.isRead } });
  res.json(msg);
});

// Only SUPER_ADMIN and MANAGER can delete messages
router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  await prisma.contactMessage.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Bulk delete
router.post('/bulk-delete', requireRole('SUPER_ADMIN', 'MANAGER'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
  await prisma.contactMessage.deleteMany({ where: { id: { in: ids } } });
  res.json({ ok: true, deleted: ids.length });
});

module.exports = router;
