import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave02 } from './wave02.fixture';
import { catalogDiagnosticSnapshot } from '../src/modules/courses/catalog-diagnostics.interceptor';
const enabled = !!process.env.WAVE01_PG_URL;
(enabled ? describe : describe.skip)('Wave02A existing-schema academic HTTP + PostgreSQL', () => {
  let dev: Awaited<ReturnType<typeof startWave01App>>, f: Awaited<ReturnType<typeof seedWave02>>;
  const agents = new Map<string, ReturnType<typeof request.agent>>(),
    observations: object[] = [];
  const reason = 'Synthetic W02A bounded academic change for DEV';
  let programId: string, classId: string;
  beforeAll(async () => {
    dev = await startWave01App();
    f = await seedWave02(dev.prisma);
    for (const u of [...f.users, f.otherAcademic, ...f.contenders]) {
      const a = request.agent(dev.app.getHttpServer());
      await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
      agents.set(u.id, a);
    }
  }, 60000);
  afterAll(async () => {
    if (dev) {
      const evidenceRoot = process.env.WAVE02_EVIDENCE_ROOT ?? '.local-storage/v2-wave02';
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(
        resolve(evidenceRoot, 'w02-http-evidence.json'),
        JSON.stringify(observations, null, 2),
      );
      if (f) {
        await dev.prisma.user.updateMany({
          where: {
            id: {
              in: [
                ...f.users.map((u) => u.id),
                f.otherAcademic.id,
                ...f.contenders.map((u) => u.id),
              ],
            },
          },
          data: { status: 'INACTIVE' },
        });
        await dev.prisma.domainAuditEvent.create({
          data: {
            actorId: f.academic.id,
            action: 'DEV_FIXTURE_RETIRED',
            objectType: 'FIXTURE',
            objectId: f.academic.id,
            decision: 'DEV_ONLY',
            reason:
              'Retire only isolated W02 synthetic actors; preserve users, grants and immutable audit',
          },
        });
      }
      await dev.app.close();
    }
  });
  const a = (id: string) => agents.get(id)!;
  const program = () => ({
    title: 'W02 draft ' + randomUUID().slice(0, 8),
    description: 'Draft outcomes and standards',
    level: 'BASIC',
    skillScope: 'LR',
    reason,
  });
  const classroom = (courseId = programId) => ({
    courseId,
    code: 'W02-DRAFT-' + randomUUID().slice(0, 8),
    name: 'W02 test draft class',
    modality: 'ONLINE',
    maxStudents: 10,
    pricingType: 'FREE',
    tuitionFeeVnd: 0,
    reason,
  });
  it('public catalog uses published PostgreSQL data, filters/pagination and safe projections; drafts/private meeting links hidden', async () => {
    const pub = request(dev.app.getHttpServer());
    await pub.get('/api/v2/academic/programs').expect(401);
    await pub.get('/api/v2/academic/classes').expect(401);
    const page = await pub.get('/api/courses?search=W02%20TOEIC&limit=1&page=1');
    if (page.status >= 500) {
      const root = process.env.WAVE02_EVIDENCE_ROOT ?? '.local-storage/v2-wave02';
      await mkdir(root, { recursive: true });
      const evidence = {
        finding: 'CF-W03BC-01',
        stopTheLine: true,
        status: page.status,
        requestId: page.headers['x-request-id'],
        safeTrace: catalogDiagnosticSnapshot(),
      };
      await writeFile(
        resolve(root, 'catalog-availability-stop.json'),
        JSON.stringify(evidence, null, 2),
      );
      throw new Error('STOP_THE_LINE_CF_W03BC_01 ' + page.headers['x-request-id']);
    }
    expect(page.status).toBe(200);
    expect(page.body.data[0].id).toBe(f.published.id);
    expect(page.body.meta.total).toBe(1);
    const detail = await pub.get('/api/courses/' + f.published.slug).expect(200);
    expect(detail.body.modules[0].title).toBe('Nghe hiểu nền tảng');
    expect(
      detail.body.classOfferings.find((r: { id: string }) => r.id === f.classroom.id)
        .registeredCount,
    ).toBe(1);
    const cls = await pub.get('/api/class-offerings/' + f.classroom.id).expect(200);
    expect(cls.body.remainingSeats).toBe(1);
    for (const body of [detail.body, cls.body])
      expect(JSON.stringify(body)).not.toMatch(
        /PRIVATE_MEET_W02|meetingUrl|passwordHash|learnerId|rubric/,
      );
    await pub.get('/api/courses/' + f.foreignDraft.slug).expect(404);
    await pub.get('/api/class-offerings/' + f.foreignDraftClass.id).expect(404);
    await pub.get('/api/courses?limit=999').expect(400);
  });
  it('all non-HVU roles cannot mutate academic data; legacy endpoints stay frozen for all roles', async () => {
    const users = [...f.users.slice(0, 8), f.otherAcademic];
    const id = randomUUID(),
      routes = [
        ['POST', 'programs'],
        ['PATCH', 'programs/' + id],
        ['POST', 'classes'],
        ['PATCH', 'classes/' + id],
        ['POST', 'classes/' + id + '/weekly-templates'],
        ['PATCH', 'classes/' + id + '/weekly-templates/' + id],
        ['DELETE', 'classes/' + id + '/weekly-templates/' + id],
      ];
    for (const u of users) {
      const programs = await a(u.id).get('/api/v2/academic/programs');
      expect(programs.status).toBe(u.role === 'ACADEMIC_MANAGER' ? 200 : 403);
      const classes = await a(u.id).get('/api/v2/academic/classes');
      expect(classes.status).toBe(
        ['ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT'].includes(u.role) ? 200 : 403,
      );
      observations.push(
        { role: u.role, method: 'GET', path: 'programs', status: programs.status },
        { role: u.role, method: 'GET', path: 'classes', status: classes.status },
      );
      for (const [method, path] of routes) {
        const agent = a(u.id);
        const res = await agent[method.toLowerCase() as 'post']('/api/v2/academic/' + path).send(
          {},
        );
        expect(res.status).toBe(u.role === 'ACADEMIC_MANAGER' ? 400 : 403);
        observations.push({ role: u.role, method, path, status: res.status });
      }
      await a(u.id).post('/api/admin/courses').send(program()).expect(403);
      await a(u.id).post('/api/admin/class-offerings').send(classroom(f.published.id)).expect(403);
    }
  });
  it('HVU creates auditable owned program/class drafts; foreign ownership is denied', async () => {
    const p = await a(f.academic.id).post('/api/v2/academic/programs').send(program()).expect(201);
    programId = p.body.id;
    const c = await a(f.academic.id).post('/api/v2/academic/classes').send(classroom()).expect(201);
    classId = c.body.id;
    expect(c.body.status).toBe('DRAFT');
    await a(f.otherAcademic.id)
      .get('/api/v2/academic/programs/' + programId)
      .expect(404);
    await a(f.otherAcademic.id)
      .get('/api/v2/academic/classes/' + classId)
      .expect(404);
    await a(f.otherAcademic.id)
      .patch('/api/v2/academic/classes/' + classId)
      .send({ ...classroom(), expectedUpdatedAt: c.body.updatedAt })
      .expect(404);
    await a(f.academic.id)
      .post('/api/v2/academic/classes')
      .send(classroom(f.foreignDraft.id))
      .expect(404);
    expect(
      await dev.prisma.domainAuditEvent.count({
        where: {
          actorId: f.academic.id,
          action: { in: ['W02_PROGRAM_CREATE', 'W02_CLASS_CREATE'] },
          objectId: { in: [programId, classId] },
        },
      }),
    ).toBe(2);
  });
  it('class/resource reads enforce assigned teacher and active learner, excluding pending payment and foreign class', async () => {
    for (const u of [f.teacher, f.learner, f.academic]) {
      const cls = await a(u.id)
        .get('/api/v2/academic/classes/' + f.classroom.id)
        .expect(200);
      expect(cls.body.activeLearnerCount).toBe(1);
    }
    await a(f.teacher.id)
      .get('/api/v2/academic/classes/' + f.otherClass.id)
      .expect(404);
    await a(f.learner.id)
      .get('/api/v2/academic/classes/' + f.otherClass.id)
      .expect(404);
    await a(f.otherLearner.id)
      .get('/api/v2/academic/classes/' + f.classroom.id)
      .expect(404);
    await a(f.admin.id)
      .get('/api/v2/academic/classes/' + f.classroom.id)
      .expect(403);
    const hv = await a(f.learner.id)
      .get('/api/v2/academic/classes/' + f.classroom.id + '/roster')
      .expect(200);
    expect(hv.body.data).toHaveLength(1);
    expect(hv.body.data[0].learner).toBeUndefined();
    const hvu = await a(f.academic.id)
      .get('/api/v2/academic/classes/' + f.classroom.id + '/roster?limit=1')
      .expect(200);
    expect(hvu.body.meta.total).toBe(2);
    expect(hvu.body.summary).toMatchObject({ ACTIVE: 1, PENDING_PAYMENT: 1 });
    const pending = await a(f.academic.id)
      .get(
        '/api/v2/academic/classes/' + f.classroom.id + '/roster?enrollmentStatus=PENDING_PAYMENT',
      )
      .expect(200);
    expect(pending.body.data).toHaveLength(1);
  });
  it('optimistic version + row lock prevents stale/concurrent draft edits without changing enrollments', async () => {
    const current = await a(f.academic.id)
      .get('/api/v2/academic/classes/' + classId)
      .expect(200);
    const body = {
      ...classroom(),
      code: current.body.code,
      expectedUpdatedAt: current.body.updatedAt,
    };
    const results = await Promise.all(
      [1, 2].map((n) =>
        a(f.academic.id)
          .patch('/api/v2/academic/classes/' + classId)
          .send({ ...body, name: 'Concurrent draft ' + n }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const before = await dev.prisma.enrollment.findMany({
      where: { classOfferingId: f.classroom.id },
      orderBy: { id: 'asc' },
    });
    await a(f.academic.id)
      .patch('/api/v2/academic/classes/' + f.classroom.id)
      .send({
        ...classroom(f.published.id),
        expectedUpdatedAt: f.classroom.updatedAt.toISOString(),
      })
      .expect(409);
    expect(
      await dev.prisma.enrollment.findMany({
        where: { classOfferingId: f.classroom.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
    await a(f.academic.id)
      .patch('/api/v2/academic/programs/' + f.published.id)
      .send({ ...program(), expectedUpdatedAt: f.published.updatedAt.toISOString() })
      .expect(409);
  });
  it('weekly templates: HH:mm round trip, adjacent slots accepted, overlap/foreign slot denied, no official session inferred', async () => {
    const current = () => a(f.academic.id).get('/api/v2/academic/classes/' + classId);
    const slot = {
      dayOfWeek: 1,
      startTime: '18:00',
      endTime: '19:00',
      locationText: 'Draft venue',
      reason,
    };
    let c = await current();
    const first = await a(f.academic.id)
      .post('/api/v2/academic/classes/' + classId + '/weekly-templates')
      .send({ ...slot, expectedUpdatedAt: c.body.updatedAt })
      .expect(201);
    expect(first.body.slot.startTime).toBe('18:00');
    expect(first.body.kind).toBe('WEEKLY_TEMPLATE_NOT_OFFICIAL');
    c = await current();
    await a(f.academic.id)
      .post('/api/v2/academic/classes/' + classId + '/weekly-templates')
      .send({ ...slot, startTime: '18:30', endTime: '20:00', expectedUpdatedAt: c.body.updatedAt })
      .expect(409);
    await a(f.academic.id)
      .post('/api/v2/academic/classes/' + classId + '/weekly-templates')
      .send({ ...slot, startTime: '19:00', endTime: '20:00', expectedUpdatedAt: c.body.updatedAt })
      .expect(201);
    c = await current();
    await a(f.academic.id)
      .patch('/api/v2/academic/classes/' + classId + '/weekly-templates/' + randomUUID())
      .send({ ...slot, expectedUpdatedAt: c.body.updatedAt })
      .expect(404);
    await a(f.academic.id)
      .delete('/api/v2/academic/classes/' + classId + '/weekly-templates/' + first.body.slot.id)
      .send({ expectedUpdatedAt: c.body.updatedAt, reason })
      .expect(200);
  });
  it('bounded DTO rejects publication, assignment, paid/free mismatch, invalid times and entitlement bypass', async () => {
    await a(f.academic.id)
      .post('/api/v2/academic/programs')
      .send({ ...program(), isPublished: true })
      .expect(400);
    await a(f.academic.id)
      .post('/api/v2/academic/classes')
      .send({ ...classroom(), instructorId: f.teacher.id })
      .expect(400);
    await a(f.academic.id)
      .post('/api/v2/academic/classes')
      .send({ ...classroom(), pricingType: 'PAID', tuitionFeeVnd: 0 })
      .expect(400);
    await a(f.academic.id)
      .post('/api/v2/academic/classes')
      .send({ ...classroom(), maxStudents: 0 })
      .expect(400);
    const c = await a(f.academic.id).get('/api/v2/academic/classes/' + classId);
    await a(f.academic.id)
      .post('/api/v2/academic/classes/' + classId + '/weekly-templates')
      .send({
        dayOfWeek: 1,
        startTime: '25:00',
        endTime: '26:00',
        locationText: 'Draft',
        expectedUpdatedAt: c.body.updatedAt,
        reason,
      })
      .expect(400);
    await a(f.academic.id)
      .patch('/api/v2/academic/classes/' + f.classroom.id + '/roster/' + randomUUID() + '/status')
      .send({ status: 'ACTIVE' })
      .expect(404);
  });
  it('concurrent template edits are serialized and an existing foreign-class slot cannot be patched or removed', async () => {
    const c = await a(f.academic.id).post('/api/v2/academic/classes').send(classroom()).expect(201);
    const body = {
      dayOfWeek: 2,
      startTime: '18:00',
      endTime: '19:00',
      locationText: 'Draft',
      expectedUpdatedAt: c.body.updatedAt,
      reason,
    };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        a(f.academic.id)
          .post('/api/v2/academic/classes/' + c.body.id + '/weekly-templates')
          .send(body),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(
      await dev.prisma.classScheduleSlot.count({ where: { classOfferingId: c.body.id } }),
    ).toBe(1);
    const foreign = await dev.prisma.classScheduleSlot.findFirstOrThrow({
      where: { classOfferingId: f.classroom.id },
    });
    const current = await a(f.academic.id).get('/api/v2/academic/classes/' + c.body.id);
    await a(f.academic.id)
      .patch('/api/v2/academic/classes/' + c.body.id + '/weekly-templates/' + foreign.id)
      .send({ ...body, expectedUpdatedAt: current.body.updatedAt })
      .expect(404);
    await a(f.academic.id)
      .delete('/api/v2/academic/classes/' + c.body.id + '/weekly-templates/' + foreign.id)
      .send({ expectedUpdatedAt: current.body.updatedAt, reason })
      .expect(404);
    expect(
      await dev.prisma.classScheduleSlot.findUniqueOrThrow({ where: { id: foreign.id } }),
    ).toEqual(foreign);
  });
  it('existing enrollment concurrency respects one active seat; W02 does not promote payment state', async () => {
    const results = await Promise.all(
      f.contenders.map((u) =>
        a(u.id).post('/api/enrollments').send({ classOfferingId: f.freeClass.id }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(
      await dev.prisma.enrollment.count({
        where: { classOfferingId: f.freeClass.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
    expect(
      await dev.prisma.enrollment.findFirst({
        where: { learnerId: f.otherLearner.id, classOfferingId: f.classroom.id },
      }),
    ).toMatchObject({ status: 'PENDING_PAYMENT' });
  });
  it('HVU list filters/pages only authorized records; revoked sessions fail before changes', async () => {
    const page = await a(f.academic.id)
      .get('/api/v2/academic/programs?search=W02&limit=1')
      .expect(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(2);
    await dev.prisma.userSession.updateMany({
      where: { sess: { path: ['userId'], equals: f.academic.id } },
      data: { expire: new Date(0) },
    });
    await a(f.academic.id).post('/api/v2/academic/programs').send(program()).expect(401);
  });
});
