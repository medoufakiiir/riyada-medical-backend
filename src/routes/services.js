const express = require('express');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (_req, res) => {
  try {
    const services = await prisma.service.findMany({ orderBy: { order: 'asc' } });
    res.json(services);
  } catch (err) { res.status(500).json({ error: 'Failed to load services' }); }
});

router.post('/', async (req, res) => {
  try {
    const { slug, titleEn, titleAr, descEn, descAr, order, isActive } = req.body;
    const service = await prisma.service.create({
      data: { slug, titleEn, titleAr, descEn: descEn || '', descAr: descAr || '', order: order || 0, isActive: isActive !== false },
    });
    res.status(201).json(service);
  } catch (err) { res.status(500).json({ error: 'Failed to create service' }); }
});

router.patch('/:id', async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ error: 'Failed to update service' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.service.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete service' }); }
});

module.exports = router;
