import * as request from 'supertest';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { ClassQuizService } from '../src/modules/class-lms/quiz.service';
import type { Prisma } from '../src/generated/prisma/client';
type Source = {
  id: string;
  version: number;
  lockVersion: number;
  state: string;
  questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
};
type Attempt = {
  id: string;
  state: string;
  lockVersion: number;
  deadline: string;
  startedAt: string;
  receipt: string | null;
  result: unknown;
  answers: unknown[];
  source: Source;
};
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03B-C Q1-Q6 actual HTTP/PostgreSQL23',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      section: { id: string; lockVersion: number },
      activity: { id: string; lockVersion: number },
      source: Source,
      attempt: Attempt;
    const evidence: object[] = [],
      key = () => randomUUID(),
      ag = (u: string) => f.agents.get(u)!,
      cls = () => f.lmsClasses[0].id,
      root = (p: string, c = cls()) => '/api/v2/class-quiz/classes/' + c + '/' + p,
      lms = (p: string) => '/api/v2/class-lms/classes/' + cls() + '/' + p,
      path = (p: string, a = activity.id) => root('activities/' + a + '/' + p),
      ap = (p = '', id = attempt.id) => root('attempts/' + id + (p ? '/' + p : ''));
    const body = (previous = 0, close = Date.now() + 3600000) => ({
      idempotencyKey: key(),
      expectedVersion: previous,
      title: 'Synthetic class text MCQ',
      openAt: new Date(Date.now() - 60000).toISOString(),
      closeAt: new Date(close).toISOString(),
      durationMinutes: 5,
      questions: [
        {
          content: 'The office opens ___ nine.',
          explanation: 'PRIVATE_EXPLANATION_Q1',
          points: 3,
          options: [
            { content: 'at', isCorrect: true },
            { content: 'in', isCorrect: false },
          ],
        },
        {
          content: 'Choose the plural.',
          explanation: 'PRIVATE_EXPLANATION_Q2',
          points: 7,
          options: [
            { content: 'book', isCorrect: false },
            { content: 'books', isCorrect: true },
          ],
        },
      ],
    });
    const transition = (v: number) => ({ expectedLockVersion: v, idempotencyKey: key() });
    function privateSafe(x: unknown) {
      const s = JSON.stringify(x);
      expect(s).not.toMatch(
        /isCorrect|correctOption|explanation|pointsAwarded|PRIVATE_EXPLANATION|quizMakerIds/,
      );
    }
    async function sqlActor<T>(userId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
      return dev.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const [s] = await tx.$queryRaw<
          { sid: string }[]
        >`SELECT sid FROM user_sessions WHERE sess->>'userId'=${userId} AND expire>clock_timestamp() LIMIT 1`;
        await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${userId},true),set_config('app.class_lms_session',${s.sid},true)`;
        return work(tx);
      });
    }
    async function approveAndPublish(s: Source, a = activity) {
      const approved = (
        await ag(f.planningApprover.id)
          .post(path('sources/' + s.id + '/approve', a.id))
          .send(transition(s.lockVersion))
          .expect(201)
      ).body;
      await ag(f.teacher.id)
        .post(lms('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(201);
      return approved;
    }
    beforeAll(async () => {
      dev = await startWave01App();
      f = await seedWave03A(dev);
      for (const cap of ['academic.quiz.approve', 'academic.quiz.grade.publish'])
        await grantAcademic(
          dev.prisma,
          f.planningApprover.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          cls(),
        );
      section = (
        await ag(f.teacher.id)
          .post(lms('sections'))
          .send({ title: 'Synthetic Quiz section', introduction: 'Private synthetic DEV' })
          .expect(201)
      ).body;
      await ag(f.teacher.id)
        .post(lms('sections/' + section.id + '/publish'))
        .send({ expectedLockVersion: section.lockVersion })
        .expect(201);
      activity = (
        await ag(f.teacher.id)
          .post(lms('sections/' + section.id + '/activities'))
          .send({
            type: 'QUIZ',
            title: 'Synthetic class quiz',
            introduction: '',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
    });
    afterAll(async () => {
      await writeFile(
        resolve(
          process.env.W03BC_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bc',
          'quiz-http-evidence.json',
        ),
        JSON.stringify(evidence, null, 2),
      );
      if (dev) {
        if (f)
          await dev.prisma.user.updateMany({
            where: {
              id: {
                in: [
                  ...f.users.map((x) => x.id),
                  f.otherAcademic.id,
                  ...f.contenders.map((x) => x.id),
                ],
              },
            },
            data: { status: 'INACTIVE' },
          });
        await dev.app.close();
      }
    });
    it('enforces live roles/current teacher/class scope and no implicit checker grants', async () => {
      await request(dev.app.getHttpServer()).get(path('author')).expect(401);
      for (const u of f.users.filter((x) => x.id !== f.teacher.id)) {
        const r = await ag(u.id).get(path('author'));
        expect(r.status).toBe(u.role === 'INSTRUCTOR' ? 404 : 403);
      }
      await ag(f.teacher.id)
        .get(root('activities/' + activity.id + '/author', f.lmsClasses[1].id))
        .expect(404);
      await ag(f.otherLearner.id).get(path('launch')).expect(404);
      expect(
        (await ag(f.academic.id).get('/api/v2/class-quiz/checker').expect(200)).body.sources,
      ).toHaveLength(0);
      evidence.push({
        q: 'Q6',
        guest401: true,
        roles403: true,
        crossClass404: true,
        pending404: true,
        noDefaultChecker: true,
      });
    });
    it('requires explicit dates/5–120 duration, valid single key and real source; cannot publish draft', async () => {
      const b = body();
      for (const patch of [
        { durationMinutes: 4 },
        { durationMinutes: 121 },
        { closeAt: b.openAt },
        { openAt: '2026-01-01T12:00:00' },
        {
          questions: [
            {
              ...b.questions[0],
              options: b.questions[0].options.map((x) => ({ ...x, isCorrect: true })),
            },
          ],
        },
      ])
        await ag(f.teacher.id)
          .post(path('sources'))
          .send({ ...b, ...patch })
          .expect(400);
      await ag(f.teacher.id)
        .post(lms('activities/' + activity.id + '/publish'))
        .send({ expectedLockVersion: activity.lockVersion })
        .expect(409);
      await ag(f.learner.id).get(path('launch')).expect(404);
      source = (await ag(f.teacher.id).post(path('sources')).send(b).expect(201)).body;
      expect(source.version).toBe(1);
      expect(source.questions).toHaveLength(2);
      await ag(f.academic.id)
        .post(path('sources/' + source.id + '/approve'))
        .send(transition(0))
        .expect(403);
      await ag(f.planningApprover.id)
        .post(
          root(
            'activities/' + activity.id + '/sources/' + source.id + '/approve',
            f.lmsClasses[1].id,
          ),
        )
        .send(transition(0))
        .expect(403);
      evidence.push({
        q: 'Q1/Q2/Q3',
        explicitConfig400: true,
        unapprovedNotPublished: true,
        persistedMcq: true,
        wrongClassChecker403: true,
      });
    });
    it('retains maker history across role changes and freezes independent approved source/config at SQL', async () => {
      await dev.prisma.user.update({
        where: { id: f.teacher.id },
        data: { role: 'ACADEMIC_MANAGER' },
      });
      await grantAcademic(
        dev.prisma,
        f.teacher.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.quiz.approve',
        'CLASS',
        cls(),
      );
      await ag(f.teacher.id)
        .post(path('sources/' + source.id + '/approve'))
        .send(transition(source.lockVersion))
        .expect(403);
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { role: 'INSTRUCTOR' } });
      const b = transition(source.lockVersion),
        url = path('sources/' + source.id + '/approve');
      const rs = await Promise.all([1, 2].map(() => ag(f.planningApprover.id).post(url).send(b)));
      expect(rs.map((r) => r.status)).toEqual([201, 201]);
      expect(rs[0].body.id).toBe(rs[1].body.id);
      source = rs[0].body;
      await ag(f.planningApprover.id)
        .post(url)
        .send({ ...b, expectedLockVersion: 99 })
        .expect(409);
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.test.update({
            where: { id: source.id },
            data: { title: 'Tampered', quizLockVersion: { increment: 1 } },
          }),
        ),
      ).rejects.toThrow(/FROZEN/);
      const tq = await dev.prisma.testQuestion.findFirstOrThrow({ where: { testId: source.id } });
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.question.update({ where: { id: tq.questionId }, data: { content: 'Tampered' } }),
        ),
      ).rejects.toThrow(/FROZEN/);
      const cfg = await dev.prisma.classAssessment.findFirstOrThrow({
        where: { testId: source.id },
      });
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.classAssessment.update({
            where: { id: cfg.id },
            data: { closeAt: new Date(Date.now() + 7200000) },
          }),
        ),
      ).rejects.toThrow(/FROZEN/);
      await ag(f.teacher.id)
        .post(lms('activities/' + activity.id + '/publish'))
        .send({ expectedLockVersion: activity.lockVersion })
        .expect(201);
      evidence.push({
        q: 'Q2/Q6',
        selfApprovalAfterRoleChange403: true,
        concurrentApprovalIdempotent: true,
        sqlSourceAndConfigFrozen: true,
      });
    });
    it('starts/resumes exactly one server-deadline attempt under concurrent keys and hides keys/score', async () => {
      const launch = (await ag(f.learner.id).get(path('launch')).expect(200)).body;
      privateSafe(launch);
      const rs = await Promise.all(
        [1, 2, 3].map(() =>
          ag(f.learner.id).post(path('start')).send({ sourceId: source.id, idempotencyKey: key() }),
        ),
      );
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
      attempt = rs[0].body;
      expect(Date.parse(attempt.deadline) - Date.parse(attempt.startedAt)).toBe(300000);
      expect(attempt.result).toBeNull();
      privateSafe(attempt);
      expect((await ag(f.learner.id).get(ap()).expect(200)).body.id).toBe(attempt.id);
      await ag(f.otherLearner.id).get(ap()).expect(404);
      await ag(f.learner.id)
        .get(root('attempts/' + attempt.id, f.lmsClasses[1].id))
        .expect(404);
      const queue = (await ag(f.teacher.id).get(path('author')).expect(200)).body;
      expect(queue.attempts).toHaveLength(0);
      expect(await dev.prisma.testAttempt.count({ where: { testId: source.id } })).toBe(1);
      evidence.push({
        q: 'Q3/Q6',
        concurrentStartOne: true,
        deadlineSeconds: 300,
        resumeSame: true,
        noActiveTeacherAnswers: true,
        noLearnerKeyOrScore: true,
      });
    });
    it('autosaves answer/mark independently with CAS, lost-ACK replay and foreign-option rejection', async () => {
      const q = source.questions[0],
        b = {
          ...transition(attempt.lockVersion),
          answers: [{ questionId: q.id, optionId: q.options.find((o) => o.isCorrect)!.id }],
          marked: [source.questions[1].id],
        };
      const rs = await Promise.all(
        [1, 2].map(() => ag(f.learner.id).put(ap('answers')).send(b).expect(200)),
      );
      expect(rs[0].body.lockVersion).toBe(rs[1].body.lockVersion);
      attempt = rs[0].body;
      expect(attempt.answers).toHaveLength(2);
      privateSafe(attempt);
      await ag(f.learner.id)
        .put(ap('answers'))
        .send({ ...b, idempotencyKey: key() })
        .expect(409);
      await ag(f.learner.id)
        .put(ap('answers'))
        .send({ ...b, marked: [] })
        .expect(409);
      await ag(f.learner.id)
        .put(ap('answers'))
        .send({
          ...transition(attempt.lockVersion),
          answers: [{ questionId: q.id, optionId: source.questions[1].options[0].id }],
          marked: [],
        })
        .expect(400);
      const saved = (await ag(f.learner.id).get(ap()).expect(200)).body;
      expect(saved.lockVersion).toBe(attempt.lockVersion);
      expect(saved.marked).toEqual([source.questions[1].id]);
      evidence.push({
        q: 'Q4',
        answerAndMarkIndependent: true,
        lostAckReplay: true,
        staleTab409: true,
        sameKeyDifferentBody409: true,
        foreignOption400: true,
      });
    });
    it('new source version never rewrites in-flight source and legacy paths cannot expose quiz', async () => {
      const v2 = (
        await ag(f.teacher.id)
          .post(path('sources'))
          .send({
            ...body(1),
            title: 'New draft source',
            questions: [{ ...body().questions[0], content: 'NEW_DRAFT_NOT_FOR_OLD_ATTEMPT' }],
          })
          .expect(201)
      ).body;
      expect(v2.version).toBe(2);
      const resumed = (await ag(f.learner.id).get(ap()).expect(200)).body;
      expect(resumed.source.id).toBe(source.id);
      expect(JSON.stringify(resumed)).not.toContain('NEW_DRAFT');
      privateSafe(resumed);
      const stored = await dev.prisma.test.findUniqueOrThrow({ where: { id: source.id } });
      expect(stored.courseId).toBeNull();
      expect(stored.status).toBe('DRAFT');
      expect(
        (await dev.prisma.classAssessment.findFirstOrThrow({ where: { testId: source.id } }))
          .isActive,
      ).toBe(false);
      evidence.push({
        q: 'Q2/Q6',
        sourceV2Draft: true,
        inFlightPinnedV1: true,
        legacyCourseNullDraftInactive: true,
      });
    });
    it('double submit uses only persisted answers, durable receipt/private score, no phantom zero or second attempt', async () => {
      const b = transition(attempt.lockVersion),
        rs = await Promise.all(
          [1, 2].map(() => ag(f.learner.id).post(ap('submit')).send(b).expect(201)),
        );
      attempt = rs[0].body;
      expect(attempt.state).toBe('SUBMITTED');
      expect(attempt.receipt).toBeTruthy();
      expect(rs[1].body.receipt).toBe(attempt.receipt);
      expect(attempt.result).toBeNull();
      privateSafe(attempt);
      const row = await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      expect(row.score).toBe(3);
      expect(row.maxScore).toBe(10);
      expect(row.quizPublishedAt).toBeNull();
      expect(
        (
          await ag(f.learner.id)
            .post(path('start'))
            .send({ sourceId: source.id, idempotencyKey: key() })
            .expect(201)
        ).body.id,
      ).toBe(attempt.id);
      const book = (await ag(f.learner.id).get(root('gradebook')).expect(200)).body;
      expect(book.entries[0].result).toBeNull();
      expect(book.entries[0].state).toBe('PENDING_RELEASE');
      privateSafe(book);
      const after = (
        await ag(f.learner.id)
          .put(ap('answers'))
          .send({ ...transition(attempt.lockVersion), answers: [], marked: [] })
          .expect(200)
      ).body;
      expect(after.receipt).toBe(attempt.receipt);
      expect(
        (await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).score,
      ).toBe(3);
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { action: 'W03BC_FINALIZE', objectId: attempt.id },
        }),
      ).toBe(1);
      evidence.push({
        q: 'Q4/Q5',
        doubleSubmitOneReceipt: true,
        persistedScore: 3,
        max: 10,
        pendingNull: true,
        noRetake: true,
        finalAnswersImmutable: true,
      });
    });
    it('requires separate exact-class grade capability, publishes idempotently and never releases answer keys', async () => {
      const b = transition(attempt.lockVersion);
      await ag(f.academic.id).post(ap('publish')).send(b).expect(403);
      await ag(f.teacher.id).post(ap('publish')).send(b).expect(403);
      await ag(f.planningApprover.id)
        .post(root('attempts/' + attempt.id + '/publish', f.lmsClasses[1].id))
        .send(b)
        .expect(403);
      const rs = await Promise.all(
        [1, 2].map(() => ag(f.planningApprover.id).post(ap('publish')).send(b).expect(201)),
      );
      expect(rs[0].body.publishedAt).toBe(rs[1].body.publishedAt);
      const book = (await ag(f.learner.id).get(root('gradebook')).expect(200)).body;
      expect(book.entries[0].result).toMatchObject({ earned: 3, max: 10, percentage: 30 });
      privateSafe(book);
      privateSafe((await ag(f.learner.id).get(ap()).expect(200)).body);
      await ag(f.learner.id).get(path('author')).expect(403);
      await ag(f.learner.id).get('/api/v2/class-quiz/checker').expect(403);
      evidence.push({
        q: 'Q5/Q6',
        separateGradeCapability: true,
        independentRelease: true,
        concurrentPublicationOne: true,
        published30percent: true,
        keysStillHidden: true,
      });
    });
    it('DB enforces one attempt, answer ownership, frozen receipt and grade immutability', async () => {
      const row = await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      await expect(
        sqlActor(f.learner.id, (tx) =>
          tx.testAttempt.create({
            data: {
              testId: source.id,
              learnerId: f.learner.id,
              enrollmentId: row.enrollmentId,
              classAssessmentId: row.classAssessmentId,
              quizRevisionId: row.quizRevisionId,
              quizDeadline: new Date(Date.now() + 99999),
              attemptNumber: 1,
            },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        sqlActor(f.learner.id, (tx) =>
          tx.testAttempt.update({
            where: { id: row.id },
            data: { score: 0, quizLockVersion: { increment: 1 } },
          }),
        ),
      ).rejects.toThrow(/IMMUTABLE/);
      const ans = await dev.prisma.testAnswer.findFirstOrThrow({
        where: { attemptId: attempt.id },
      });
      await expect(
        sqlActor(f.learner.id, (tx) =>
          tx.testAnswer.update({ where: { id: ans.id }, data: { selectedOptionIds: [] } }),
        ),
      ).rejects.toThrow(/CLOSED/);
      evidence.push({
        q: 'Q6',
        sqlUniqueAttempt: true,
        sqlReceiptAndPublishedGradeFrozen: true,
        sqlFinalAnswerDenied: true,
      });
    });
    it('deadline finalizes without browser across worker restart; racing autosave cannot extend time', async () => {
      const a = (
        await ag(f.teacher.id)
          .post(lms('sections/' + section.id + '/activities'))
          .send({
            type: 'QUIZ',
            title: 'Short window synthetic',
            introduction: '',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
      const s = (
        await ag(f.teacher.id)
          .post(path('sources', a.id))
          .send(body(0, Date.now() + 4500))
          .expect(201)
      ).body;
      await approveAndPublish(s, a);
      let r = (
        await ag(f.learner.id)
          .post(path('start', a.id))
          .send({ sourceId: s.id, idempotencyKey: key() })
          .expect(201)
      ).body;
      expect(Date.parse(r.deadline) - Date.parse(r.startedAt)).toBeLessThan(5000);
      r = (
        await ag(f.learner.id)
          .put(ap('answers', r.id))
          .send({
            ...transition(r.lockVersion),
            answers: [{ questionId: s.questions[0].id, optionId: s.questions[0].options[0].id }],
            marked: [],
          })
          .expect(200)
      ).body;
      const service = dev.app.get(ClassQuizService);
      service.onModuleDestroy();
      const lock = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await lock.connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT pg_advisory_xact_lock(842030)');
        const queued = ag(f.learner.id)
          .put(ap('answers', r.id))
          .send({ ...transition(r.lockVersion), answers: [], marked: [] })
          .then((x) => x);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, Date.parse(r.deadline) - Date.now() + 80)),
        );
        await lock.query('COMMIT');
        const response = await queued;
        expect(response.status).toBe(200);
        expect(response.body.state).toBe('EXPIRED');
      } finally {
        await lock.end();
      }
      // Restart reconciliation is independent of student HTTP and client clock.
      await service.sweep();
      service.onModuleInit();
      const after = (await ag(f.learner.id).get(ap('', r.id)).expect(200)).body;
      expect(after.state).toBe('EXPIRED');
      expect(after.result).toBeNull();
      const db = await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: r.id } });
      expect(db.score).toBe(3);
      expect(db.quizDeadline!.toISOString()).toBe(r.deadline);
      const retry = (
        await ag(f.learner.id).post(ap('submit', r.id)).send(transition(r.lockVersion)).expect(201)
      ).body;
      expect(retry.receipt).toBe(after.receipt);
      const save = (
        await ag(f.learner.id)
          .put(ap('answers', r.id))
          .send({ ...transition(r.lockVersion), answers: [], marked: [] })
          .expect(200)
      ).body;
      expect(save.receipt).toBe(after.receipt);
      privateSafe(after);
      evidence.push({
        q: 'Q3/Q4',
        serverMinCloseAt: true,
        restartSweepNoBrowser: true,
        expiredPersistedScore: 3,
        lateAutosaveNoChange: true,
        sameReceipt: true,
        actualQueuedAutosaveAcrossDeadline: true,
      });
    });
    it('legitimate zero remains private until release and is distinct from pending null', async () => {
      const a = (
        await ag(f.teacher.id)
          .post(lms('sections/' + section.id + '/activities'))
          .send({
            type: 'QUIZ',
            title: 'Synthetic valid zero',
            introduction: '',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
      const s = (await ag(f.teacher.id).post(path('sources', a.id)).send(body()).expect(201)).body;
      await approveAndPublish(s, a);
      let r = (
        await ag(f.learner.id)
          .post(path('start', a.id))
          .send({ sourceId: s.id, idempotencyKey: key() })
          .expect(201)
      ).body;
      r = (
        await ag(f.learner.id).post(ap('submit', r.id)).send(transition(r.lockVersion)).expect(201)
      ).body;
      expect(r.result).toBeNull();
      expect((await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: r.id } })).score).toBe(
        0,
      );
      await ag(f.planningApprover.id)
        .post(ap('publish', r.id))
        .send(transition(r.lockVersion))
        .expect(201);
      const out = (await ag(f.learner.id).get(ap('', r.id)).expect(200)).body;
      expect(out.result).toMatchObject({ earned: 0, max: 10, percentage: 0 });
      privateSafe(out);
      evidence.push({ q: 'Q5', validZeroPublished: true, pendingNeverZero: true });
    });
    it('server finalization and audit store UTC even on a New York PostgreSQL session', async () => {
      const a = (
        await ag(f.teacher.id)
          .post(lms('sections/' + section.id + '/activities'))
          .send({
            type: 'QUIZ',
            title: 'Non-UTC SQL session',
            introduction: '',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
      const s = (await ag(f.teacher.id).post(path('sources', a.id)).send(body()).expect(201)).body;
      await approveAndPublish(s, a);
      const r = (
        await ag(f.learner.id)
          .post(path('start', a.id))
          .send({ sourceId: s.id, idempotencyKey: key() })
          .expect(201)
      ).body;
      await sqlActor(f.learner.id, async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'America/New_York'`;
        await tx.testAttempt.update({
          where: { id: r.id },
          data: { status: 'SUBMITTED', quizLockVersion: { increment: 1 } },
        });
        const [row] = await tx.$queryRaw<
          { auditDelta: number; submitDelta: number }[]
        >`SELECT extract(epoch from (e."createdAt" AT TIME ZONE 'UTC')-clock_timestamp())::float8 AS "auditDelta",extract(epoch from (t."submittedAt" AT TIME ZONE 'UTC')-clock_timestamp())::float8 AS "submitDelta" FROM domain_audit_events e JOIN test_attempts t ON t.id::text=e."objectId" WHERE e.action='W03BC_FINALIZE' AND t.id=${r.id}::uuid`;
        expect(Math.abs(row.auditDelta)).toBeLessThan(3);
        expect(Math.abs(row.submitDelta)).toBeLessThan(3);
      });
      evidence.push({
        q: 'Q3/Q4',
        postgresTimezone: 'America/New_York',
        submittedAtAndAuditUtc: true,
      });
    });
    it('legacy learner/source endpoints and forged client deadline cannot bypass the dedicated boundary', async () => {
      const e = await dev.prisma.enrollment.findFirstOrThrow({
        where: { learnerId: f.learner.id, classOfferingId: cls() },
      });
      const base = '/api/learning/enrollments/' + e.id;
      await ag(f.learner.id)
        .get(base + '/attempts/' + attempt.id)
        .expect(404);
      await ag(f.learner.id)
        .get(base + '/attempts/' + attempt.id + '/result')
        .expect(404);
      await ag(f.learner.id)
        .post(base + '/tests/' + source.id + '/attempts')
        .send({})
        .expect(404);
      const list = (
        await ag(f.learner.id)
          .get(base + '/tests')
          .expect(200)
      ).body;
      expect(JSON.stringify(list)).not.toContain(source.id);
      privateSafe(list);
      const q = await dev.prisma.testQuestion.findFirstOrThrow({ where: { testId: source.id } });
      await ag(f.learner.id)
        .get('/api/instructor/questions/' + q.questionId)
        .expect(403);
      await ag(f.teacher.id)
        .get('/api/instructor/questions/' + q.questionId)
        .expect(404);
      await ag(f.teacher.id)
        .get('/api/instructor/tests/' + source.id)
        .expect(404);
      await ag(f.learner.id)
        .put(ap('answers'))
        .send({ ...transition(0), answers: [], marked: [], deadline: '2099-01-01T00:00:00Z' })
        .expect(400);
      const hash = await dev.prisma.$queryRaw<
        { stored: string; actual: string }[]
      >`SELECT "quizSourceHash" AS stored,w03bc_source_hash(id) AS actual FROM tests WHERE id=${source.id}::uuid`;
      expect(hash[0].stored).toBe(hash[0].actual);
      expect(hash[0].stored).toMatch(/^[a-f0-9]{64}$/);
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.testQuestionGroup.create({
            data: { testId: source.id, skill: 'READING', orderIndex: 0 },
          }),
        ),
      ).rejects.toThrow(/TEXT_ONLY/);
      evidence.push({
        q: 'Q6',
        legacyAttemptAndResult404: true,
        legacySource404: true,
        forgedClockField400: true,
        sqlSnapshotSha256Matches: true,
        mediaGroupBlocked: true,
      });
    });
    it('publishing a new approved version preserves the old receipt and permits only one new-version attempt', async () => {
      const s = await dev.prisma.test.findFirstOrThrow({
        where: { quizActivityId: activity.id, quizVersion: 2 },
      });
      await ag(f.planningApprover.id)
        .post(path('sources/' + s.id + '/approve'))
        .send(transition(s.quizLockVersion))
        .expect(201);
      const row = (
        await ag(f.teacher.id)
          .get(lms('activities/' + activity.id))
          .expect(200)
      ).body;
      const draft = (
        await ag(f.teacher.id)
          .patch(lms('sections/' + section.id + '/activities/' + activity.id))
          .send({
            type: 'QUIZ',
            title: row.title,
            introduction: row.introduction,
            contentMarkdown: '',
            expectedLockVersion: row.lockVersion,
          })
          .expect(200)
      ).body;
      await ag(f.teacher.id)
        .post(lms('activities/' + activity.id + '/publish'))
        .send({ expectedLockVersion: draft.lockVersion })
        .expect(201);
      const old = (await ag(f.learner.id).get(ap()).expect(200)).body;
      expect(old.source.id).toBe(source.id);
      expect(old.receipt).toBe(attempt.receipt);
      expect(old.result.earned).toBe(3);
      privateSafe(old);
      const responses = await Promise.all(
        [1, 2].map(() =>
          ag(f.learner.id)
            .post(path('start'))
            .send({ sourceId: s.id, idempotencyKey: key() })
            .expect(201),
        ),
      );
      expect(responses[0].body.id).toBe(responses[1].body.id);
      expect(responses[0].body.id).not.toBe(attempt.id);
      expect(responses[0].body.source.version).toBe(2);
      const other = await dev.prisma.enrollment.findFirstOrThrow({
        where: { learnerId: f.otherLearner.id, classOfferingId: cls() },
      });
      await dev.prisma.enrollment.update({ where: { id: other.id }, data: { status: 'ACTIVE' } });
      await ag(f.otherLearner.id).get(ap()).expect(404);
      await dev.prisma.enrollment.update({
        where: { id: other.id },
        data: { status: 'PENDING_PAYMENT' },
      });
      evidence.push({
        q: 'Q2/Q3/Q6',
        publishedV2KeepsV1Receipt: true,
        oneAttemptEachVersion: true,
        activePeerIdor404: true,
      });
    });
    it('replaced V2 instructor cannot regain legacy fallback on quiz authoring or source mutation', async () => {
      const maker = ag(f.academic.id),
        checker = ag(f.planningApprover.id),
        reason = 'Synthetic current instructor replacement for Quiz safety';
      const prior = await dev.prisma.classInstructorAssignment.findFirstOrThrow({
        where: { classOfferingId: cls(), state: 'PUBLISHED' },
      });
      let row = (
        await maker
          .post('/api/v2/academic/classes/' + cls() + '/assignments')
          .send({
            instructorId: f.otherTeacher.id,
            replacesId: prior.id,
            effectiveFrom: new Date(Date.now() + 2200).toISOString(),
            effectiveTo: new Date(Date.now() + 86400000).toISOString(),
            reason,
          })
          .expect(201)
      ).body;
      row = (
        await maker
          .post('/api/v2/academic/assignments/' + row.id + '/submit')
          .send({ expectedLockVersion: row.lockVersion, reason })
          .expect(201)
      ).body;
      await checker
        .post('/api/v2/academic/assignments/' + row.id + '/approve')
        .send({ expectedLockVersion: row.lockVersion, reason, eligibilityConfirmed: true })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 2300));
      await ag(f.teacher.id).get(path('author')).expect(404);
      await ag(f.teacher.id).post(path('sources')).send(body(2)).expect(404);
      await ag(f.otherTeacher.id).get(path('author')).expect(200);
      evidence.push({
        q: 'Q6',
        replacedTeacherReadAndWrite404: true,
        newEffectiveTeacher200: true,
        legacyOwnerNotRestored: true,
      });
    });
    it('revocation/current-session boundaries apply to replay, resume, inbox and logout', async () => {
      await dev.prisma.permissionGrant.updateMany({
        where: {
          userId: f.planningApprover.id,
          capability: { in: ['academic.quiz.approve', 'academic.quiz.grade.publish'] },
          scopeId: cls(),
        },
        data: {
          revokedAt: new Date(),
          revokedBy: f.approver.id,
          revokeReason: 'Synthetic Quiz revocation',
        },
      });
      expect(
        (await ag(f.planningApprover.id).get('/api/v2/class-quiz/checker').expect(200)).body,
      ).toEqual({ sources: [], attempts: [] });
      await ag(f.planningApprover.id).post(ap('publish')).send(transition(0)).expect(403);
      const e = await dev.prisma.enrollment.findFirstOrThrow({
        where: { learnerId: f.learner.id, classOfferingId: cls() },
      });
      await dev.prisma.enrollment.update({
        where: { id: e.id },
        data: { status: 'PENDING_PAYMENT' },
      });
      await ag(f.learner.id).get(ap()).expect(404);
      await ag(f.learner.id).get(root('gradebook')).expect(404);
      await dev.prisma.enrollment.update({ where: { id: e.id }, data: { status: 'ACTIVE' } });
      await ag(f.learner.id).post('/api/auth/logout').expect(204);
      await ag(f.learner.id).get(ap()).expect(401);
      evidence.push({
        q: 'Q6',
        revokedChecker403: true,
        revokedEnrollment404: true,
        logout401: true,
      });
    });
  },
);
