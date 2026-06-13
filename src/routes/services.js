const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const services = await prisma.service.findMany({ orderBy: { order: 'asc' } });
  res.json(services);
});

router.patch('/:id', async (req, res) => {
  const { titleEn, titleAr, descEn, descAr, isActive, order } = req.body;
  const service = await prisma.service.update({
    where: { id: req.params.id },
    data: { ...(titleEn !== undefined && { titleEn }), ...(titleAr !== undefined && { titleAr }), ...(descEn !== undefined && { descEn }), ...(descAr !== undefined && { descAr }), ...(isActive !== undefined && { isActive }), ...(order !== undefined && { order }) },
  });
  res.json(service);
});

module.exports = router;
