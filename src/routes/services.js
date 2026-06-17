const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  const services = await prisma.service.findMany({ orderBy: { order: 'asc' } });
  res.json(services);
});

router.post('/', async (req, res) => {
  const { slug, titleEn, titleAr, descEn, descAr, order, isActive } = req.body;
  const service = await prisma.service.create({
    data: { slug, titleEn, titleAr, descEn: descEn || '', descAr: descAr || '', order: order || 0, isActive: isActive !== false },
  });
  res.status(201).json(service);
});

router.patch('/:id', async (req, res) => {
  const { titleEn, titleAr, descEn, descAr, slug, isActive, order } = req.body;
  const service = await prisma.service.update({
    where: { id: req.params.id },
    data: {
      ...(titleEn !== undefined && { titleEn }), ...(titleAr !== undefined && { titleAr }),
      ...(descEn !== undefined && { descEn }), ...(descAr !== undefined && { descAr }),
      ...(slug !== undefined && { slug }), ...(isActive !== undefined && { isActive }),
      ...(order !== undefined && { order }),
    },
  });
  res.json(service);
});

router.delete('/:id', async (req, res) => {
  await prisma.service.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
