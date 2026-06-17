const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN', 'MANAGER'));

// MANAGER can only see/manage RECEPTIONIST accounts
function scopeForRole(adminRole) {
  return adminRole === 'MANAGER' ? { role: 'RECEPTIONIST' } : {};
}

function canManageRole(adminRole, targetRole) {
  if (adminRole === 'SUPER_ADMIN') return true;
  if (adminRole === 'MANAGER' && targetRole === 'RECEPTIONIST') return true;
  return false;
}

router.get('/', async (req, res) => {
  const where = scopeForRole(req.admin.role);
  const users = await prisma.adminUser.findMany({
    where,
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

router.post('/', async (req, res) => {
  const { email, name, role, password } = req.body;
  if (!email || !name || !role) return res.status(400).json({ error: 'Email, name, and role are required' });
  if (!canManageRole(req.admin.role, role)) return res.status(403).json({ error: 'You cannot create users with this role' });

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(password || 'Riyada@2025', 12);
  const user = await prisma.adminUser.create({
    data: { email, name, role, password: hash },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  res.status(201).json(user);
});

router.patch('/:id', async (req, res) => {
  const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!canManageRole(req.admin.role, target.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const { name, email, role, isActive } = req.body;
  if (role && !canManageRole(req.admin.role, role)) return res.status(403).json({ error: 'Cannot assign this role' });

  const user = await prisma.adminUser.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  res.json(user);
});

router.post('/:id/reset-password', async (req, res) => {
  const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!canManageRole(req.admin.role, target.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const newPassword = req.body.password || 'Riyada@2025';
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.adminUser.update({ where: { id: req.params.id }, data: { password: hash } });
  res.json({ ok: true });
});

module.exports = router;
