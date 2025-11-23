/**
 * Seed script for Central API
 * Creates test users and courses
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { email: 'damethri@example.com' },
    update: {},
    create: {
      email: 'damethri@example.com',
      name: 'Damethri George',
      tier: 'premium'
    }
  });
  console.log('✅ Created user:', user1.name, `(${user1.tier})`);

  const user2 = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      name: 'John Doe',
      tier: 'free'
    }
  });
  console.log('✅ Created user:', user2.name, `(${user2.tier})`);

  const user3 = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      tier: 'enterprise'
    }
  });
  console.log('✅ Created user:', user3.name, `(${user3.tier})`);

  // Create courses
  const courses = [
    {
      code: 'LAW2105',
      name: 'Criminal Law',
      semester: 'Fall 2025',
      zoomLink: 'https://zoom.us/j/example1',
      schedule: JSON.stringify({ day: 'MON', time: '08:30', duration: 90 })
    },
    {
      code: 'LAW2109',
      name: 'Property Law',
      semester: 'Fall 2025',
      zoomLink: 'https://zoom.us/j/example2',
      schedule: JSON.stringify({ day: 'MON', time: '14:00', duration: 90 })
    },
    {
      code: 'LAW2108',
      name: 'Equity & Trusts',
      semester: 'Fall 2025',
      zoomLink: 'https://zoom.us/j/example3',
      schedule: JSON.stringify({ day: 'TUE', time: '14:00', duration: 90 })
    },
    {
      code: 'LAW2104',
      name: 'Contract Law',
      semester: 'Fall 2025',
      zoomLink: 'https://zoom.us/j/example4',
      schedule: JSON.stringify({ day: 'WED', time: '08:30', duration: 90 })
    }
  ];

  for (const course of courses) {
    const created = await prisma.course.upsert({
      where: { code: course.code },
      update: {},
      create: course
    });
    console.log('✅ Created course:', created.code, '-', created.name);
  }

  console.log('\n✨ Seeding complete!\n');
  console.log('Test users created:');
  console.log('  - damethri@example.com (premium)');
  console.log('  - john@example.com (free)');
  console.log('  - admin@example.com (enterprise)');
  console.log('\nCourses created:');
  courses.forEach(c => console.log(`  - ${c.code}: ${c.name}`));
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
