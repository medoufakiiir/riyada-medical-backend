const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  const team = await prisma.teamMember.findMany({ orderBy: { order: 'asc' } });
  res.json(team);
});

router.post('/', async (req, res) => {
  const { nameEn, nameAr, roleEn, roleAr, bio, initials, color, order } = req.body;
  const member = await prisma.teamMember.create({ data: { nameEn, nameAr, roleEn, roleAr, bio: bio || '', initials, color: color || '#3355EE', order: order || 0 } });
  res.status(201).json(member);
});

router.patch('/:id', async (req, res) => {
  const fields = ['nameEn','nameAr','roleEn','roleAr','bio','initials','color','order','isActive'];
  const data = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const member = await prisma.teamMember.update({ where: { id: req.params.id }, data });
  res.json(member);
});

router.delete('/:id', async (req, res) => {
  await prisma.teamMember.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
