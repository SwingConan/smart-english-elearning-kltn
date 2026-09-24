import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { expectSafeError, loginAgent } from './assessment-e2e-helpers';

describe('Instructor learner-mastery API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let instructorAAgent: ReturnType<typeof request.agent>;
  let instructorBAgent: ReturnType<typeof request.agent>;
  let unassignedAgent: ReturnType<typeof request.agent>;
  let studentAgent: ReturnType<typeof request.agent>;

  const sessionIds = new Set<string>();
  const runSuffix = Date.now().toString(16).slice(-12).padStart(12, '0');
  const id = (prefix: number) =>
    `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${runSuffix}`;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'InstructorMasteryE2e!2026';

  const users = {
    admin: { id: id(0x10000001), email: `vs06-admin-${unique}@example.test` },
    instructorA: { id: id(0x10000002), email: `vs06-instructor-a-${unique}@example.test` },
    instructorB: { id: id(0x10000003), email: `vs06-instructor-b-${unique}@example.test` },
    unassigned: { id: id(0x10000004), email: `vs06-unassigned-${unique}@example.test` },
    wrongRole: { id: id(0x10000005), email: `vs06-student-${unique}@example.test` },
    sameLearnerLow: { id: id(0x10000006), email: `vs06-learner-low-${unique}@example.test` },
    sameNameHigh: { id: id(0x10000007), email: `vs06-learner-high-${unique}@example.test` },
    learnerB: { id: id(0x10000008), email: `vs06-learner-b-${unique}@example.test` },
    pending: { id: id(0x10000009), email: `vs06-pending-${unique}@example.test` },
    completed: { id: id(0x1000000a), email: `vs06-completed-${unique}@example.test` },
    dropped: { id: id(0x1000000b), email: `vs06-dropped-${unique}@example.test` },
    cancelled: { id: id(0x1000000c), email: `vs06-cancelled-${unique}@example.test` },
    noSkills: { id: id(0x1000000d), email: `vs06-no-skills-${unique}@example.test` },
    savedPolicy: { id: id(0x1000000e), email: `vs06-saved-policy-${unique}@example.test` },
  };
  const userIds = Object.values(users).map(({ id: userId }) => userId);

  const courses = {
    core: id(0x20000001),
    onlyB: id(0x20000002),
    emptyLearners: id(0x20000003),
    noSkills: id(0x20000004),
    savedPolicy: id(0x20000005),
  };
  const courseIds = Object.values(courses);

  const skills = {
    a: id(0x30000001),
    m: id(0x30000002),
    z: id(0x30000003),
    emptyLearners: id(0x30000004),
    savedPolicy: id(0x30000005),
  };

  const offerings = {
    alphaLow: id(0x60000001),
    alphaHigh: id(0x60000002),
    beta: id(0x60000003),
    gammaB: id(0x60000004),
    onlyB: id(0x60000005),
    emptyLearners: id(0x60000006),
    noSkills: id(0x60000007),
    savedPolicy: id(0x60000008),
    pending: id(0x60000009),
    completed: id(0x6000000a),
    dropped: id(0x6000000b),
    cancelled: id(0x6000000c),
  };

  const enrollments = {
    alphaLow: id(0x70000001),
    alphaLowHighLearner: id(0x70000002),
    alphaHigh: id(0x70000003),
    beta: id(0x70000004),
    gammaB: id(0x70000005),
    noSkills: id(0x70000006),
    savedPolicy: id(0x70000007),
    pending: id(0x70000008),
    completed: id(0x70000009),
    dropped: id(0x7000000a),
    cancelled: id(0x7000000b),
  };
  const enrollmentIds = Object.values(enrollments);
  const observedAt = new Date('2026-09-24T01:00:00.000Z');

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
    await prisma.user.createMany({
      data: [
        { ...users.admin, fullName: 'VS06 Admin', role: UserRole.ADMIN_COORDINATOR },
        { ...users.instructorA, fullName: 'VS06 Instructor A', role: UserRole.INSTRUCTOR },
        { ...users.instructorB, fullName: 'VS06 Instructor B', role: UserRole.INSTRUCTOR },
        { ...users.unassigned, fullName: 'VS06 Unassigned', role: UserRole.INSTRUCTOR },
        { ...users.wrongRole, fullName: 'VS06 Wrong Role', role: UserRole.STUDENT },
        { ...users.sameLearnerLow, fullName: 'Same Learner', role: UserRole.STUDENT },
        { ...users.sameNameHigh, fullName: 'Same Learner', role: UserRole.STUDENT },
        { ...users.learnerB, fullName: 'Learner B', role: UserRole.STUDENT },
        { ...users.pending, fullName: 'Pending Learner', role: UserRole.STUDENT },
        { ...users.completed, fullName: 'Completed Learner', role: UserRole.STUDENT },
        { ...users.dropped, fullName: 'Dropped Learner', role: UserRole.STUDENT },
        { ...users.cancelled, fullName: 'Cancelled Learner', role: UserRole.STUDENT },
        { ...users.noSkills, fullName: 'No Skills Learner', role: UserRole.STUDENT },
        { ...users.savedPolicy, fullName: 'Saved Policy Learner', role: UserRole.STUDENT },
      ].map((user) => ({ ...user, passwordHash, status: UserStatus.ACTIVE })),
    });

    await prisma.course.createMany({
      data: [
        { id: courses.core, title: 'VS06 Core', slug: `vs06-core-${unique}` },
        { id: courses.onlyB, title: 'VS06 Only B', slug: `vs06-only-b-${unique}` },
        {
          id: courses.emptyLearners,
          title: 'VS06 Empty Learners',
          slug: `vs06-empty-learners-${unique}`,
        },
        { id: courses.noSkills, title: 'VS06 No Skills', slug: `vs06-no-skills-${unique}` },
        {
          id: courses.savedPolicy,
          title: 'VS06 Saved Policy',
          slug: `vs06-saved-policy-${unique}`,
        },
      ].map((course) => ({
        ...course,
        description: 'VS06 instructor learner mastery E2E fixture',
        level: 'E2E',
        createdById: users.admin.id,
      })),
    });

    await prisma.classOffering.createMany({
      data: [
        [offerings.alphaHigh, courses.core, users.instructorA.id, 'Alpha Class'],
        [offerings.gammaB, courses.core, users.instructorB.id, 'Gamma Class'],
        [offerings.beta, courses.core, users.instructorA.id, 'Beta Class'],
        [offerings.alphaLow, courses.core, users.instructorA.id, 'Alpha Class'],
        [offerings.pending, courses.core, users.instructorA.id, 'Pending Class'],
        [offerings.completed, courses.core, users.instructorA.id, 'Completed Class'],
        [offerings.dropped, courses.core, users.instructorA.id, 'Dropped Class'],
        [offerings.cancelled, courses.core, users.instructorA.id, 'Cancelled Class'],
        [offerings.onlyB, courses.onlyB, users.instructorB.id, 'Only B Class'],
        [offerings.emptyLearners, courses.emptyLearners, users.instructorA.id, 'Empty Class'],
        [offerings.noSkills, courses.noSkills, users.instructorA.id, 'No Skills Class'],
        [offerings.savedPolicy, courses.savedPolicy, users.instructorA.id, 'Saved Policy Class'],
      ].map(([offeringId, courseId, instructorId, name]) => ({
        id: offeringId,
        courseId,
        instructorId,
        name,
        status: ClassOfferingStatus.OPEN,
        pricingType: PricingType.FREE,
      })),
    });

    await prisma.enrollment.createMany({
      data: [
        [enrollments.beta, users.sameLearnerLow.id, offerings.beta, EnrollmentStatus.ACTIVE],
        [enrollments.alphaHigh, users.sameLearnerLow.id, offerings.alphaHigh, EnrollmentStatus.ACTIVE],
        [enrollments.gammaB, users.learnerB.id, offerings.gammaB, EnrollmentStatus.ACTIVE],
        [
          enrollments.alphaLowHighLearner,
          users.sameNameHigh.id,
          offerings.alphaLow,
          EnrollmentStatus.ACTIVE,
        ],
        [enrollments.alphaLow, users.sameLearnerLow.id, offerings.alphaLow, EnrollmentStatus.ACTIVE],
        [enrollments.noSkills, users.noSkills.id, offerings.noSkills, EnrollmentStatus.ACTIVE],
        [
          enrollments.savedPolicy,
          users.savedPolicy.id,
          offerings.savedPolicy,
          EnrollmentStatus.ACTIVE,
        ],
        [enrollments.pending, users.pending.id, offerings.pending, EnrollmentStatus.PENDING_PAYMENT],
        [enrollments.completed, users.completed.id, offerings.completed, EnrollmentStatus.COMPLETED],
        [enrollments.dropped, users.dropped.id, offerings.dropped, EnrollmentStatus.DROPPED],
        [enrollments.cancelled, users.cancelled.id, offerings.cancelled, EnrollmentStatus.CANCELLED],
      ].map(([enrollmentId, learnerId, classOfferingId, status]) => ({
        id: enrollmentId,
        learnerId,
        classOfferingId,
        status: status as EnrollmentStatus,
      })),
    });

    await prisma.skill.createMany({
      data: [
        { id: skills.z, courseId: courses.core, code: 'Z_SKILL', name: 'Z Skill', pInit: 0.91 },
        {
          id: skills.savedPolicy,
          courseId: courses.savedPolicy,
          code: 'SAVED_SKILL',
          name: 'Saved Skill',
          pInit: 0.5,
        },
        { id: skills.m, courseId: courses.core, code: 'M_SKILL', name: 'M Skill', pInit: 0.5 },
        {
          id: skills.emptyLearners,
          courseId: courses.emptyLearners,
          code: 'EMPTY_SKILL',
          name: 'Empty Skill',
          pInit: 0.5,
        },
        { id: skills.a, courseId: courses.core, code: 'A_SKILL', name: 'A Skill', pInit: 0.3 },
      ],
    });

    await prisma.learnerSkillState.createMany({
      data: [
        {
          enrollmentId: enrollments.alphaLow,
          skillId: skills.a,
          masteryProbability: 0.4,
          observationCount: 2,
          lastObservedAt: observedAt,
        },
        {
          enrollmentId: enrollments.alphaLow,
          skillId: skills.m,
          masteryProbability: 0.8,
          observationCount: 4,
          lastObservedAt: observedAt,
        },
        {
          enrollmentId: enrollments.savedPolicy,
          skillId: skills.savedPolicy,
          masteryProbability: 0.3,
          observationCount: 1,
          lastObservedAt: observedAt,
        },
      ],
    });

    await prisma.courseAdaptivePolicy.create({
      data: {
        courseId: courses.savedPolicy,
        remedialThreshold: 0.2,
        progressionThreshold: 0.6,
      },
    });

    instructorAAgent = request.agent(app.getHttpServer());
    instructorBAgent = request.agent(app.getHttpServer());
    unassignedAgent = request.agent(app.getHttpServer());
    studentAgent = request.agent(app.getHttpServer());
    await loginAgent(instructorAAgent, users.instructorA.email, password, sessionIds);
    await loginAgent(instructorBAgent, users.instructorB.email, password, sessionIds);
    await loginAgent(unassignedAgent, users.unassigned.email, password, sessionIds);
    await loginAgent(studentAgent, users.wrongRole.email, password, sessionIds);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.masteryHistory.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.learnerSkillState.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await prisma.courseAdaptivePolicy.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
      await prisma.skill.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.classOffering.deleteMany({ where: { courseId: { in: courseIds } } });
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      await prisma.userSession.deleteMany({ where: { sid: { in: [...sessionIds] } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('enforces real authentication, role, assignment, and cross-Course IDOR boundaries', async () => {
    await request(app.getHttpServer())
      .get(`/api/instructor/courses/${courses.core}/learner-mastery`)
      .expect(401);
    await studentAgent
      .get(`/api/instructor/courses/${courses.core}/learner-mastery`)
      .expect(403);

    const unassigned = await unassignedAgent
      .get(`/api/instructor/courses/${courses.core}/learner-mastery`)
      .expect(404);
    expectSafeError(unassigned);

    const crossCourse = await instructorAAgent
      .get(`/api/instructor/courses/${courses.onlyB}/learner-mastery`)
      .expect(404);
    expectSafeError(crossCourse);

    await instructorAAgent
      .get(`/api/instructor/courses/${courses.core}/learner-mastery`)
      .expect(200);
  });

  it('isolates same-Course Instructors while retaining all own ACTIVE Enrollment rows', async () => {
    const responseA = await dashboard(instructorAAgent, courses.core);
    const responseB = await dashboard(instructorBAgent, courses.core);
    const idsA = responseA.body.learners.map(({ enrollmentId }: { enrollmentId: string }) =>
      enrollmentId,
    );
    const idsB = responseB.body.learners.map(({ enrollmentId }: { enrollmentId: string }) =>
      enrollmentId,
    );

    expect(idsA).toEqual([
      enrollments.alphaLow,
      enrollments.alphaLowHighLearner,
      enrollments.alphaHigh,
      enrollments.beta,
    ]);
    expect(idsA).not.toContain(enrollments.gammaB);
    expect(idsB).toEqual([enrollments.gammaB]);
    expect(idsB).not.toContain(enrollments.alphaLow);
    expect(
      responseA.body.learners
        .filter(({ learnerId }: { learnerId: string }) => learnerId === users.sameLearnerLow.id)
        .map(({ enrollmentId }: { enrollmentId: string }) => enrollmentId),
    ).toEqual([enrollments.alphaLow, enrollments.alphaHigh, enrollments.beta]);

    for (const inactiveId of [
      enrollments.pending,
      enrollments.completed,
      enrollments.dropped,
      enrollments.cancelled,
    ]) {
      expect(idsA).not.toContain(inactiveId);
    }
  });

  it('returns deterministic Skills and PRIOR/OBSERVED states at exact boundaries', async () => {
    const response = await dashboard(instructorAAgent, courses.core);
    expect(response.body.skills.map(({ skillId }: { skillId: string }) => skillId)).toEqual([
      skills.a,
      skills.m,
      skills.z,
    ]);

    const row = response.body.learners.find(
      ({ enrollmentId }: { enrollmentId: string }) => enrollmentId === enrollments.alphaLow,
    );
    expect(row.skillStates).toEqual([
      {
        skillId: skills.a,
        state: 'OBSERVED',
        masteryProbability: 0.4,
        masteryBand: 'REINFORCEMENT',
        observationCount: 2,
        lastObservedAt: observedAt.toISOString(),
      },
      {
        skillId: skills.m,
        state: 'OBSERVED',
        masteryProbability: 0.8,
        masteryBand: 'PROGRESSION_READY',
        observationCount: 4,
        lastObservedAt: observedAt.toISOString(),
      },
      {
        skillId: skills.z,
        state: 'PRIOR',
        masteryProbability: 0.91,
        masteryBand: 'UNASSESSED',
        observationCount: 0,
        lastObservedAt: null,
      },
    ]);
  });

  it('returns DEFAULT repeatedly and leaves dashboard-related database state unchanged', async () => {
    const before = await snapshot(courses.core);
    const first = await dashboard(instructorAAgent, courses.core);
    const second = await dashboard(instructorAAgent, courses.core);
    const after = await snapshot(courses.core);

    expect(first.body.policy).toEqual({
      remedialThreshold: 0.4,
      progressionThreshold: 0.8,
      source: 'DEFAULT',
    });
    expect(second.body).toEqual(first.body);
    expect(after).toEqual(before);
    await expect(
      prisma.courseAdaptivePolicy.count({ where: { courseId: courses.core } }),
    ).resolves.toBe(0);
  });

  it('uses SAVED thresholds to classify current persisted mastery', async () => {
    const response = await dashboard(instructorAAgent, courses.savedPolicy);

    expect(response.body.policy).toEqual({
      remedialThreshold: 0.2,
      progressionThreshold: 0.6,
      source: 'SAVED',
    });
    expect(response.body.learners[0].skillStates[0]).toMatchObject({
      masteryProbability: 0.3,
      masteryBand: 'REINFORCEMENT',
      state: 'OBSERVED',
    });
  });

  it('returns 200 with Skills and no learners when there are zero ACTIVE Enrollments', async () => {
    const response = await dashboard(instructorAAgent, courses.emptyLearners);

    expect(response.body.skills).toEqual([
      { skillId: skills.emptyLearners, code: 'EMPTY_SKILL', name: 'Empty Skill' },
    ]);
    expect(response.body.learners).toEqual([]);
  });

  it('returns 200 with learners and empty skillStates when the Course has zero Skills', async () => {
    const response = await dashboard(instructorAAgent, courses.noSkills);

    expect(response.body.skills).toEqual([]);
    expect(response.body.learners).toEqual([
      expect.objectContaining({ enrollmentId: enrollments.noSkills, skillStates: [] }),
    ]);
  });

  it('returns only the approved dashboard shape without learner or assessment secrets', async () => {
    const response = await dashboard(instructorAAgent, courses.core);
    const serialized = JSON.stringify(response.body);

    expect(Object.keys(response.body).sort()).toEqual(['courseId', 'learners', 'policy', 'skills']);
    for (const learner of response.body.learners) {
      expect(Object.keys(learner).sort()).toEqual([
        'classOffering',
        'enrollmentId',
        'learnerId',
        'learnerName',
        'skillStates',
      ]);
    }
    expect(serialized).not.toMatch(
      /email|password|session|testAnswer|answerContent|questionOption|isCorrect|explanation|score/i,
    );
  });

  function dashboard(agent: ReturnType<typeof request.agent>, courseId: string) {
    return agent.get(`/api/instructor/courses/${courseId}/learner-mastery`).expect(200);
  }

  async function snapshot(courseId: string) {
    const enrollmentWhere = { classOffering: { courseId } };
    const [learnerStates, policyCount, historyCount, enrollmentRows, lessonProgressCount] =
      await Promise.all([
        prisma.learnerSkillState.findMany({
          where: { enrollment: enrollmentWhere },
          select: {
            id: true,
            enrollmentId: true,
            skillId: true,
            masteryProbability: true,
            observationCount: true,
            lastObservedAt: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.courseAdaptivePolicy.count({ where: { courseId } }),
        prisma.masteryHistory.count({ where: { enrollment: enrollmentWhere } }),
        prisma.enrollment.findMany({
          where: enrollmentWhere,
          select: { id: true, status: true, updatedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.lessonProgress.count({ where: { enrollment: enrollmentWhere } }),
      ]);

    return { learnerStates, policyCount, historyCount, enrollmentRows, lessonProgressCount };
  }
});
