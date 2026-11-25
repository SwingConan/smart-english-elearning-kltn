import * as request from 'supertest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { grantAcademic, seedWave02B } from './wave02b.fixture';
import { localMinute } from '../src/modules/academic/academic-time';

(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W02B-BR01 focused consolidated fixes on PostgreSQL18',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>, f: Awaited<ReturnType<typeof seedWave02B>>;
    const agents = new Map<string, ReturnType<typeof request.agent>>(),
      evidence: object[] = [];
    const reason = 'Synthetic CF W02B independent review evidence';
    const a = (id: string) => agents.get(id)!,
      url = (p: string) => '/api/v2/academic/' + p;
    async function makeClass(label: string, draft = false) {
      const c = await dev.prisma.classOffering.create({
        data: {
          courseId: f.published.id,
          code: 'CF-' + randomUUID().slice(0, 8),
          name: label,
          instructorId: f.teacher.id,
          status: draft ? 'DRAFT' : 'OPEN',
          maxStudents: 20,
        },
      });
      await grantAcademic(
        dev.prisma,
        f.planningApprover.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        c.id,
      );
      if (!draft) {
        await dev.prisma.enrollment.createMany({
          data: [
            { classOfferingId: c.id, learnerId: f.learner.id, status: 'ACTIVE' },
            { classOfferingId: c.id, learnerId: f.otherLearner.id, status: 'PENDING_PAYMENT' },
          ],
        });
      }
      return c;
    }
    async function assignment(
      classId: string,
      teacherId: string,
      from: Date,
      to: Date,
      replacesId?: string,
    ) {
      return (
        await a(f.academic.id)
          .post(url('classes/' + classId + '/assignments'))
          .send({
            instructorId: teacherId,
            effectiveFrom: from.toISOString(),
            effectiveTo: to.toISOString(),
            replacesId,
            reason,
          })
          .expect(201)
      ).body;
    }
    async function submit(kind: string, row: { id: string; lockVersion: number }) {
      return (
        await a(f.academic.id)
          .post(url(kind + '/' + row.id + '/submit'))
          .send({ expectedLockVersion: row.lockVersion, reason })
          .expect(201)
      ).body;
    }
    async function approve(
      kind: string,
      row: { id: string; lockVersion: number },
      extra: object = {},
    ) {
      return a(f.planningApprover.id)
        .post(url(kind + '/' + row.id + '/approve'))
        .send({ expectedLockVersion: row.lockVersion, reason, ...extra });
    }
    async function academicScope(
      classId: string,
      teacherId: string,
      allowed: boolean,
      phase: string,
    ) {
      const agent = a(teacherId);
      for (const p of ['classes/' + classId, 'classes/' + classId + '/roster']) {
        const r = await agent.get(url(p));
        expect(r.status).toBe(allowed ? 200 : 404);
        if (allowed && p.endsWith('/roster')) {
          expect(r.body.summary).toEqual({ ACTIVE: 1 });
          expect(JSON.stringify(r.body)).not.toContain(f.otherLearner.fullName);
        }
        evidence.push({
          finding: 'F01',
          phase,
          teacher: teacherId === f.teacher.id ? 'legacy' : 'replacement',
          path: p,
          status: r.status,
        });
      }
      const list = await agent.get(url('classes')).expect(200);
      expect(list.body.data.some((c: { id: string }) => c.id === classId)).toBe(allowed);
      const w = await agent.get('/api/workspace/classes/' + classId);
      expect(w.status).toBe(allowed ? 200 : 404);
      if (allowed)
        expect(w.body.enrollments.every((e: { status: string }) => e.status === 'ACTIVE')).toBe(
          true,
        );
      const ws = await agent.get('/api/workspace/classes').expect(200);
      expect(ws.body.data.some((c: { id: string }) => c.id === classId)).toBe(allowed);
    }
    async function legacyBoundaries(classId: string, teacherId: string) {
      const agent = a(teacherId),
        paths = [
          '/api/instructor/classes/' + classId + '/overview',
          '/api/instructor/classes/' + classId + '/learners',
          '/api/instructor/classes/' + classId + '/results',
          '/api/instructor/classes/' + classId + '/grading',
          '/api/instructor/classes/' + classId + '/assessments',
          '/api/instructor/courses/' + f.published.id + '/modules',
          '/api/instructor/courses/' + f.published.id + '/questions',
          '/api/instructor/courses/' + f.published.id + '/questions/import-template',
          '/api/instructor/courses/' + f.published.id + '/tests',
          '/api/instructor/courses/' + f.published.id + '/skills',
          '/api/instructor/courses/' + f.published.id + '/adaptive-policy',
          '/api/instructor/courses/' + f.published.id + '/learner-mastery',
        ];
      for (const p of paths) {
        const r = await agent.get(p);
        expect({ path: p, status: r.status }).toEqual({
          path: p,
          status: p.endsWith('/adaptive-policy') || p.endsWith('/learner-mastery') ? 404 : 403,
        });
        evidence.push({
          finding: 'F01',
          boundary:
            'legacy LMS/assessment blocked pending W03/W04 integration; adaptive guards conceal unauthorized course with 404',
          path: p,
          status: r.status,
        });
      }
      const list = await agent.get('/api/instructor/classes').expect(200);
      expect(list.body.some((c: { id: string }) => c.id === classId)).toBe(false);
    }
    beforeAll(async () => {
      dev = await startWave01App();
      f = await seedWave02B(dev.prisma);
      for (const u of [...f.users, f.otherAcademic, ...f.contenders]) {
        const agent = request.agent(dev.app.getHttpServer());
        await agent
          .post('/api/auth/login')
          .send({ email: u.email, password: f.password })
          .expect(200);
        agents.set(u.id, agent);
      }
    }, 60000);
    afterAll(async () => {
      if (dev) {
        const root = process.env.W02B_CF_EVIDENCE_ROOT ?? '.local-storage/v2-wave02b-cf01';
        await mkdir(root, { recursive: true });
        await writeFile(resolve(root, 'finding-evidence.json'), JSON.stringify(evidence, null, 2));
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
              reason: 'Retire CF synthetic actors; preserve all source/history/media',
            },
          });
        }
        await dev.app.close();
      }
    });
    it('legacy fallback remains only for classes/courses with no V2 assignment record', async () => {
      await academicScope(f.classroom.id, f.teacher.id, true, 'never V2');
      await a(f.teacher.id)
        .get('/api/instructor/courses/' + f.published.id + '/modules')
        .expect(200);
      const c = await makeClass('CF future draft history');
      await assignment(
        c.id,
        f.otherTeacher.id,
        new Date(Date.now() + 86400000),
        new Date(Date.now() + 2 * 86400000),
      );
      await academicScope(c.id, f.teacher.id, false, 'future DRAFT suppresses legacy');
      await academicScope(c.id, f.otherTeacher.id, false, 'DRAFT does not grant future rights');
      await legacyBoundaries(c.id, f.teacher.id);
      await legacyBoundaries(c.id, f.otherTeacher.id);
      // Owning a different, untouched legacy class in this course cannot bypass the course-wide gate.
      await a(f.teacher.id)
        .post('/api/instructor/courses/' + f.published.id + '/modules')
        .send({ title: 'Unauthorized mutation after V2 adoption' })
        .expect(403);
      expect(
        await dev.prisma.module.count({
          where: { courseId: f.published.id, title: 'Unauthorized mutation after V2 adoption' },
        }),
      ).toBe(0);
      await academicScope(f.classroom.id, f.teacher.id, true, 'unmanaged class still readable');
    });
    it('old teacher never regains class/list/roster/workspace rights after replacement, expiry, future interval or gap', async () => {
      const c = await makeClass('CF real effective boundaries'),
        original = await dev.prisma.classOffering.findUniqueOrThrow({ where: { id: c.id } }),
        start = Date.now();
      const first = await assignment(
        c.id,
        f.teacher.id,
        new Date(start + 5000),
        new Date(start + 86400000),
      );
      await approve('assignments', await submit('assignments', first), {
        eligibilityConfirmed: true,
      }).then((r) => expect(r.status).toBe(201));
      const second = await assignment(
        c.id,
        f.otherTeacher.id,
        new Date(start + 11000),
        new Date(start + 17000),
        first.id,
      );
      await approve('assignments', await submit('assignments', second), {
        eligibilityConfirmed: true,
      }).then((r) => expect(r.status).toBe(201));
      await academicScope(c.id, f.teacher.id, false, 'before approved effective window');
      await new Promise((r) => setTimeout(r, Math.max(0, start + 5100 - Date.now())));
      await academicScope(c.id, f.teacher.id, true, 'approved original reservation');
      await academicScope(c.id, f.otherTeacher.id, false, 'replacement not effective yet');
      await new Promise((r) => setTimeout(r, Math.max(0, start + 11100 - Date.now())));
      await academicScope(c.id, f.teacher.id, false, 'replacement active');
      await academicScope(c.id, f.otherTeacher.id, true, 'replacement active');
      await legacyBoundaries(c.id, f.teacher.id);
      await legacyBoundaries(c.id, f.otherTeacher.id);
      await new Promise((r) => setTimeout(r, Math.max(0, start + 17100 - Date.now())));
      await academicScope(c.id, f.teacher.id, false, 'expired: no fallback');
      await academicScope(c.id, f.otherTeacher.id, false, 'expired');
      const future = await assignment(
        c.id,
        f.teacher.id,
        new Date(start + 2 * 86400000),
        new Date(start + 3 * 86400000),
      );
      await approve('assignments', await submit('assignments', future), {
        eligibilityConfirmed: true,
      }).then((r) => expect(r.status).toBe(201));
      await academicScope(c.id, f.teacher.id, false, 'gap before future re-assignment');
      const view = await a(f.academic.id)
        .get(url('classes/' + c.id))
        .expect(200);
      expect(view.body.instructor).toBeNull();
      expect(view.body.assignmentProvenance).toBe('V2_NO_CURRENT_ASSIGNMENT');
      expect(await dev.prisma.classOffering.findUniqueOrThrow({ where: { id: c.id } })).toEqual(
        original,
      );
    }, 60000);
    it('assessment-specific IDs cannot bypass legacy class ownership after V2 adoption', async () => {
      const c = await makeClass('CF grading guard'),
        test = await dev.prisma.test.create({
          data: { courseId: f.published.id, title: 'Synthetic CF assessment', purpose: 'IN_CLASS' },
        }),
        assessment = await dev.prisma.classAssessment.create({
          data: { classOfferingId: c.id, testId: test.id, stage: 'PERIODIC' },
        });
      await assignment(
        c.id,
        f.otherTeacher.id,
        new Date(Date.now() + 86400000),
        new Date(Date.now() + 2 * 86400000),
      );
      for (const teacher of [f.teacher, f.otherTeacher])
        for (const p of [
          '/api/instructor/classes/' + c.id + '/assessments/' + assessment.id,
          '/api/instructor/classes/' + c.id + '/assessments/' + assessment.id + '/grading',
          '/api/instructor/tests/' + test.id,
        ])
          await a(teacher.id).get(p).expect(403);
    });
    it('isolates session_class_no_overlap with different eligible teachers and rooms in two real overlapping transactions', async () => {
      const c = await makeClass('CF class-only race'),
        from = new Date(Date.now() + 2 * 86400000);
      from.setUTCHours(11, 0, 0, 0);
      const end = new Date(from.getTime() + 3600000),
        room1 = await dev.prisma.room.create({
          data: {
            code: 'CF-A-' + randomUUID().slice(0, 8),
            name: 'CF Room A',
            location: 'Synthetic DEV',
            capacity: 30,
            capabilities: [],
            createdBy: f.academic.id,
          },
        }),
        room2 = await dev.prisma.room.create({
          data: {
            code: 'CF-B-' + randomUUID().slice(0, 8),
            name: 'CF Room B',
            location: 'Synthetic DEV',
            capacity: 30,
            capabilities: [],
            createdBy: f.academic.id,
          },
        });
      const old = await assignment(
        c.id,
        f.teacher.id,
        new Date(from.getTime() - 86400000),
        new Date(end.getTime() + 86400000),
      );
      const a1 = (
        await approve('assignments', await submit('assignments', old), {
          eligibilityConfirmed: true,
        })
      ).body;
      const a2 = await submit(
        'assignments',
        await assignment(c.id, f.otherTeacher.id, from, new Date(end.getTime() + 86400000), a1.id),
      );
      const draft = async (teacherAssignment: string, roomId: string, start: Date, finish: Date) =>
        submit(
          'sessions',
          (
            await a(f.academic.id)
              .post(url('classes/' + c.id + '/sessions'))
              .send({
                startLocal: localMinute(start, 'Asia/Ho_Chi_Minh'),
                endLocal: localMinute(finish, 'Asia/Ho_Chi_Minh'),
                timezone: 'Asia/Ho_Chi_Minh',
                modality: 'HYBRID',
                roomId,
                assignmentId: teacherAssignment,
                requiredCapabilities: [],
                reason,
              })
              .expect(201)
          ).body,
        );
      const s1 = await draft(a1.id, room1.id, from, end),
        s2 = await draft(a2.id, room2.id, from, end);
      const one = new Client({ connectionString: process.env.E2E_DATABASE_URL }),
        two = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await Promise.all([one.connect(), two.connect()]);
      try {
        await one.query('BEGIN');
        await two.query('BEGIN');
        const {
          rows: [pid],
        } = await two.query('SELECT pg_backend_pid() AS pid');
        await one.query(
          'UPDATE teaching_sessions SET state=\'PUBLISHED\',"approvedBy"=$1,"approvedAt"=clock_timestamp(),"decisionReason"=$2 WHERE id=$3',
          [f.planningApprover.id, reason, s1.id],
        );
        const contender = (async () => {
          try {
            await two.query('SELECT pg_advisory_xact_lock(842030)');
            await two.query(
              'UPDATE class_instructor_assignments SET state=\'SUPERSEDED\',"reservedUntil"=$1::timestamptz WHERE id=$2',
              [from.toISOString(), a1.id],
            );
            await two.query(
              'UPDATE class_instructor_assignments SET state=\'PUBLISHED\',"approvedBy"=$1,"approvedAt"=clock_timestamp(),"decisionReason"=$2,"eligibilityConfirmed"=true WHERE id=$3',
              [f.planningApprover.id, reason, a2.id],
            );
            await two.query(
              'UPDATE teaching_sessions SET state=\'PUBLISHED\',"approvedBy"=$1,"approvedAt"=clock_timestamp(),"decisionReason"=$2 WHERE id=$3',
              [f.planningApprover.id, reason, s2.id],
            );
            await two.query('COMMIT');
            return { code: 'OK', constraint: null };
          } catch (e) {
            await two.query('ROLLBACK');
            return {
              code: (e as { code: string }).code,
              constraint: (e as { constraint: string }).constraint,
            };
          }
        })();
        let queued = false;
        for (let n = 0; n < 200; n++) {
          const {
            rows: [r],
          } = await one.query(
            "SELECT wait_event='advisory' AS queued FROM pg_stat_activity WHERE pid=$1",
            [pid.pid],
          );
          if (r?.queued) {
            queued = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        expect(queued).toBe(true);
        await one.query('COMMIT');
        const result = await contender;
        expect(result).toEqual({ code: '23P01', constraint: 'session_class_no_overlap' });
        evidence.push({
          finding: 'F02',
          connections: 2,
          overlappingTransactions: true,
          advisoryWaitObserved: queued,
          differentInstructors: true,
          differentRooms: true,
          winner: 'PUBLISHED',
          loser: result,
          guardsDisabled: false,
          note: 'Each teacher is eligible at its publication check; approved replacement retains the first published teacher snapshot. C2 replacement and second publication roll back together.',
        });
      } finally {
        await one.query('ROLLBACK');
        await two.query('ROLLBACK');
        await Promise.all([one.end(), two.end()]);
      }
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: s1.id } })).state,
      ).toBe('PUBLISHED');
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: s2.id } })).state,
      ).toBe('PENDING_APPROVAL');
      await approve('assignments', a2, { eligibilityConfirmed: true }).then((r) =>
        expect(r.status).toBe(201),
      );
      const adjacent = await draft(a2.id, room2.id, end, new Date(end.getTime() + 3600000));
      await approve('sessions', adjacent).then((r) => expect(r.status).toBe(201));
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: s1.id } })).instructorId,
      ).toBe(f.teacher.id);
      evidence.push({ finding: 'F02', adjacentDifferentTeacherAndRoomStatus: 201 });
    }, 60000);
    it('changed weekly template warns without rewriting generated drafts; stale review must match current source version', async () => {
      const c = await makeClass('CF template provenance', true),
        date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        weekday = new Date(date + 'T00:00:00Z').getUTCDay() || 7;
      let view = (
        await a(f.academic.id)
          .get(url('classes/' + c.id))
          .expect(200)
      ).body;
      const slot = (
        await a(f.academic.id)
          .post(url('classes/' + c.id + '/weekly-templates'))
          .send({
            dayOfWeek: weekday,
            startTime: '18:00',
            endTime: '19:00',
            locationText: 'Original weekly template',
            expectedUpdatedAt: view.updatedAt,
            reason,
          })
          .expect(201)
      ).body.slot;
      const teacher = await assignment(
        c.id,
        f.teacher.id,
        new Date(Date.now() + 86400000),
        new Date(Date.now() + 10 * 86400000),
      );
      const approvedTeacher = await approve('assignments', await submit('assignments', teacher), {
        eligibilityConfirmed: true,
      });
      expect(approvedTeacher.status).toBe(201);
      const body = {
        from: date,
        through: date,
        timezone: 'Asia/Ho_Chi_Minh',
        excludeDates: [],
        exceptionsReviewed: true,
        assignmentId: teacher.id,
        requiredCapabilities: [],
        reason,
      };
      const generated = await a(f.academic.id)
        .post(url('classes/' + c.id + '/generate-sessions'))
        .send(body)
        .expect(201);
      expect(generated.body.created).toBe(1);
      const id = generated.body.data[0].id,
        original = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id } });
      const edit = async (startTime: string, endTime: string) => {
        view = (await a(f.academic.id).get(url('classes/' + c.id))).body;
        await a(f.academic.id)
          .patch(url('classes/' + c.id + '/weekly-templates/' + slot.id))
          .send({
            dayOfWeek: weekday,
            startTime,
            endTime,
            locationText: 'Revised weekly template',
            expectedUpdatedAt: view.updatedAt,
            reason,
          })
          .expect(200);
      };
      await edit('19:00', '20:00');
      let detail = (
        await a(f.academic.id)
          .get(url('sessions/' + id))
          .expect(200)
      ).body;
      expect(detail.sourceTemplateStatus.kind).toBe('STALE');
      expect(detail.warnings).toContain('SOURCE_TEMPLATE_STALE');
      const repeated = await a(f.academic.id)
        .post(url('classes/' + c.id + '/generate-sessions'))
        .send(body)
        .expect(201);
      expect(repeated.body).toMatchObject({ created: 0, existing: 1, staleExisting: 1 });
      expect(await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id } })).toEqual(
        original,
      );
      const pending = await submit('sessions', original);
      await approve('sessions', pending).then((r) => expect(r.status).toBe(409));
      const observed = detail.sourceTemplateStatus.currentUpdatedAt;
      await edit('20:00', '21:00');
      await approve('sessions', pending, {
        sourceTemplateReviewed: true,
        expectedSourceTemplateUpdatedAt: observed,
      }).then((r) => expect(r.status).toBe(409));
      detail = (await a(f.academic.id).get(url('sessions/' + id))).body;
      const approval = await approve('sessions', pending, {
        sourceTemplateReviewed: true,
        expectedSourceTemplateUpdatedAt: detail.sourceTemplateStatus.currentUpdatedAt,
      });
      expect(approval.status).toBe(201);
      const saved = await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id } });
      expect(saved.startsAt).toEqual(original.startsAt);
      expect(saved.endsAt).toEqual(original.endsAt);
      expect(saved.sourceTemplateUpdatedAt).toEqual(original.sourceTemplateUpdatedAt);
      expect(saved.state).toBe('PUBLISHED');
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { objectId: id, action: 'W02B_STALE_TEMPLATE_REVIEW' },
        }),
      ).toBe(1);
      evidence.push({
        finding: 'F03',
        repeated: { created: 0, existing: 1, staleExisting: 1 },
        draftFieldsUnchanged: true,
        unreviewedApprovalStatus: 409,
        obsoleteReviewedVersionStatus: 409,
        explicitIndependentReviewStatus: 201,
        originalDatedTimesAndTemplateCaptureRetained: true,
      });
    });
  },
);
