import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

describe('Student adaptive-path API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentAgent: ReturnType<typeof request.agent>;
  let foreignStudentAgent: ReturnType<typeof request.agent>;
  let instructorAgent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const userIds: string[] = [];
  const offeringIds: string[] = [];
  const enrollmentIds: string[] = [];
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'AdaptivePathE2e!2026';
  let courseId: string;
  let enrollmentId: string;
  let inactiveEnrollmentId: string;
  let foundationSkillId: string;
  let dependentSkillId: string;
  let remedialSkillId: string;
  let remedialLessonId: string;
  let dependentLessonId: string;
  let unmappedLessonId: string;

  beforeAll(async () => {
    const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [admin, student, foreignStudent, instructor] = await Promise.all([
      createUser(`vs05-c2-admin-${unique}@example.test`, UserRole.ADMIN_COORDINATOR, passwordHash),
      createUser(`vs05-c2-student-${unique}@example.test`, UserRole.STUDENT, passwordHash),
      createUser(`vs05-c2-foreign-${unique}@example.test`, UserRole.STUDENT, passwordHash),
      createUser(`vs05-c2-instructor-${unique}@example.test`, UserRole.INSTRUCTOR, passwordHash),
    ]);
    userIds.push(admin.id, student.id, foreignStudent.id, instructor.id);

    const course = await prisma.course.create({
      data: {
        title: 'VS05 C2 Adaptive Course',
        slug: `vs05-c2-adaptive-${unique}`,
        description: 'Adaptive path E2E fixture',
        level: 'INTERMEDIATE',
        createdById: admin.id,
      },
    });
    courseId = course.id;

    const offerings = await Promise.all([
      prisma.classOffering.create({
        data: {
          courseId,
          instructorId: instructor.id,
          name: 'VS05 C2 Active Offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
      prisma.classOffering.create({
        data: {
          courseId,
          instructorId: instructor.id,
          name: 'VS05 C2 Inactive Offering',
          status: ClassOfferingStatus.OPEN,
          pricingType: PricingType.FREE,
        },
      }),
    ]);
    offeringIds.push(...offerings.map(({ id }) => id));

    const enrollments = await Promise.all([
      prisma.enrollment.create({
        data: {
          learnerId: student.id,
          classOfferingId: offerings[0].id,
          status: EnrollmentStatus.ACTIVE,
        },
      }),
      prisma.enrollment.create({
        data: {
          learnerId: student.id,
          classOfferingId: offerings[1].id,
          status: EnrollmentStatus.DROPPED,
        },
      }),
    ]);
    [enrollmentId, inactiveEnrollmentId] = enrollments.map(({ id }) => id);
    enrollmentIds.push(enrollmentId, inactiveEnrollmentId);

    const module = await prisma.module.create({
      data: { courseId, title: 'Adaptive Module', orderIndex: 1 },
    });
    const lessons = await Promise.all([
      prisma.lesson.create({
        data: { moduleId: module.id, title: 'Remedial Lesson', orderIndex: 1 },
      }),
      prisma.lesson.create({
        data: { moduleId: module.id, title: 'Dependent Lesson', orderIndex: 2 },
      }),
      prisma.lesson.create({
        data: { moduleId: module.id, title: 'Unmapped Lesson', orderIndex: 3 },
      }),
    ]);
    [remedialLessonId, dependentLessonId, unmappedLessonId] = lessons.map(({ id }) => id);

    const skills = await Promise.all([
      prisma.skill.create({
        data: { courseId, code: 'FOUNDATION', name: 'Foundation', pInit: 0.9 },
      }),
      prisma.skill.create({
        data: { courseId, code: 'DEPENDENT', name: 'Dependent', pInit: 0.5 },
      }),
      prisma.skill.create({
        data: { courseId, code: 'REMEDIAL', name: 'Remedial', pInit: 0.5 },
      }),
    ]);
    [foundationSkillId, dependentSkillId, remedialSkillId] = skills.map(({ id }) => id);
    await prisma.skillPrerequisite.create({
      data: { skillId: dependentSkillId, prerequisiteSkillId: foundationSkillId },
    });
    await prisma.lessonSkill.createMany({
      data: [
        { lessonId: remedialLessonId, skillId: remedialSkillId },
        { lessonId: dependentLessonId, skillId: dependentSkillId },
      ],
    });
    await prisma.learnerSkillState.create({
      data: {
        enrollmentId,
        skillId: remedialSkillId,
        masteryProbability: 0.2,
        observationCount: 2,
      },
    });
    await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId: remedialLessonId,
        status: LessonProgressStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    studentAgent = request.agent(app.getHttpServer());
    foreignStudentAgent = request.agent(app.getHttpServer());
    instructorAgent = request.agent(app.getHttpServer());
    await loginAgent(studentAgent, student.email, password, sessionIds);
    await loginAgent(foreignStudentAgent, foreignStudent.email, password, sessionIds);
    await loginAgent(instructorAgent, instructor.email, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.courseAdaptivePolicy.deleteMany({ where: { courseId } });
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.learnerSkillState.deleteMany({
        where: { enrollmentId: { in: enrollmentIds } },
      });
      await prisma.lessonSkill.deleteMany({
        where: { lesson: { module: { courseId } } },
      });
      await prisma.skillPrerequisite.deleteMany({ where: { skill: { courseId } } });
      await prisma.skill.deleteMany({ where: { courseId } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.lesson.deleteMany({ where: { module: { courseId } } });
      await prisma.module.deleteMany({ where: { courseId } });
      await prisma.classOffering.deleteMany({ where: { id: { in: offeringIds } } });
      await prisma.course.delete({ where: { id: courseId } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces authentication, Student role, ownership, and ACTIVE status', async () => {
    await request(app.getHttpServer())
      .get(`/api/learning/enrollments/${enrollmentId}/adaptive-path`)
      .expect(401);
    await instructorAgent
      .get(`/api/learning/enrollments/${enrollmentId}/adaptive-path`)
      .expect(403);
    const foreign = await foreignStudentAgent
      .get(`/api/learning/enrollments/${enrollmentId}/adaptive-path`)
      .expect(404);
    expectSafeError(foreign);
    const inactive = await studentAgent
      .get(`/api/learning/enrollments/${inactiveEnrollmentId}/adaptive-path`)
      .expect(404);
    expectSafeError(inactive);
  });

  it('returns a stable DEFAULT response without creating a policy row', async () => {
    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(0);
    const first = await adaptivePath();
    const second = await adaptivePath();

    expect(second.body).toEqual(first.body);
    expect(first.body).toMatchObject({
      enrollmentId,
      courseId,
      policy: {
        remedialThreshold: 0.4,
        progressionThreshold: 0.8,
        source: 'DEFAULT',
      },
      configurationStatus: 'PARTIALLY_MAPPED',
    });
    expect(first.body).toHaveProperty('skillClassifications');
    expect(first.body).toHaveProperty('path');
    expect(first.body).toHaveProperty('blockedLessons');
    expect(first.body).toHaveProperty('unmappedLessons');
    expect(JSON.stringify(first.body)).not.toMatch(
      /isCorrect|questionOption|correctOption|testAnswer|explanation/i,
    );
    await expect(prisma.courseAdaptivePolicy.count({ where: { courseId } })).resolves.toBe(0);
  });

  it('returns personalized mastery, review, blocked, and unmapped groups', async () => {
    const response = await adaptivePath();
    const remedial = response.body.skillClassifications.find(
      ({ skillId }: { skillId: string }) => skillId === remedialSkillId,
    );
    expect(remedial).toMatchObject({
      state: 'OBSERVED',
      masteryProbability: 0.2,
      masteryBand: 'REMEDIAL',
    });
    expect(response.body.path).toEqual([
      expect.objectContaining({
        lessonId: remedialLessonId,
        category: 'REMEDIAL',
        isCompleted: true,
        isReview: true,
        reason: expect.objectContaining({
          reasonCode: 'REMEDIAL_LOW_MASTERY',
          focusSkillId: remedialSkillId,
          masteryProbability: 0.2,
        }),
      }),
    ]);
    expect(response.body.blockedLessons).toEqual([
      expect.objectContaining({
        lessonId: dependentLessonId,
        reason: expect.objectContaining({
          reasonCode: 'LOCKED_PREREQUISITE',
          focusSkillId: dependentSkillId,
          unsatisfiedPrerequisites: [
            expect.objectContaining({ skillId: foundationSkillId, state: 'PRIOR' }),
          ],
        }),
      }),
    ]);
    expect(response.body.unmappedLessons).toEqual([
      expect.objectContaining({ lessonId: unmappedLessonId }),
    ]);
  });

  it('unblocks the dependent Lesson on the next GET from current observed mastery', async () => {
    await prisma.learnerSkillState.create({
      data: {
        enrollmentId,
        skillId: foundationSkillId,
        masteryProbability: 0.8,
        observationCount: 1,
      },
    });

    const response = await adaptivePath();

    expect(response.body.blockedLessons).toEqual([]);
    expect(response.body.path).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: dependentLessonId,
          category: 'PROGRESSION',
          reason: expect.objectContaining({
            reasonCode: 'PROGRESSION_PREREQUISITES_READY',
            focusSkillId: dependentSkillId,
          }),
        }),
      ]),
    );
  });

  it('recomputes the path after persisted mastery changes without an adaptive hook', async () => {
    const before = await adaptivePath();
    expect(
      before.body.path.some(({ lessonId }: { lessonId: string }) => lessonId === remedialLessonId),
    ).toBe(true);

    await prisma.learnerSkillState.update({
      where: { enrollmentId_skillId: { enrollmentId, skillId: remedialSkillId } },
      data: { masteryProbability: 0.9, observationCount: { increment: 1 } },
    });
    const after = await adaptivePath();

    expect(
      after.body.path.some(({ lessonId }: { lessonId: string }) => lessonId === remedialLessonId),
    ).toBe(false);
    expect(
      after.body.skillClassifications.find(
        ({ skillId }: { skillId: string }) => skillId === remedialSkillId,
      ),
    ).toMatchObject({ masteryProbability: 0.9, masteryBand: 'PROGRESSION_READY' });
  });

  it('returns SAVED policy values without mutating the policy on GET', async () => {
    const policy = await prisma.courseAdaptivePolicy.create({
      data: { courseId, remedialThreshold: 0.3, progressionThreshold: 0.9 },
    });

    const response = await adaptivePath();
    const unchanged = await prisma.courseAdaptivePolicy.findUniqueOrThrow({
      where: { courseId },
    });

    expect(response.body.policy).toEqual({
      remedialThreshold: 0.3,
      progressionThreshold: 0.9,
      source: 'SAVED',
    });
    expect(unchanged).toEqual(policy);
  });

  function adaptivePath() {
    return studentAgent.get(`/api/learning/enrollments/${enrollmentId}/adaptive-path`).expect(200);
  }

  function createUser(email: string, role: UserRole, passwordHash: string) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: `VS05 C2 ${role}`,
        role,
        status: UserStatus.ACTIVE,
      },
    });
  }
});
