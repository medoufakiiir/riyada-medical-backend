const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const rows = await prisma.siteSetting.findMany();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.patch('/', async (req, res) => {
  const updates = req.body;
  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      prisma.siteSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })
    )
  );
  res.json({ ok: true });
});

router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const user = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.adminUser.update({ where: { id: req.admin.id }, data: { password: hashed } });
  res.json({ ok: true });
});

module.exports = router;
