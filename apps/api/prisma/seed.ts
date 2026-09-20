import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ClassOfferingStatus,
  PrismaClient,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';

const FREE_OFFERING_ID = '10000000-0000-4000-8000-000000000001';
const PAID_OFFERING_ID = '10000000-0000-4000-8000-000000000002';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_DEFAULT_PASSWORD;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed is disabled in production.');
  }
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the development seed.');
  }
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error(
      'SEED_DEFAULT_PASSWORD must be configured with 8 to 128 characters.',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const users = await Promise.all(
      [
        {
          email: 'admin.demo@smart-elearning.local',
          fullName: 'Demo Administrator',
          role: UserRole.ADMIN_COORDINATOR,
        },
        {
          email: 'instructor.demo@smart-elearning.local',
          fullName: 'Demo Instructor',
          role: UserRole.INSTRUCTOR,
        },
        {
          email: 'student.demo@smart-elearning.local',
          fullName: 'Demo Student',
          role: UserRole.STUDENT,
        },
      ].map((user) =>
        prisma.user.upsert({
          where: { email: user.email },
          update: {
            fullName: user.fullName,
            role: user.role,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
          create: {
            ...user,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
        }),
      ),
    );

    const admin = users.find(
      (user) => user.role === UserRole.ADMIN_COORDINATOR,
    );
    const instructor = users.find(
      (user) => user.role === UserRole.INSTRUCTOR,
    );
    if (!admin || !instructor) {
      throw new Error('Development seed could not prepare demo users.');
    }

    const course = await prisma.course.upsert({
      where: { slug: 'demo-english-foundations' },
      update: {
        title: 'Demo English Foundations',
        description: 'A small published course for local VS01 demonstrations.',
        level: 'BEGINNER',
        isPublished: true,
        createdById: admin.id,
      },
      create: {
        title: 'Demo English Foundations',
        slug: 'demo-english-foundations',
        description: 'A small published course for local VS01 demonstrations.',
        level: 'BEGINNER',
        isPublished: true,
        createdById: admin.id,
      },
    });

    await Promise.all([
      prisma.classOffering.upsert({
        where: { id: FREE_OFFERING_ID },
        update: {
          courseId: course.id,
          instructorId: instructor.id,
          name: 'Demo Free Cohort',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
          tuitionFeeVnd: 0,
          maxStudents: 25,
        },
        create: {
          id: FREE_OFFERING_ID,
          courseId: course.id,
          instructorId: instructor.id,
          name: 'Demo Free Cohort',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
          tuitionFeeVnd: 0,
          maxStudents: 25,
        },
      }),
      prisma.classOffering.upsert({
        where: { id: PAID_OFFERING_ID },
        update: {
          courseId: course.id,
          instructorId: instructor.id,
          name: 'Demo Paid Cohort',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 750_000,
          maxStudents: 20,
        },
        create: {
          id: PAID_OFFERING_ID,
          courseId: course.id,
          instructorId: instructor.id,
          name: 'Demo Paid Cohort',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 750_000,
          maxStudents: 20,
        },
      }),
    ]);

    console.log('Development seed completed with demo users and catalog data.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  console.error('Development seed failed. Check the local environment configuration.');
  process.exitCode = 1;
});
