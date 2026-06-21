const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  const packages = await prisma.package.findMany({ orderBy: { order: 'asc' } });
  res.json(packages);
});

router.post('/', async (req, res) => {
  const { nameEn, nameAr, price, currency, period, featuresEn, featuresAr, isPopular, isActive, order } = req.body;
  const pkg = await prisma.package.create({ data: { nameEn, nameAr, price: parseFloat(price), currency: currency || 'SAR', period: period || 'monthly', featuresEn: featuresEn || '', featuresAr: featuresAr || '', isPopular: !!isPopular, isActive: isActive !== false, order: order || 0 } });
  res.status(201).json(pkg);
});

router.patch('/:id', async (req, res) => {
  const data = {};
  const fields = ['nameEn','nameAr','price','currency','period','featuresEn','featuresAr','isPopular','isActive','order'];
  for (const f of fields) if (req.body[f] !== undefined) data[f] = f === 'price' ? parseFloat(req.body[f]) : req.body[f];
  const pkg = await prisma.package.update({ where: { id: req.params.id }, data });
  res.json(pkg);
});

router.delete('/:id', async (req, res) => {
  await prisma.package.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
