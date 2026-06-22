const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  try {
    const team = await prisma.teamMember.findMany({ orderBy: { order: 'asc' } });
    res.json(team);
  } catch (err) { res.status(500).json({ error: 'Failed to load team' }); }
});

router.post('/', async (req, res) => {
  try {
    const { nameEn, nameAr, roleEn, roleAr, bio, initials, color, order } = req.body;
    const member = await prisma.teamMember.create({ data: { nameEn, nameAr, roleEn, roleAr, bio: bio || '', initials, color: color || '#3355EE', order: order || 0 } });
    res.status(201).json(member);
  } catch (err) { res.status(500).json({ error: 'Failed to create team member' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const fields = ['nameEn','nameAr','roleEn','roleAr','bio','initials','color','order','isActive'];
    const data = {};
    for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
    const member = await prisma.teamMember.update({ where: { id: req.params.id }, data });
    res.json(member);
  } catch (err) { res.status(500).json({ error: 'Failed to update team member' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.teamMember.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete team member' }); }
});

module.exports = router;
