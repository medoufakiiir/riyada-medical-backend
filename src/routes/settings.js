const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);

// Site settings — SUPER_ADMIN only
router.get('/', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const rows = await prisma.siteSetting.findMany();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.patch('/', requireRole('SUPER_ADMIN'), async (req, res) => {
  const updates = req.body;
  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      prisma.siteSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })
    )
  );
  res.json({ ok: true });
});

module.exports = router;
