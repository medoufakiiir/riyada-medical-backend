const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  try {
    const packages = await prisma.package.findMany({ orderBy: { order: 'asc' } });
    res.json(packages);
  } catch (err) { res.status(500).json({ error: 'Failed to load packages' }); }
});

router.post('/', async (req, res) => {
  try {
    const { nameEn, nameAr, price, currency, period, featuresEn, featuresAr, isPopular, isActive, order } = req.body;
    const pkg = await prisma.package.create({ data: { nameEn, nameAr, price: parseFloat(price), currency: currency || 'SAR', period: period || 'monthly', featuresEn: featuresEn || '', featuresAr: featuresAr || '', isPopular: !!isPopular, isActive: isActive !== false, order: order || 0 } });
    res.status(201).json(pkg);
  } catch (err) { res.status(500).json({ error: 'Failed to create package' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const data = {};
    const fields = ['nameEn','nameAr','price','currency','period','featuresEn','featuresAr','isPopular','isActive','order'];
    for (const f of fields) if (req.body[f] !== undefined) data[f] = f === 'price' ? parseFloat(req.body[f]) : req.body[f];
    const pkg = await prisma.package.update({ where: { id: req.params.id }, data });
    res.json(pkg);
  } catch (err) { res.status(500).json({ error: 'Failed to update package' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.package.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete package' }); }
});

module.exports = router;
