import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PrismaClient,
  PricingType,
  QuestionDifficulty,
  QuestionType,
  ResourceType,
  TestStatus,
  TestType,
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
const DEMO_QUESTION_1_ID = '60000000-0000-4000-8000-000000000001';
const DEMO_QUESTION_2_ID = '60000000-0000-4000-8000-000000000002';
const DEMO_QUESTION_3_ID = '60000000-0000-4000-8000-000000000003';
const DEMO_QUESTION_4_ID = '60000000-0000-4000-8000-000000000004';
const DEMO_QUESTION_5_ID = '60000000-0000-4000-8000-000000000005';
const DEMO_PLACEMENT_TEST_ID = '80000000-0000-4000-8000-000000000001';
const DEMO_QUIZ_TEST_ID = '80000000-0000-4000-8000-000000000002';
const DEMO_SKILL_GRAMMAR_ID = 'a0000000-0000-4000-8000-000000000001';
const DEMO_SKILL_VOCABULARY_ID = 'a0000000-0000-4000-8000-000000000002';
const DEMO_SKILL_READING_ID = 'a0000000-0000-4000-8000-000000000003';
const DEMO_SKILL_SENTENCE_ID = 'a0000000-0000-4000-8000-000000000004';

const questionSeeds = [
  {
    id: DEMO_QUESTION_1_ID,
    type: QuestionType.SINGLE_CHOICE,
    difficulty: QuestionDifficulty.EASY,
    content: 'Which greeting is appropriate when meeting someone in the morning?',
    explanation: '“Good morning” is the conventional morning greeting.',
    options: [
      { id: '70000000-0000-4000-8000-000000000001', content: 'Good morning', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000002', content: 'Good night', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000003', content: 'Goodbye', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000004', content: 'See you later', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_2_ID,
    type: QuestionType.TRUE_FALSE,
    difficulty: QuestionDifficulty.EASY,
    content: '“Hello” can be used as a greeting.',
    explanation: '“Hello” is a common general greeting.',
    options: [
      { id: '70000000-0000-4000-8000-000000000005', content: 'True', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000006', content: 'False', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_3_ID,
    type: QuestionType.SINGLE_CHOICE,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Choose the most polite response to “How are you?”',
    explanation: 'The complete polite response acknowledges the question and returns it.',
    options: [
      {
        id: '70000000-0000-4000-8000-000000000007',
        content: 'I am fine, thank you. And you?',
        isCorrect: true,
      },
      { id: '70000000-0000-4000-8000-000000000008', content: 'Morning', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000009', content: 'Goodbye', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000010', content: 'Please sit', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_4_ID,
    type: QuestionType.MULTIPLE_CHOICE,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Select all phrases that can be used to say goodbye.',
    explanation: 'Both “Goodbye” and “See you later” are leave-taking expressions.',
    options: [
      { id: '70000000-0000-4000-8000-000000000011', content: 'Goodbye', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000012', content: 'See you later', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000013', content: 'Good morning', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000014', content: 'How are you?', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_5_ID,
    type: QuestionType.SINGLE_CHOICE,
    difficulty: QuestionDifficulty.HARD,
    content: 'Which sentence uses the most appropriate formal introduction?',
    explanation: 'The formal construction introduces the speaker clearly and politely.',
    options: [
      {
        id: '70000000-0000-4000-8000-000000000015',
        content: 'Allow me to introduce myself; my name is Linh.',
        isCorrect: true,
      },
      { id: '70000000-0000-4000-8000-000000000016', content: 'Hey, me Linh.', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000017', content: 'Linh here, okay?', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000018', content: 'You call Linh.', isCorrect: false },
    ],
  },
] as const;

const placementQuestionSeeds = [
  { id: '90000000-0000-4000-8000-000000000001', questionId: DEMO_QUESTION_1_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000002', questionId: DEMO_QUESTION_2_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000003', questionId: DEMO_QUESTION_3_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000004', questionId: DEMO_QUESTION_4_ID, points: 2 },
  { id: '90000000-0000-4000-8000-000000000005', questionId: DEMO_QUESTION_5_ID, points: 1 },
] as const;

const quizQuestionSeeds = [
  { id: '90000000-0000-4000-8000-000000000006', questionId: DEMO_QUESTION_1_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000007', questionId: DEMO_QUESTION_2_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000008', questionId: DEMO_QUESTION_4_ID, points: 2 },
] as const;

const skillSeeds = [
  {
    id: DEMO_SKILL_GRAMMAR_ID,
    code: 'GRAMMAR_BASIC',
    name: 'Basic Grammar',
    description: 'Foundational grammar patterns for introductory English communication.',
    pInit: 0.5,
  },
  {
    id: DEMO_SKILL_VOCABULARY_ID,
    code: 'VOCAB_FOUNDATION',
    name: 'Vocabulary Foundation',
    description: 'Core vocabulary used in greetings and everyday exchanges.',
    pInit: 0.5,
  },
  {
    id: DEMO_SKILL_READING_ID,
    code: 'READING_COMPREHENSION',
    name: 'Reading Comprehension',
    description: 'Understanding meaning in short introductory English texts.',
    pInit: 0.3,
  },
  {
    id: DEMO_SKILL_SENTENCE_ID,
    code: 'SENTENCE_CONSTRUCTION',
    name: 'Sentence Construction',
    description: 'Building complete and appropriate English sentences.',
    pInit: 0.3,
  },
] as const;

const prerequisiteSeeds = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    skillId: DEMO_SKILL_SENTENCE_ID,
    prerequisiteSkillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    skillId: DEMO_SKILL_READING_ID,
    prerequisiteSkillId: DEMO_SKILL_VOCABULARY_ID,
  },
] as const;

const questionSkillSeeds = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    questionId: DEMO_QUESTION_1_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    questionId: DEMO_QUESTION_1_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    questionId: DEMO_QUESTION_2_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    questionId: DEMO_QUESTION_3_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000005',
    questionId: DEMO_QUESTION_3_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000006',
    questionId: DEMO_QUESTION_4_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000007',
    questionId: DEMO_QUESTION_5_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000008',
    questionId: DEMO_QUESTION_5_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
] as const;

const lessonSkillSeeds = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    lessonId: DEMO_LESSON_1_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    lessonId: DEMO_LESSON_1_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    lessonId: DEMO_LESSON_2_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    lessonId: DEMO_LESSON_2_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    lessonId: DEMO_LESSON_3_ID,
    skillId: DEMO_SKILL_READING_ID,
  },
] as const;

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

    // VS03: Stable assessment foundation data. Attempts and answers are intentionally not seeded.
    for (const questionSeed of questionSeeds) {
      await prisma.question.upsert({
        where: { id: questionSeed.id },
        update: {
          courseId: course.id,
          type: questionSeed.type,
          difficulty: questionSeed.difficulty,
          content: questionSeed.content,
          explanation: questionSeed.explanation,
        },
        create: {
          id: questionSeed.id,
          courseId: course.id,
          type: questionSeed.type,
          difficulty: questionSeed.difficulty,
          content: questionSeed.content,
          explanation: questionSeed.explanation,
        },
      });

      for (const [orderIndex, option] of questionSeed.options.entries()) {
        await prisma.questionOption.upsert({
          where: { id: option.id },
          update: {
            questionId: questionSeed.id,
            content: option.content,
            isCorrect: option.isCorrect,
            orderIndex,
          },
          create: {
            id: option.id,
            questionId: questionSeed.id,
            content: option.content,
            isCorrect: option.isCorrect,
            orderIndex,
          },
        });
      }
    }

    await prisma.test.upsert({
      where: { id: DEMO_PLACEMENT_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: null,
        type: TestType.PLACEMENT,
        title: 'Demo English Placement Test',
        description: 'A course-level placement assessment for local demonstrations.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_PLACEMENT_TEST_ID,
        courseId: course.id,
        lessonId: null,
        type: TestType.PLACEMENT,
        title: 'Demo English Placement Test',
        description: 'A course-level placement assessment for local demonstrations.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        showResultAfterSubmit: true,
      },
    });

    await prisma.test.upsert({
      where: { id: DEMO_QUIZ_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: DEMO_LESSON_2_ID,
        type: TestType.QUIZ,
        title: 'Demo Greetings Quiz',
        description: 'A lesson quiz covering greetings and leave-taking expressions.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_QUIZ_TEST_ID,
        courseId: course.id,
        lessonId: DEMO_LESSON_2_ID,
        type: TestType.QUIZ,
        title: 'Demo Greetings Quiz',
        description: 'A lesson quiz covering greetings and leave-taking expressions.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        showResultAfterSubmit: true,
      },
    });

    for (const [orderIndex, testQuestion] of placementQuestionSeeds.entries()) {
      await prisma.testQuestion.upsert({
        where: { id: testQuestion.id },
        update: {
          testId: DEMO_PLACEMENT_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
        create: {
          id: testQuestion.id,
          testId: DEMO_PLACEMENT_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
      });
    }

    for (const [orderIndex, testQuestion] of quizQuestionSeeds.entries()) {
      await prisma.testQuestion.upsert({
        where: { id: testQuestion.id },
        update: {
          testId: DEMO_QUIZ_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
        create: {
          id: testQuestion.id,
          testId: DEMO_QUIZ_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
      });
    }

    // VS04: Knowledge model seed. LearnerSkillState and MasteryHistory are intentionally not seeded.
    for (const skillSeed of skillSeeds) {
      await prisma.skill.upsert({
        where: { id: skillSeed.id },
        update: {
          courseId: course.id,
          code: skillSeed.code,
          name: skillSeed.name,
          description: skillSeed.description,
          pInit: skillSeed.pInit,
          pLearn: 0.1,
          pGuess: 0.2,
          pSlip: 0.1,
        },
        create: {
          ...skillSeed,
          courseId: course.id,
          pLearn: 0.1,
          pGuess: 0.2,
          pSlip: 0.1,
        },
      });
    }

    for (const prerequisite of prerequisiteSeeds) {
      await prisma.skillPrerequisite.upsert({
        where: {
          skillId_prerequisiteSkillId: {
            skillId: prerequisite.skillId,
            prerequisiteSkillId: prerequisite.prerequisiteSkillId,
          },
        },
        update: {},
        create: prerequisite,
      });
    }

    for (const mapping of questionSkillSeeds) {
      await prisma.questionSkill.upsert({
        where: {
          questionId_skillId: {
            questionId: mapping.questionId,
            skillId: mapping.skillId,
          },
        },
        update: {},
        create: mapping,
      });
    }

    for (const mapping of lessonSkillSeeds) {
      await prisma.lessonSkill.upsert({
        where: {
          lessonId_skillId: {
            lessonId: mapping.lessonId,
            skillId: mapping.skillId,
          },
        },
        update: {},
        create: mapping,
      });
    }

    console.log(
      'Development seed completed with demo users, catalog, learning, assessment, and knowledge-model data.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  console.error('Development seed failed. Check the local environment configuration.');
  process.exitCode = 1;
});
