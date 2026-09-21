import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PrismaClient,
  PricingType,
  ResourceType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';

const FREE_OFFERING_ID = '10000000-0000-4000-8000-000000000001';
const PAID_OFFERING_ID = '10000000-0000-4000-8000-000000000002';
const DEMO_MODULE_1_ID = '20000000-0000-4000-8000-000000000001';
const DEMO_MODULE_2_ID = '20000000-0000-4000-8000-000000000002';
const DEMO_LESSON_1_ID = '30000000-0000-4000-8000-000000000001';
const DEMO_LESSON_2_ID = '30000000-0000-4000-8000-000000000002';
const DEMO_LESSON_3_ID = '30000000-0000-4000-8000-000000000003';
const DEMO_RESOURCE_VIDEO_ID = '40000000-0000-4000-8000-000000000001';
const DEMO_RESOURCE_DOC_ID = '40000000-0000-4000-8000-000000000002';
const DEMO_RESOURCE_LINK_ID = '40000000-0000-4000-8000-000000000003';
const DEMO_ENROLLMENT_ID = '50000000-0000-4000-8000-000000000001';

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
    throw new Error('SEED_DEFAULT_PASSWORD must be configured with 8 to 128 characters.');
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

    const admin = users.find((user) => user.role === UserRole.ADMIN_COORDINATOR);
    const instructor = users.find((user) => user.role === UserRole.INSTRUCTOR);
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

    // ── VS02: Modules, Lessons, Resources ──────────────────────────
    const student = users.find((user) => user.role === UserRole.STUDENT);
    if (!student) {
      throw new Error('Development seed could not find demo student.');
    }

    // Module 1: Getting Started
    await prisma.module.upsert({
      where: { id: DEMO_MODULE_1_ID },
      update: {
        courseId: course.id,
        title: 'Getting Started',
        description: 'Welcome to the course! This module covers the basics.',
        orderIndex: 0,
      },
      create: {
        id: DEMO_MODULE_1_ID,
        courseId: course.id,
        title: 'Getting Started',
        description: 'Welcome to the course! This module covers the basics.',
        orderIndex: 0,
      },
    });

    // Module 2: Everyday Vocabulary
    await prisma.module.upsert({
      where: { id: DEMO_MODULE_2_ID },
      update: {
        courseId: course.id,
        title: 'Everyday Vocabulary',
        description: 'Learn common English words used in daily life.',
        orderIndex: 1,
      },
      create: {
        id: DEMO_MODULE_2_ID,
        courseId: course.id,
        title: 'Everyday Vocabulary',
        description: 'Learn common English words used in daily life.',
        orderIndex: 1,
      },
    });

    // Lesson 1: Welcome & Course Overview (in Module 1)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_1_ID },
      update: {
        moduleId: DEMO_MODULE_1_ID,
        title: 'Welcome & Course Overview',
        description: 'An introduction to the course structure and learning objectives.',
        orderIndex: 0,
      },
      create: {
        id: DEMO_LESSON_1_ID,
        moduleId: DEMO_MODULE_1_ID,
        title: 'Welcome & Course Overview',
        description: 'An introduction to the course structure and learning objectives.',
        orderIndex: 0,
      },
    });

    // Lesson 2: Basic Greetings (in Module 1)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_2_ID },
      update: {
        moduleId: DEMO_MODULE_1_ID,
        title: 'Basic Greetings',
        description: 'Learn how to greet people in English.',
        orderIndex: 1,
      },
      create: {
        id: DEMO_LESSON_2_ID,
        moduleId: DEMO_MODULE_1_ID,
        title: 'Basic Greetings',
        description: 'Learn how to greet people in English.',
        orderIndex: 1,
      },
    });

    // Lesson 3: Common Words (in Module 2)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_3_ID },
      update: {
        moduleId: DEMO_MODULE_2_ID,
        title: 'Common Words',
        description: 'Essential vocabulary for everyday communication.',
        orderIndex: 0,
      },
      create: {
        id: DEMO_LESSON_3_ID,
        moduleId: DEMO_MODULE_2_ID,
        title: 'Common Words',
        description: 'Essential vocabulary for everyday communication.',
        orderIndex: 0,
      },
    });

    // Resources for Lesson 1
    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_VIDEO_ID },
      update: {
        lessonId: DEMO_LESSON_1_ID,
        title: 'Introduction Video',
        type: ResourceType.VIDEO,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        orderIndex: 0,
        isDownloadable: false,
      },
      create: {
        id: DEMO_RESOURCE_VIDEO_ID,
        lessonId: DEMO_LESSON_1_ID,
        title: 'Introduction Video',
        type: ResourceType.VIDEO,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        orderIndex: 0,
        isDownloadable: false,
      },
    });

    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_DOC_ID },
      update: {
        lessonId: DEMO_LESSON_1_ID,
        title: 'Course Syllabus',
        type: ResourceType.DOCUMENT,
        url: 'https://example.com/demo-syllabus.pdf',
        orderIndex: 1,
        isDownloadable: true,
      },
      create: {
        id: DEMO_RESOURCE_DOC_ID,
        lessonId: DEMO_LESSON_1_ID,
        title: 'Course Syllabus',
        type: ResourceType.DOCUMENT,
        url: 'https://example.com/demo-syllabus.pdf',
        orderIndex: 1,
        isDownloadable: true,
      },
    });

    // Resource for Lesson 2
    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_LINK_ID },
      update: {
        lessonId: DEMO_LESSON_2_ID,
        title: 'Practice Exercises',
        type: ResourceType.LINK,
        url: 'https://example.com/demo-exercises',
        orderIndex: 0,
        isDownloadable: false,
      },
      create: {
        id: DEMO_RESOURCE_LINK_ID,
        lessonId: DEMO_LESSON_2_ID,
        title: 'Practice Exercises',
        type: ResourceType.LINK,
        url: 'https://example.com/demo-exercises',
        orderIndex: 0,
        isDownloadable: false,
      },
    });

    // Demo enrollment for student in free offering
    await prisma.enrollment.upsert({
      where: {
        learnerId_classOfferingId: {
          learnerId: student.id,
          classOfferingId: FREE_OFFERING_ID,
        },
      },
      update: {
        status: EnrollmentStatus.ACTIVE,
      },
      create: {
        id: DEMO_ENROLLMENT_ID,
        learnerId: student.id,
        classOfferingId: FREE_OFFERING_ID,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    console.log(
      'Development seed completed with demo users, catalog data, and VS02 learning content.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  console.error('Development seed failed. Check the local environment configuration.');
  process.exitCode = 1;
});
