const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function safeParseArray(val) {
  try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

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

// Permissions check — any authenticated user can ask what's enabled for them
router.get('/permissions', async (req, res) => {
  if (req.admin.role === 'SUPER_ADMIN') return res.json({ chatbot: true, analytics: true, contacts: true });
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'chatbotDisabledUsers' } });
  const disabled = setting ? safeParseArray(setting.value) : [];
  const chatbot = !disabled.includes(req.admin.id);
  if (req.admin.role === 'MARKETING') {
    return res.json({ chatbot, analytics: true, contacts: true });
  }
  return res.json({ chatbot, analytics: false, contacts: false });
});

// Get all users with their chatbot permission status — SUPER_ADMIN only
router.get('/permissions/chatbot', requireRole('SUPER_ADMIN'), async (_req, res) => {
  const users = await prisma.adminUser.findMany({
    where: { role: { not: 'SUPER_ADMIN' } },
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { role: 'asc' },
  });
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'chatbotDisabledUsers' } });
  const disabled = setting ? safeParseArray(setting.value) : [];
  const result = users.map(u => ({ ...u, chatbotEnabled: !disabled.includes(u.id) }));
  res.json(result);
});

// Toggle chatbot access for a user — SUPER_ADMIN only
router.patch('/permissions/chatbot/:userId', requireRole('SUPER_ADMIN'), async (req, res) => {
  const { enabled } = req.body;
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'chatbotDisabledUsers' } });
  let disabled = setting ? safeParseArray(setting.value) : [];
  if (enabled) {
    disabled = disabled.filter(id => id !== req.params.userId);
  } else {
    if (!disabled.includes(req.params.userId)) disabled.push(req.params.userId);
  }
  await prisma.siteSetting.upsert({
    where: { key: 'chatbotDisabledUsers' },
    update: { value: JSON.stringify(disabled) },
    create: { key: 'chatbotDisabledUsers', value: JSON.stringify(disabled) },
  });
  res.json({ ok: true, enabled });
});

module.exports = router;
