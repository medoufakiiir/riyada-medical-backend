const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generatePassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function main() {
  // ── Admin users (RBAC) ──────────────────────────────────────────
  const accounts = [
    { email: 'it@nash-consulting.net',          name: 'IT Admin',        role: 'SUPER_ADMIN' },
    { email: 'manager1@riyada-ventures.com',     name: 'Manager 1',      role: 'MANAGER' },
    { email: 'manager2@riyada-ventures.com',     name: 'Manager 2',      role: 'MANAGER' },
    { email: 'reception1@riyada-ventures.com',   name: 'Receptionist 1', role: 'RECEPTIONIST' },
    { email: 'reception2@riyada-ventures.com',   name: 'Receptionist 2', role: 'RECEPTIONIST' },
  ];

  console.log('\n══════════════════════════════════════════');
  console.log('  SEEDED ACCOUNT CREDENTIALS (one-time)');
  console.log('══════════════════════════════════════════');

  for (const a of accounts) {
    const existing = await prisma.adminUser.findUnique({ where: { email: a.email } });
    if (existing) {
      await prisma.adminUser.update({
        where: { email: a.email },
        data: { name: a.name, role: a.role, mustChangePassword: true },
      });
      console.log(`  ✓ ${a.email} (${a.role}) — updated, password unchanged, must change on next login`);
    } else {
      const password = process.env[`SEED_PASSWORD_${a.role}`] || generatePassword();
      const hash = await bcrypt.hash(password, 12);
      await prisma.adminUser.create({
        data: { email: a.email, password: hash, name: a.name, role: a.role, mustChangePassword: true },
      });
      console.log(`  ✓ ${a.email} (${a.role}) — created with password: ${password}`);
    }
  }

  console.log('══════════════════════════════════════════');
  console.log('  ⚠  Save these passwords NOW — they');
  console.log('     will NOT be shown again.');
  console.log('  ⚠  All accounts must change password');
  console.log('     on first login.');
  console.log('══════════════════════════════════════════\n');

  // ── Services ────────────────────────────────────────────────────
  const services = [
    { slug: 'assessments', titleEn: 'Assessments & Consultations', titleAr: 'التقييمات والاستشارات', descEn: 'Comprehensive developmental evaluations to understand your child\'s unique needs.', descAr: 'تقييمات نمائية شاملة لفهم الاحتياجات الفريدة لطفلك.', order: 1 },
    { slug: 'aba-therapy', titleEn: 'ABA / Behavior Therapy', titleAr: 'تحليل السلوك التطبيقي', descEn: 'Evidence-based behavioral interventions that make a measurable difference.', descAr: 'تدخلات سلوكية مبنية على الأدلة تحقق فرقاً قابلاً للقياس.', order: 2 },
    { slug: 'speech-language', titleEn: 'Speech & Language Therapy', titleAr: 'علاج النطق واللغة', descEn: 'Helping children find their voice and communicate with confidence.', descAr: 'مساعدة الأطفال على إيجاد صوتهم والتواصل بثقة.', order: 3 },
    { slug: 'occupational-therapy', titleEn: 'Occupational Therapy', titleAr: 'العلاج الوظيفي', descEn: 'Building the sensory and motor skills children need to thrive every day.', descAr: 'بناء المهارات الحسية والحركية التي يحتاجها الأطفال للازدهار يومياً.', order: 4 },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { slug: s.slug }, update: {}, create: s });
  }

  // ── Team ────────────────────────────────────────────────────────
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

  // ── Site settings ───────────────────────────────────────────────
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
