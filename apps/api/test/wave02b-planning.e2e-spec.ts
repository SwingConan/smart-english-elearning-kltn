import * as request from 'supertest';
import { Client } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { ClassInstructorAssignment, TeachingSession } from '../src/generated/prisma/client';
import { startWave01App } from './wave01-postgres.fixture';
import { grantAcademic, seedWave02B } from './wave02b.fixture';
import { localMinute } from '../src/modules/academic/academic-time';
const enabled = !!process.env.WAVE01_PG_URL;
(enabled ? describe : describe.skip)(
  'W02B dated academic workflow + PostgreSQL enforcement',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>, f: Awaited<ReturnType<typeof seedWave02B>>;
    const agents = new Map<string, ReturnType<typeof request.agent>>(),
      traces: object[] = [];
    const reason = 'Synthetic W02B independent academic review';
    let room: string,
      room2: string,
      assignment1: string,
      assignment2: string,
      assignment3: string,
      version: string,
      official: string;
    const base = new Date(Date.now() + 3 * 86400000);
    base.setUTCHours(11, 0, 0, 0);
    const at = (days: number, hours = 0) =>
      new Date(base.getTime() + days * 86400000 + hours * 3600000);
    const api = (id: string) => agents.get(id)!;
    const endpoint = (path: string) => '/api/v2/academic/' + path;
    const body = (days: number = 0, classId?: string, overrides: object = {}) => ({
      startLocal: localMinute(at(days), 'Asia/Ho_Chi_Minh'),
      endLocal: localMinute(at(days, 1.5), 'Asia/Ho_Chi_Minh'),
      timezone: 'Asia/Ho_Chi_Minh',
      modality: 'HYBRID',
      roomId: room,
      assignmentId:
        classId === f.otherClass.id
          ? assignment2
          : classId === f.freeClass.id
            ? assignment3
            : assignment1,
      requiredCapabilities: ['PROJECTOR'],
      reason,
      ...overrides,
    });
    async function draft(classId: string, days: number, overrides: object = {}) {
      return (
        await api(f.academic.id)
          .post(endpoint('classes/' + classId + '/sessions'))
          .send(body(days, classId, overrides))
          .expect(201)
      ).body;
    }
    async function submit(kind: string, row: { id: string; lockVersion: number }) {
      return (
        await api(f.academic.id)
          .post(endpoint(kind + '/' + row.id + '/submit'))
          .send({ expectedLockVersion: row.lockVersion, reason })
          .expect(201)
      ).body;
    }
    async function approve(
      kind: string,
      row: { id: string; lockVersion: number },
      extra: object = {},
    ) {
      return api(f.planningApprover.id)
        .post(endpoint(kind + '/' + row.id + '/approve'))
        .send({ expectedLockVersion: row.lockVersion, reason, ...extra });
    }
    // Each H2 case owns its class/instructor/assignment; only immutable course/actors are shared.
    async function roomScenario() {
      const suffix = randomUUID();
      const teacher = await dev.prisma.user.create({
        data: {
          email: 'h2-' + suffix + '@example.invalid',
          fullName: 'H2 synthetic instructor',
          role: 'INSTRUCTOR',
          passwordHash: f.teacher.passwordHash,
        },
      });
      const classroom = await dev.prisma.classOffering.create({
        data: {
          courseId: f.published.id,
          code: 'H2-' + suffix,
          name: 'Independent H2 fixture',
          status: 'OPEN',
          modality: 'HYBRID',
          maxStudents: 2,
        },
      });
      await grantAcademic(
        dev.prisma,
        f.planningApprover.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        classroom.id,
      );
      const assignment = (
        await api(f.academic.id)
          .post(endpoint('classes/' + classroom.id + '/assignments'))
          .send({
            instructorId: teacher.id,
            effectiveFrom: at(-1).toISOString(),
            effectiveTo: at(28).toISOString(),
            reason,
          })
          .expect(201)
      ).body;
      await approve('assignments', await submit('assignments', assignment), {
        eligibilityConfirmed: true,
      }).then((r) => expect(r.status).toBe(201));
      return { classroom, teacher, assignment };
    }
    async function scenarioRoom(overrides: object = {}) {
      return (
        await api(f.academic.id)
          .post(endpoint('rooms'))
          .send({
            code: 'ROOM-' + randomUUID().slice(0, 8),
            name: 'Unsuitable',
            location: 'Synthetic test',
            status: 'ACTIVE',
            capacity: 30,
            capabilities: ['PROJECTOR'],
            ...overrides,
            reason,
          })
          .expect(201)
      ).body;
    }
    beforeAll(async () => {
      dev = await startWave01App();
      f = await seedWave02B(dev.prisma);
      for (const u of [...f.users, f.otherAcademic, ...f.contenders]) {
        const a = request.agent(dev.app.getHttpServer());
        await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
        agents.set(u.id, a);
      }
    }, 60000);
    afterAll(async () => {
      if (dev) {
        const evidenceRoot = process.env.WAVE02B_EVIDENCE_ROOT ?? '.local-storage/v2-wave02b';
        await mkdir(evidenceRoot, { recursive: true });
        await writeFile(
          resolve(evidenceRoot, 'http-evidence.json'),
          JSON.stringify(traces, null, 2),
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
              reason: 'Retire only W02B synthetic actors after tests; keep all rows/history',
            },
          });
        }
        await dev.app.close();
      }
    });
    it('denies every non-HVU new mutation/approval API and keeps legacy admin frozen', async () => {
      const id = randomUUID();
      const routes = [
        ['post', 'rooms'],
        ['patch', 'rooms/' + id],
        ['delete', 'rooms/' + id],
        ['post', 'programs/' + id + '/versions'],
        ['patch', 'programs/' + id + '/versions/' + id],
        ['post', 'versions/' + id + '/submit'],
        ['post', 'versions/' + id + '/approve'],
        ['post', 'versions/' + id + '/offers'],
        ['post', 'classes/' + id + '/assignments'],
        ['post', 'assignments/' + id + '/submit'],
        ['post', 'assignments/' + id + '/approve'],
        ['post', 'classes/' + id + '/generate-sessions'],
        ['post', 'classes/' + id + '/sessions'],
        ['patch', 'sessions/' + id],
        ['post', 'sessions/' + id + '/reschedule'],
        ['post', 'sessions/' + id + '/cancel'],
        ['post', 'sessions/' + id + '/submit'],
        ['post', 'sessions/' + id + '/approve'],
      ];
      for (const u of f.users.filter((u) => u.role !== 'ACADEMIC_MANAGER')) {
        for (const [method, path] of routes) {
          const agent = api(u.id);
          const r = await agent[method as 'post'](endpoint(path)).send({});
          expect(r.status).toBe(403);
          traces.push({ role: u.role, method, path, status: r.status });
        }
        await api(u.id).post('/api/admin/class-offerings').send({}).expect(403);
      }
      await request(dev.app.getHttpServer()).get(endpoint('calendar')).expect(401);
    });
    it.each(['UTC', 'Asia/Bangkok', 'America/New_York'])(
      'stores genuine timestamptz epochs and filters/returns them correctly under PostgreSQL session TZ %s',
      async (zone) => {
        const epoch = Date.parse('2027-01-04T11:00:00.000Z');
        await dev.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('TimeZone',${zone},true)`;
          const n = await tx.courseVersion.aggregate({
            where: { courseId: f.published.id },
            _max: { number: true },
          });
          const v = await tx.courseVersion.create({
            data: {
              courseId: f.published.id,
              number: (n._max.number ?? 0) + 1,
              title: 'UTC epoch proof ' + zone,
              description: 'Synthetic actual database epoch proof',
              level: 'BASIC',
              skillScope: 'LR',
              effectiveFrom: new Date(epoch),
              proposedBy: f.academic.id,
              reason,
            },
          });
          const [clock] = await tx.$queryRaw<
            { effectiveMs: number; createdMs: number; nowMs: number }[]
          >`SELECT (EXTRACT(EPOCH FROM "effectiveFrom")*1000)::double precision AS "effectiveMs",(EXTRACT(EPOCH FROM "createdAt")*1000)::double precision AS "createdMs",(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000)::double precision AS "nowMs" FROM course_versions WHERE id=${v.id}::uuid`;
          expect(clock.effectiveMs).toBe(epoch);
          expect(v.effectiveFrom.getTime()).toBe(epoch);
          expect(v.createdAt.getTime()).toBe(clock.createdMs);
          expect(Math.abs(clock.createdMs - clock.nowMs)).toBeLessThan(2000);
          const found = await tx.courseVersion.findMany({
            where: { id: v.id, effectiveFrom: new Date(epoch) },
          });
          expect(found).toHaveLength(1);
          expect(found[0].effectiveFrom.getTime()).toBe(epoch);
          traces.push({
            case: 'Real timestamptz epoch ' + zone,
            effectiveEpoch: clock.effectiveMs,
            expectedEpoch: epoch,
            createdEpoch: clock.createdMs,
            dbEpoch: clock.nowMs,
            correct: true,
          });
        });
      },
    );
    it('creates rooms with typed facilities, scope, validation and stale edit protection', async () => {
      const data = {
        code: 'W02B-' + randomUUID().slice(0, 8),
        name: 'DEV phòng 301',
        location: 'Synthetic campus floor 3',
        capacity: 30,
        capabilities: ['PROJECTOR', 'SPEAKERS'],
        status: 'ACTIVE',
        reason,
      };
      const r = await api(f.academic.id).post(endpoint('rooms')).send(data).expect(201);
      room = r.body.id;
      room2 = (
        await api(f.academic.id)
          .post(endpoint('rooms'))
          .send({ ...data, code: data.code + 'B', name: 'DEV phòng 302' })
          .expect(201)
      ).body.id;
      await api(f.otherAcademic.id)
        .patch(endpoint('rooms/' + room))
        .send({ ...data, expectedLockVersion: 0 })
        .expect(404);
      await api(f.academic.id)
        .patch(endpoint('rooms/' + room))
        .send({ ...data, expectedLockVersion: 0, name: 'DEV phòng 301 đã kiểm tra' })
        .expect(200);
      await api(f.academic.id)
        .patch(endpoint('rooms/' + room))
        .send({ ...data, expectedLockVersion: 0 })
        .expect(409);
      await api(f.academic.id)
        .post(endpoint('rooms'))
        .send({ ...data, code: 'INVALID', capacity: 0 })
        .expect(400);
      const unused = (
        await api(f.academic.id)
          .post(endpoint('rooms'))
          .send({ ...data, code: data.code + 'UNUSED' })
          .expect(201)
      ).body;
      await api(f.academic.id)
        .delete(endpoint('rooms/' + unused.id))
        .send({ reason, expectedLockVersion: unused.lockVersion })
        .expect(200);
      expect(await dev.prisma.room.findUnique({ where: { id: unused.id } })).toBeNull();
    });
    it('new scoped capabilities follow the existing independent grant API, never GLOBAL or teacher/QT business elevation', async () => {
      const b = {
        userId: f.ungrantedAcademic.id,
        capability: 'academic.program.approve',
        scopeType: 'COURSE',
        scopeId: f.foreignDraft.id,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        reason,
      };
      await api(f.admin.id)
        .post('/api/authority/grants')
        .send({ ...b, scopeType: 'GLOBAL', scopeId: undefined })
        .expect(400);
      await api(f.admin.id)
        .post('/api/authority/grants')
        .send({ ...b, capability: 'academic.schedule.approve' })
        .expect(400);
      const g = await api(f.admin.id).post('/api/authority/grants').send(b).expect(201);
      await api(f.admin.id)
        .post('/api/authority/grants/' + g.body.id + '/approve')
        .expect(403);
      await api(f.approver.id)
        .post('/api/authority/grants/' + g.body.id + '/approve')
        .expect(201);
      await api(f.ungrantedAcademic.id).get(endpoint('approvals')).expect(401);
      await api(f.ungrantedAcademic.id)
        .post('/api/auth/login')
        .send({ email: f.ungrantedAcademic.email, password: f.password })
        .expect(200);
      await api(f.ungrantedAcademic.id)
        .get(endpoint('programs/' + f.foreignDraft.id + '/versions'))
        .expect(200);
    });
    it('requires independent scoped program approval; frozen metadata/price and null standard remain truthful', async () => {
      const b = {
        title: 'Approved TOEIC v1',
        description: 'Explicit approved metadata, no historic module snapshot claim',
        level: 'BASIC',
        skillScope: 'LR',
        standardPricingType: 'PAID',
        standardTuitionFeeVnd: 1800000,
        effectiveFrom: new Date(Date.now() - 1000).toISOString(),
        reason,
      };
      const created = (
        await api(f.academic.id)
          .post(endpoint('programs/' + f.published.id + '/versions'))
          .send(b)
          .expect(201)
      ).body;
      await api(f.otherAcademic.id)
        .post(endpoint('programs/' + f.published.id + '/versions'))
        .send(b)
        .expect(404);
      const pending = await submit('versions', created);
      version = pending.id;
      await api(f.academic.id)
        .post(endpoint('versions/' + version + '/approve'))
        .send({ reason, expectedLockVersion: pending.lockVersion })
        .expect(403);
      await approve('versions', pending).then((r) => expect(r.status).toBe(201));
      await api(f.academic.id)
        .patch(endpoint('programs/' + f.published.id + '/versions/' + version))
        .send({ ...b, expectedLockVersion: 2, title: 'Forbidden rewrite' })
        .expect(409);
      const unknown = (
        await api(f.academic.id)
          .post(endpoint('programs/' + f.published.id + '/versions'))
          .send({ ...b, standardPricingType: undefined, standardTuitionFeeVnd: undefined })
          .expect(201)
      ).body;
      expect(unknown.standardTuitionFeeVnd).toBeNull();
      const p = await submit('versions', unknown);
      await approve('versions', p).then((r) => expect(r.status).toBe(201));
      await api(f.academic.id)
        .post(endpoint('versions/' + p.id + '/offers'))
        .send({
          code: 'NO-PHANTOM-ZERO',
          name: 'Unknown price offer',
          modality: 'ONLINE',
          maxStudents: 10,
          reason,
        })
        .expect(409);
    });
    it('new offer snapshots approved terms and preserves every old class/enrollment value', async () => {
      const old = await dev.prisma.classOffering.findUniqueOrThrow({
          where: { id: f.classroom.id },
        }),
        enrollment = await dev.prisma.enrollment.findMany({
          where: { classOfferingId: old.id },
          orderBy: { id: 'asc' },
        });
      const result = await api(f.academic.id)
        .post(endpoint('versions/' + version + '/offers'))
        .send({
          code: 'SNAPSHOT-' + randomUUID().slice(0, 8),
          name: 'New approved-term draft',
          modality: 'ONLINE',
          maxStudents: 10,
          reason,
        })
        .expect(201);
      expect(result.body).toMatchObject({
        versionId: version,
        termsTitle: 'Approved TOEIC v1',
        tuitionFeeVnd: 1800000,
        approvedTuitionFeeVnd: 1800000,
        status: 'DRAFT',
      });
      expect(await dev.prisma.classOffering.findUniqueOrThrow({ where: { id: old.id } })).toEqual(
        old,
      );
      expect(
        await dev.prisma.enrollment.findMany({
          where: { classOfferingId: old.id },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(enrollment);
      const sql = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await sql.connect();
      try {
        await expect(
          sql.query('UPDATE class_offerings SET "tuitionFeeVnd"=0 WHERE id=$1', [result.body.id]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          sql.query('UPDATE class_offerings SET "versionId"=$1 WHERE id=$2', [version, old.id]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await sql.end();
      }
    });
    it('approved effective assignments require grant, independent actor and explicit eligibility review', async () => {
      for (const [classId, teacher, key] of [
        [f.classroom.id, f.teacher.id, 1],
        [f.otherClass.id, f.otherTeacher.id, 2],
        [f.freeClass.id, f.teacher.id, 3],
      ] as const) {
        const created = (
          await api(f.academic.id)
            .post(endpoint('classes/' + classId + '/assignments'))
            .send({
              instructorId: teacher,
              effectiveFrom: at(-1).toISOString(),
              effectiveTo: at(28).toISOString(),
              reason,
            })
            .expect(201)
        ).body;
        const pending = await submit('assignments', created);
        if (key === 1) {
          await api(f.academic.id)
            .post(endpoint('assignments/' + pending.id + '/approve'))
            .send({ reason, expectedLockVersion: pending.lockVersion, eligibilityConfirmed: true })
            .expect(403);
          await approve('assignments', pending, { eligibilityConfirmed: false }).then((r) =>
            expect(r.status).toBe(400),
          );
        }
        const approved = await approve('assignments', pending, { eligibilityConfirmed: true });
        expect(approved.status).toBe(201);
        if (key === 1) assignment1 = approved.body.id;
        if (key === 2) assignment2 = approved.body.id;
        if (key === 3) assignment3 = approved.body.id;
      }
      expect(
        (await dev.prisma.classOffering.findUniqueOrThrow({ where: { id: f.classroom.id } }))
          .instructorId,
      ).toBe(f.teacher.id);
    });
    it('generates dated DRAFT only, explicit exclusions and stable repeated materialization', async () => {
      const d = at(10);
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      const from = d.toISOString().slice(0, 10),
        through = new Date(d.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const b = {
        from,
        through,
        timezone: 'Asia/Ho_Chi_Minh',
        excludeDates: [from],
        exceptionsReviewed: true,
        roomId: room,
        assignmentId: assignment1,
        requiredCapabilities: ['PROJECTOR'],
        reason,
      };
      const r = await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/generate-sessions'))
        .send(b)
        .expect(201);
      expect(r.body).toMatchObject({ created: 1, existing: 0, kind: 'DRAFT_ONLY' });
      expect(r.body.data[0]).toMatchObject({
        state: 'DRAFT',
        startsAt: through + 'T11:00:00.000Z',
      });
      expect(r.body.data[0].sourceTemplateId).toBeTruthy();
      const repeat = await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/generate-sessions'))
        .send(b)
        .expect(201);
      expect(repeat.body).toMatchObject({ created: 0, existing: 1 });
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/generate-sessions'))
        .send({ ...b, exceptionsReviewed: false })
        .expect(400);
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/generate-sessions'))
        .send({ ...b, from: '2020-01-01' })
        .expect(400);
    });
    it('rejects nonexistent local time, invalid intervals and invalid IANA zones through HTTP', async () => {
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/assignments'))
        .send({
          instructorId: f.teacher.id,
          effectiveFrom: '2027-01-01T10:00',
          effectiveTo: '2027-02-01T10:00:00Z',
          reason,
        })
        .expect(400);
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/sessions'))
        .send(body(0, undefined, { endLocal: localMinute(at(0), 'Asia/Ho_Chi_Minh') }))
        .expect(400);
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/sessions'))
        .send(
          body(0, undefined, {
            startLocal: '2027-03-14T02:30',
            endLocal: '2027-03-14T04:00',
            timezone: 'America/New_York',
          }),
        )
        .expect(400);
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/sessions'))
        .send(body(0, undefined, { timezone: 'Invalid/Zone' }))
        .expect(400);
      await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/sessions'))
        .send(
          body(0, undefined, {
            startLocal: '2027-04-04T02:30',
            endLocal: '2027-04-04T03:30',
            timezone: 'Australia/Sydney',
            modality: 'ONLINE',
            roomId: undefined,
            assignmentId: undefined,
          }),
        )
        .expect(400);
      const resolved = await api(f.academic.id)
        .post(endpoint('classes/' + f.classroom.id + '/sessions'))
        .send(
          body(0, undefined, {
            startLocal: '2027-04-04T02:30',
            endLocal: '2027-04-04T03:30',
            timezone: 'Australia/Sydney',
            startOffset: '+11:00',
            endOffset: '+10:00',
            modality: 'ONLINE',
            roomId: undefined,
            assignmentId: undefined,
          }),
        )
        .expect(201);
      expect(resolved.body.startsAt).toBe('2027-04-03T15:30:00.000Z');
      expect(resolved.body.state).toBe('DRAFT');
    });
    it('official publication is private, independent, idempotent and queues durable intent only', async () => {
      const row = await draft(f.classroom.id, 0),
        pending = await submit('sessions', row);
      official = pending.id;
      await grantAcademic(
        dev.prisma,
        f.academic.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        f.classroom.id,
      );
      await api(f.academic.id)
        .post(endpoint('sessions/' + official + '/approve'))
        .send({ reason, expectedLockVersion: pending.lockVersion })
        .expect(403);
      const r = await approve('sessions', pending);
      expect(r.status).toBe(201);
      expect(r.body.state).toBe('PUBLISHED');
      await approve('sessions', pending).then((r) => expect(r.status).toBe(201));
      const notices = await dev.prisma.academicNotificationIntent.findMany({
        where: { sessionId: official },
      });
      expect(notices.map((n) => n.recipientId).sort()).toEqual([f.learner.id, f.teacher.id].sort());
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { action: 'W02B_SESSIONS_APPROVE', objectId: official },
        }),
      ).toBe(1);
      for (const u of [f.teacher, f.learner]) {
        const c = await api(u.id).get(endpoint('calendar')).expect(200);
        expect(c.body.data.some((x: { id: string }) => x.id === official)).toBe(true);
        expect(JSON.stringify(c.body)).not.toMatch(
          /proposedBy|decisionReason|generationKey|meetingUrl|PENDING_APPROVAL/,
        );
      }
      const pendingLearner = await api(f.otherLearner.id).get(endpoint('calendar')).expect(200);
      expect(pendingLearner.body.data).toHaveLength(0);
    });
    it('DRAFT conflict warns, official conflict returns 409; adjacent end=start is accepted', async () => {
      const row = await draft(f.otherClass.id, 0);
      expect(row.warnings).toContain('ROOM_CONFLICT');
      const p = await submit('sessions', row);
      const r = await approve('sessions', p);
      expect(r.status).toBe(409);
      traces.push({ case: 'HTTP room conflict', status: r.status });
      const adjacent = await draft(f.classroom.id, 0, {
        startLocal: localMinute(at(0, 1.5), 'Asia/Ho_Chi_Minh'),
        endLocal: localMinute(at(0, 2.5), 'Asia/Ho_Chi_Minh'),
      });
      await approve('sessions', await submit('sessions', adjacent)).then((r) =>
        expect(r.status).toBe(201),
      );
    });
    it.each([
      ['MAINTENANCE', { status: 'MAINTENANCE', capacity: 30, capabilities: ['PROJECTOR'] }],
      ['UNAVAILABLE', { status: 'UNAVAILABLE', capacity: 30, capabilities: ['PROJECTOR'] }],
      ['INSUFFICIENT_CAPACITY', { status: 'ACTIVE', capacity: 1, capabilities: ['PROJECTOR'] }],
      ['MISSING_CAPABILITY', { status: 'ACTIVE', capacity: 30, capabilities: [] }],
    ] as const)(
      'unsuitable room %s is fail closed at independent DB approval',
      async (_label, overrides) => {
        const fixture = await roomScenario(),
          r = await scenarioRoom(overrides);
        const s = await draft(fixture.classroom.id, 2, {
          roomId: r.id,
          assignmentId: fixture.assignment.id,
        });
        expect(s.warnings).toContain('ROOM_UNSUITABLE');
        const pending = await submit('sessions', s);
        await api(f.academic.id)
          .post(endpoint('sessions/' + pending.id + '/approve'))
          .send({ expectedLockVersion: pending.lockVersion, reason })
          .expect(403);
        await approve('sessions', pending).then((r) => expect(r.status).toBe(409));
        expect(
          await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: s.id } }),
        ).toMatchObject({
          state: 'PENDING_APPROVAL',
          approvedBy: null,
          reason,
          lockVersion: pending.lockVersion,
          instructorId: fixture.teacher.id,
        });
      },
    );
    it('ONLINE rejects a room but publishes an actual independent roomless session', async () => {
      const fixture = await roomScenario(),
        r = await scenarioRoom();
      await api(f.academic.id)
        .post(endpoint('classes/' + fixture.classroom.id + '/sessions'))
        .send(
          body(2, fixture.classroom.id, {
            modality: 'ONLINE',
            roomId: r.id,
            assignmentId: fixture.assignment.id,
          }),
        )
        .expect(400);
      const online = await draft(fixture.classroom.id, 2, {
        modality: 'ONLINE',
        roomId: undefined,
        assignmentId: fixture.assignment.id,
      });
      await approve('sessions', await submit('sessions', online)).then((r) =>
        expect(r.status).toBe(201),
      );
      expect(
        await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: online.id } }),
      ).toMatchObject({
        state: 'PUBLISHED',
        modality: 'ONLINE',
        roomId: null,
        approvedBy: f.planningApprover.id,
        reason,
      });
    });
    it('a separately published room remains immutable and cannot be deleted', async () => {
      const fixture = await roomScenario(),
        r = await scenarioRoom();
      const session = await draft(fixture.classroom.id, 2, {
        roomId: r.id,
        assignmentId: fixture.assignment.id,
      });
      await approve('sessions', await submit('sessions', session)).then((r) =>
        expect(r.status).toBe(201),
      );
      await api(f.academic.id)
        .patch(endpoint('rooms/' + r.id))
        .send({
          code: r.code,
          name: r.name,
          location: r.location,
          capacity: 1,
          capabilities: r.capabilities,
          status: 'MAINTENANCE',
          expectedLockVersion: r.lockVersion,
          reason,
        })
        .expect(409);
      await api(f.academic.id)
        .delete(endpoint('rooms/' + r.id))
        .send({ reason, expectedLockVersion: r.lockVersion })
        .expect(409);
    });
    describe('reschedule with its own conflicting ONLINE fixture', () => {
      beforeAll(async () => {
        // The original H2 ONLINE case implicitly supplied this conflict. Arrange
        // it here so H2 inputs remain independent and the original409 still has
        // a real published class collision, rather than weakening the assertion.
        const collision = await draft(f.classroom.id, 2, { modality: 'ONLINE', roomId: undefined });
        await approve('sessions', await submit('sessions', collision)).then((r) =>
          expect(r.status).toBe(201),
        );
      });
      it('reschedule leaves old official live until approval; failed replacement rolls back supersession', async () => {
        const old = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } });
        const replacement = (
          await api(f.academic.id)
            .post(endpoint('sessions/' + official + '/reschedule'))
            .send(body(1))
            .expect(201)
        ).body;
        expect(
          (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } })).state,
        ).toBe('PUBLISHED');
        const approved = await approve('sessions', await submit('sessions', replacement));
        expect(approved.status).toBe(201);
        const history = await dev.prisma.teachingSession.findMany({
          where: { occurrenceId: old.occurrenceId },
          orderBy: { revision: 'asc' },
        });
        expect(history.map((s) => s.state)).toEqual(['SUPERSEDED', 'PUBLISHED']);
        expect(history[0].startsAt).toEqual(old.startsAt);
        official = approved.body.id;
        const bad = (
          await api(f.academic.id)
            .post(endpoint('sessions/' + official + '/reschedule'))
            .send(body(2, undefined, { modality: 'ONLINE', roomId: undefined }))
            .expect(201)
        ).body;
        await approve('sessions', await submit('sessions', bad)).then((r) =>
          expect(r.status).toBe(409),
        );
        expect(
          (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } })).state,
        ).toBe('PUBLISHED');
      });
    });
    it('independent cancellation retains immutable history and releases the exact resources', async () => {
      const old = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } });
      // Use a different occurrence because the intentionally conflicted revision above is retained for audit.
      const current = await approve(
        'sessions',
        await submit('sessions', await draft(f.classroom.id, 3)),
      );
      expect(current.status).toBe(201);
      const cancel = (
        await api(f.academic.id)
          .post(endpoint('sessions/' + current.body.id + '/cancel'))
          .send({ reason })
          .expect(201)
      ).body;
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: current.body.id } }))
          .state,
      ).toBe('PUBLISHED');
      await approve('sessions', await submit('sessions', cancel)).then((r) =>
        expect(r.status).toBe(201),
      );
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: cancel.id } })).state,
      ).toBe('CANCELLED');
      await approve('sessions', await submit('sessions', await draft(f.otherClass.id, 3))).then(
        (r) => expect(r.status).toBe(201),
      );
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: official } })).startsAt,
      ).toEqual(old.startsAt);
    });
    it.each(['room', 'instructor', 'class'] as const)(
      'two independent PostgreSQL connections race same %s: one winner and one 23P01',
      async (kind) => {
        const day = kind === 'room' ? 5 : kind === 'instructor' ? 6 : 7;
        const one = await submit('sessions', await draft(f.classroom.id, day));
        const two = await submit(
          'sessions',
          await draft(
            kind === 'room'
              ? f.otherClass.id
              : kind === 'instructor'
                ? f.freeClass.id
                : f.classroom.id,
            day,
            { roomId: kind === 'room' ? room : room2 },
          ),
        );
        const clients = [
          new Client({ connectionString: process.env.E2E_DATABASE_URL }),
          new Client({ connectionString: process.env.E2E_DATABASE_URL }),
        ];
        await Promise.all(clients.map((c) => c.connect()));
        try {
          const results = await Promise.all(
            [one, two].map(async (s, i) => {
              const c = clients[i];
              try {
                await c.query('BEGIN');
                await c.query("SET LOCAL TIME ZONE 'America/New_York'");
                await c.query(
                  'UPDATE teaching_sessions SET state=\'PUBLISHED\',"approvedBy"=$1,"approvedAt"=clock_timestamp(),"decisionReason"=$2,"lockVersion"="lockVersion"+1 WHERE id=$3',
                  [f.planningApprover.id, reason, s.id],
                );
                await c.query('COMMIT');
                return { ok: true, code: 'OK' };
              } catch (e) {
                await c.query('ROLLBACK');
                return {
                  ok: false,
                  code: (e as { code: string }).code,
                  constraint: (e as { constraint: string }).constraint,
                };
              }
            }),
          );
          expect(results.filter((r) => r.ok)).toHaveLength(1);
          expect(results.find((r) => !r.ok)?.code).toBe('23P01');
          traces.push({ case: 'PG race ' + kind, connections: 2, results });
        } finally {
          await Promise.all(clients.map((c) => c.end()));
        }
      },
    );
    it('HTTP approval race maps database exclusion to 201/409, not 500', async () => {
      const rows = await Promise.all([draft(f.classroom.id, 8), draft(f.otherClass.id, 8)]);
      const p = await Promise.all(rows.map((s) => submit('sessions', s)));
      const r = await Promise.all(p.map((s) => approve('sessions', s)));
      expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
      traces.push({ case: 'HTTP concurrent approvals', statuses: r.map((x) => x.status) });
    });
    it('direct SQL cannot rewrite approved payload, delete history, or supersede without atomic replacement', async () => {
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      try {
        await expect(
          c.query('UPDATE course_versions SET title=$1 WHERE id=$2', ['illegal', version]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          c.query(
            'UPDATE teaching_sessions SET "startsAt"="startsAt"+interval \'1 hour\' WHERE id=$1',
            [official],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          c.query('DELETE FROM teaching_sessions WHERE id=$1', [official]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          c.query("UPDATE teaching_sessions SET state='SUPERSEDED' WHERE id=$1", [official]),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await c.end();
      }
    });
    it('ungranted HVU and database actor without the scoped capability cannot approve', async () => {
      const row = await submit('sessions', await draft(f.otherClass.id, 10, { roomId: room2 }));
      await api(f.ungrantedAcademic.id)
        .post(endpoint('sessions/' + row.id + '/approve'))
        .send({ reason, expectedLockVersion: row.lockVersion })
        .expect(403);
      await api(f.ungrantedAcademic.id)
        .get(endpoint('sessions/' + row.id))
        .expect(404);
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      try {
        await expect(
          c.query(
            'UPDATE teaching_sessions SET state=\'PUBLISHED\',"approvedBy"=$1,"approvedAt"=clock_timestamp(),"decisionReason"=$2 WHERE id=$3',
            [f.ungrantedAcademic.id, reason, row.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await c.end();
      }
    });
    it('future replacement preserves original instructor history, old official snapshots and the earlier effective reservation', async () => {
      const old = await dev.prisma.classInstructorAssignment.findUniqueOrThrow({
        where: { id: assignment2 },
      });
      const priorSessions = await dev.prisma.teachingSession.findMany({
        where: { assignmentId: old.id, state: 'PUBLISHED' },
        orderBy: { id: 'asc' },
      });
      const next = (
        await api(f.academic.id)
          .post(endpoint('classes/' + f.otherClass.id + '/assignments'))
          .send({
            instructorId: f.teacher.id,
            effectiveFrom: at(20).toISOString(),
            effectiveTo: at(28).toISOString(),
            replacesId: old.id,
            reason,
          })
          .expect(201)
      ).body;
      await approve('assignments', await submit('assignments', next), {
        eligibilityConfirmed: true,
      }).then((r) => expect(r.status).toBe(201));
      const history = await dev.prisma.classInstructorAssignment.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(history.state).toBe('SUPERSEDED');
      expect(history.effectiveTo).toEqual(old.effectiveTo);
      expect(history.reservedUntil).toEqual(at(20));
      expect(history.instructorId).toBe(old.instructorId);
      expect(
        await dev.prisma.teachingSession.findMany({
          where: { assignmentId: old.id, state: 'PUBLISHED' },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(priorSessions);
      // Earlier future window still belongs to the original assignment; no silent gap/overlap after replacement.
      const stillEffective = await draft(f.otherClass.id, 18, { roomId: room2 });
      await approve('sessions', await submit('sessions', stillEffective)).then((r) =>
        expect(r.status).toBe(201),
      );
      const crossing = await draft(f.otherClass.id, 21, { roomId: room2 });
      await approve('sessions', await submit('sessions', crossing)).then((r) =>
        expect(r.status).toBe(409),
      );
    });
    describe('effective assignment with bounded real-clock transition', () => {
      let pinned: TeachingSession, previousAssignment: ClassInstructorAssignment;
      beforeAll(async () => {
        await dev.prisma.enrollment.createMany({
          data: [
            { learnerId: f.learner.id, classOfferingId: f.freeClass.id, status: 'ACTIVE' },
            {
              learnerId: f.otherLearner.id,
              classOfferingId: f.freeClass.id,
              status: 'PENDING_PAYMENT',
            },
          ],
        });
        const session = await draft(f.freeClass.id, 26, { modality: 'ONLINE', roomId: undefined });
        await approve('sessions', await submit('sessions', session)).then((r) =>
          expect(r.status).toBe(201),
        );
        pinned = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: session.id } });
        previousAssignment = await dev.prisma.classInstructorAssignment.findUniqueOrThrow({
          where: { id: assignment3 },
        });
        expect(pinned.instructorId).toBe(f.teacher.id);
        expect(pinned.assignmentId).toBe(assignment3);
      });
      it('effective assignment drives current class/ACTIVE roster access while legacy instructor attribution remains stored', async () => {
        const started = performance.now(),
          deadline = started + 4000;
        const clock = async () => {
          const sent = Date.now(),
            mono = performance.now();
          const [c] = await dev.prisma.$queryRaw<
            { ms: number }[]
          >`SELECT extract(epoch FROM clock_timestamp())::double precision * 1000 AS ms`;
          return {
            ms: c.ms,
            rttMs: performance.now() - mono,
            skewLowerMs: c.ms - Date.now(),
            skewUpperMs: c.ms - sent,
          };
        };
        const probe = await clock(),
          httpStart = performance.now();
        const before = await api(f.learner.id)
          .get(endpoint('classes/' + f.freeClass.id))
          .expect(200);
        expect(before.body.instructor).toBeNull();
        expect(before.body.assignmentProvenance).toBe('V2_NO_CURRENT_ASSIGNMENT');
        const eventBefore = await api(f.learner.id)
          .get('/api/v2/my/events/' + pinned.id)
          .expect(200);
        expect(eventBefore.body.instructor.fullName).toBe(f.teacher.fullName);
        const responseMs = performance.now() - httpStart;
        // Measured PG/HTTP margin; refuse an unsafe budget rather than extending Jest.
        const leadMs = Math.max(1200, Math.ceil(responseMs * 6 + probe.rttMs * 4 + 100));
        expect(leadMs).toBeLessThanOrEqual(1600);
        const anchor = await clock(),
          from = new Date(anchor.ms + leadMs),
          to = at(-1);
        const proposed = (
          await api(f.academic.id)
            .post(endpoint('classes/' + f.freeClass.id + '/assignments'))
            .send({
              instructorId: f.otherTeacher.id,
              effectiveFrom: from.toISOString(),
              effectiveTo: to.toISOString(),
              reason,
            })
            .expect(201)
        ).body;
        await approve('assignments', await submit('assignments', proposed), {
          eligibilityConfirmed: true,
        }).then((r) => expect(r.status).toBe(201));
        await api(f.otherTeacher.id)
          .get(endpoint('classes/' + f.freeClass.id))
          .expect(404);
        await api(f.teacher.id)
          .get(endpoint('classes/' + f.freeClass.id + '/roster'))
          .expect(404);
        const originalRoster = await api(f.teacher.id)
          .get(endpoint('classes/' + f.classes[0].id + '/roster'))
          .expect(200);
        expect(originalRoster.body.summary).toEqual({ ACTIVE: 1 });
        const studentBefore = await api(f.learner.id)
          .get(endpoint('classes/' + f.freeClass.id))
          .expect(200);
        expect(studentBefore.body.instructor).toBeNull();
        expect(
          (
            await api(f.learner.id)
              .get('/api/v2/my/events/' + pinned.id)
              .expect(200)
          ).body,
        ).toEqual(eventBefore.body);
        const preEffective = await clock();
        expect(preEffective.ms).toBeLessThan(from.getTime());
        let observed = preEffective;
        while (observed.ms < from.getTime() && performance.now() < deadline) {
          await new Promise((r) =>
            setTimeout(r, Math.min(40, Math.max(1, from.getTime() - observed.ms))),
          );
          observed = await clock();
        }
        expect(performance.now()).toBeLessThan(deadline);
        expect(observed.ms).toBeGreaterThanOrEqual(from.getTime());
        const cls = await api(f.otherTeacher.id)
          .get(endpoint('classes/' + f.freeClass.id))
          .expect(200);
        expect(cls.body.instructor.id).toBe(f.otherTeacher.id);
        expect(cls.body.assignmentProvenance).toBe('EFFECTIVE_APPROVED');
        const activeRoster = await api(f.otherTeacher.id)
          .get(endpoint('classes/' + f.freeClass.id + '/roster'))
          .expect(200);
        expect(activeRoster.body.summary).toEqual({ ACTIVE: 1 });
        expect(activeRoster.body.data).toHaveLength(1);
        expect(activeRoster.body.data[0].learner.id).toBe(f.learner.id);
        expect(JSON.stringify(activeRoster.body)).not.toContain(f.otherLearner.fullName);
        await api(f.teacher.id)
          .get(endpoint('classes/' + f.freeClass.id))
          .expect(404);
        expect(
          (await dev.prisma.classOffering.findUniqueOrThrow({ where: { id: f.freeClass.id } }))
            .instructorId,
        ).toBeNull();
        expect(
          (
            await api(f.learner.id)
              .get(endpoint('classes/' + f.freeClass.id))
              .expect(200)
          ).body.instructor.id,
        ).toBe(f.otherTeacher.id);
        expect(
          (
            await api(f.teacher.id)
              .get(endpoint('classes/' + f.classes[0].id + '/roster'))
              .expect(200)
          ).body,
        ).toEqual(originalRoster.body);
        expect(
          await dev.prisma.classInstructorAssignment.findUniqueOrThrow({
            where: { id: assignment3 },
          }),
        ).toEqual(previousAssignment);
        expect(
          await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: pinned.id } }),
        ).toEqual(pinned);
        expect(
          (
            await api(f.learner.id)
              .get('/api/v2/my/events/' + pinned.id)
              .expect(200)
          ).body,
        ).toEqual(eventBefore.body);
        expect(performance.now() - started).toBeLessThan(5000);
        traces.push({
          case: 'H1 real-clock transition',
          clockSource: 'PostgreSQL epoch; monotonic budget',
          probe,
          responseMs,
          leadMs,
          from: from.toISOString(),
          preEffective,
          observed,
          elapsedMs: performance.now() - started,
          publishedSnapshotUnchanged: true,
        });
      });
    });
    it('independent classes, rooms and instructors can publish concurrently without false conflicts', async () => {
      const one = await submit('sessions', await draft(f.classroom.id, 12));
      const two = await submit('sessions', await draft(f.otherClass.id, 12, { roomId: room2 }));
      const results = await Promise.all([approve('sessions', one), approve('sessions', two)]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      traces.push({
        case: 'Independent resource concurrent publication',
        statuses: results.map((r) => r.status),
      });
    });
    it('expired/revoked/wrong-scope grant, QT identity and stale session cannot approve', async () => {
      const row = await submit('sessions', await draft(f.freeClass.id, 9));
      const g = f.planningGrants.find((g) => g.scopeId === f.freeClass.id)!;
      await dev.prisma.permissionGrant.update({
        where: { id: g.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await approve('sessions', row).then((r) => expect(r.status).toBe(403));
      await dev.prisma.permissionGrant.update({
        where: { id: g.id },
        data: {
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: new Date(),
          revokedBy: f.admin.id,
          revokeReason: reason,
        },
      });
      await approve('sessions', row).then((r) => expect(r.status).toBe(403));
      await api(f.admin.id)
        .post(endpoint('sessions/' + row.id + '/approve'))
        .send({ reason, expectedLockVersion: row.lockVersion })
        .expect(403);
      await dev.prisma.userSession.updateMany({
        where: { sess: { path: ['userId'], equals: f.planningApprover.id } },
        data: { expire: new Date(0) },
      });
      await approve('sessions', row).then((r) => expect(r.status).toBe(401));
    });
    it('GV roster is ACTIVE-only even with pending filter; owner IDs hidden; editable list/detail agree', async () => {
      const roster = await api(f.teacher.id)
        .get(endpoint('classes/' + f.classes[0].id + '/roster?enrollmentStatus=PENDING_PAYMENT'))
        .expect(200);
      expect(roster.body.data).toHaveLength(1);
      expect(roster.body.data[0].status).toBe('ACTIVE');
      expect(roster.body.summary).toEqual({ ACTIVE: 1 });
      expect(JSON.stringify(roster.body)).not.toContain(f.otherLearner.fullName);
      for (const u of [f.teacher, f.learner]) {
        const c = await api(u.id)
          .get(endpoint('classes/' + f.classes[0].id))
          .expect(200);
        expect(c.body.course.createdById).toBeUndefined();
        const list = await api(u.id).get(endpoint('classes')).expect(200);
        expect(JSON.stringify(list.body)).not.toContain('createdById');
      }
      const owner = await dev.prisma.course.findUniqueOrThrow({
        where: { id: f.classes[0].courseId },
      });
      const list = await api(f.academic.id)
        .get(endpoint('programs?search=' + encodeURIComponent(owner.title)))
        .expect(200);
      const detail = await api(f.academic.id)
        .get(endpoint('programs/' + owner.id))
        .expect(200);
      expect(list.body.data.find((p: { id: string }) => p.id === owner.id).editable).toBe(false);
      expect(detail.body.editable).toBe(false);
    });
  },
);
