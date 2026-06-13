const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const hash = await bcrypt.hash('Admin@2024', 12);
  await prisma.adminUser.upsert({
    where: { email: 'admin@riyada.com' },
    update: {},
    create: { email: 'admin@riyada.com', password: hash, name: 'Riyada Admin', role: 'admin' },
  });

  // Services
  const services = [
    { slug: 'assessments', titleEn: 'Assessments & Consultations', titleAr: 'التقييمات والاستشارات', descEn: 'Comprehensive developmental evaluations to understand your child\'s unique needs.', descAr: 'تقييمات نمائية شاملة لفهم الاحتياجات الفريدة لطفلك.', order: 1 },
    { slug: 'aba-therapy', titleEn: 'ABA / Behavior Therapy', titleAr: 'تحليل السلوك التطبيقي', descEn: 'Evidence-based behavioral interventions that make a measurable difference.', descAr: 'تدخلات سلوكية مبنية على الأدلة تحقق فرقاً قابلاً للقياس.', order: 2 },
    { slug: 'speech-language', titleEn: 'Speech & Language Therapy', titleAr: 'علاج النطق واللغة', descEn: 'Helping children find their voice and communicate with confidence.', descAr: 'مساعدة الأطفال على إيجاد صوتهم والتواصل بثقة.', order: 3 },
    { slug: 'occupational-therapy', titleEn: 'Occupational Therapy', titleAr: 'العلاج الوظيفي', descEn: 'Building the sensory and motor skills children need to thrive every day.', descAr: 'بناء المهارات الحسية والحركية التي يحتاجها الأطفال للازدهار يومياً.', order: 4 },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { slug: s.slug }, update: {}, create: s });
  }

  // Packages
  const packages = [
    { nameEn: 'Starter', nameAr: 'المبتدئ', price: 890, period: 'monthly', featuresEn: '4 sessions per month\nOne therapy type\nInitial assessment\nMonthly progress report', featuresAr: '4 جلسات شهرياً\nنوع علاجي واحد\nتقييم أولي\nتقرير تقدم شهري', order: 1 },
    { nameEn: 'Growth', nameAr: 'النمو', price: 1690, period: 'monthly', featuresEn: '8 sessions per month\nTwo therapy types\nFull assessment\nBi-weekly reports\nParent coaching sessions', featuresAr: '8 جلسات شهرياً\nnوعان علاجيان\nتقييم شامل\nتقارير نصف شهرية\nجلسات تدريب الوالدين', isPopular: true, order: 2 },
    { nameEn: 'Intensive', nameAr: 'المكثف', price: 2990, period: 'monthly', featuresEn: '12+ sessions per month\nAll therapy types\nWeekly reports\nDedicated therapist\nHome program guide\nSchool coordination', featuresAr: '12+ جلسة شهرياً\nجميع أنواع العلاج\nتقارير أسبوعية\nمعالج مخصص\ndليل برنامج منزلي\nتنسيق مع المدرسة', order: 3 },
  ];
  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    const existing = await prisma.package.findFirst({ where: { nameEn: p.nameEn } });
    if (!existing) await prisma.package.create({ data: p });
  }

  // Team
  const team = [
    { nameEn: 'Dr. Sarah Al-Rashidi', nameAr: 'د. سارة الراشدي', roleEn: 'Clinical Director & Speech-Language Pathologist', roleAr: 'المدير السريري وأخصائي النطق واللغة', initials: 'SR', color: '#3355EE', order: 1 },
    { nameEn: 'Dr. Amal Hassan', nameAr: 'د. أمل حسن', roleEn: 'Lead ABA Therapist & Behavior Analyst (BCBA)', roleAr: 'المعالج السلوكي الرئيسي ومحلل السلوك المعتمد', initials: 'AH', color: '#FF4D94', order: 2 },
    { nameEn: 'Fatima Al-Zahrawi', nameAr: 'فاطمة الزهراوي', roleEn: 'Senior Occupational Therapist', roleAr: 'أخصائي علاج وظيفي أول', initials: 'FZ', color: '#33CC44', order: 3 },
    { nameEn: 'Mohammed Al-Otaibi', nameAr: 'محمد العتيبي', roleEn: 'Child Psychologist & Assessment Specialist', roleAr: 'طبيب نفسي للأطفال وأخصائي تقييم', initials: 'MO', color: '#7766DD', order: 4 },
    { nameEn: 'Nora Al-Ghamdi', nameAr: 'نورة الغامدي', roleEn: 'Speech-Language Therapist', roleAr: 'أخصائي نطق ولغة', initials: 'NG', color: '#FFCC22', order: 5 },
    { nameEn: 'Khalid Al-Shammari', nameAr: 'خالد الشمري', roleEn: 'ABA Therapist (RBT)', roleAr: 'معالج سلوكي معتمد', initials: 'KS', color: '#3355EE', order: 6 },
  ];
  for (const m of team) {
    const existing = await prisma.teamMember.findFirst({ where: { nameEn: m.nameEn } });
    if (!existing) await prisma.teamMember.create({ data: m });
  }

  // Site settings
  const defaults = {
    siteName: 'Riyada Medical Centre',
    siteNameAr: 'مركز ريادة الطبي',
    phone: '+966 11 234 5678',
    email: 'info@riyada.com',
    address: 'Al Olaya District, Riyadh, Saudi Arabia',
    addressAr: 'حي العليا، الرياض، المملكة العربية السعودية',
    instagram: 'https://instagram.com/riyadacentre',
    twitter: 'https://x.com/riyadacentre',
    maintenanceMode: 'false',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.siteSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log('Database seeded successfully.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
