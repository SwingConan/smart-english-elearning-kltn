import * as request from 'supertest';
import { Client } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { LearningResourceStorage } from '../src/modules/learning/learning-resource.storage';
import { ClassLmsModule } from '../src/modules/class-lms/class-lms.module';
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03B-A actual Assignment/Submission PostgreSQL21',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      section: { id: string; lockVersion: number },
      a: { id: string; lockVersion: number; revisionId: string },
      draft: {
        id: string;
        revisionId: string;
        lockVersion: number;
        text: string;
        file: { sha256: string };
        state: string;
        grade: null;
        receipt: { id: string } | null;
      };
    const evidence: object[] = [],
      body = {
        type: 'ASSIGNMENT',
        title: 'TOEIC class writing exercise',
        introduction: 'Synthetic class-local assignment',
        contentMarkdown: 'Write a short workplace announcement. Explain two details.',
      };
    const agent = (id: string) => f.agents.get(id)!,
      base = (p = '') => '/api/v2/class-lms/classes/' + f.lmsClasses[0].id + (p ? '/' + p : ''),
      ap = (p = '') => base('activities/' + a.id + '/assignment' + (p ? '/' + p : ''));
    async function newAssignment(title: string) {
      return (
        await agent(f.teacher.id)
          .post(base('sections/' + section.id + '/activities'))
          .send({ ...body, title })
          .expect(201)
      ).body;
    }
    beforeAll(async () => {
      process.env.LEARNING_RESOURCE_STORAGE_ROOT = resolve(
        resolve(
          process.env.W03BA_EVIDENCE_ROOT ?? '.local-storage/v2-wave03ba',
          'test-private-files',
        ),
      );
      dev = await startWave01App();
      f = await seedWave03A(dev);
    }, 60000);
    afterAll(async () => {
      await mkdir(process.env.W03BA_EVIDENCE_ROOT ?? '.local-storage/v2-wave03ba', {
        recursive: true,
      });
      await writeFile(
        resolve(
          process.env.W03BA_EVIDENCE_ROOT ?? '.local-storage/v2-wave03ba',
          'assignment-http-evidence.json',
        ),
        JSON.stringify(evidence, null, 2),
      );
      if (dev) {
        if (f)
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
        await dev.app.close();
      }
    });
    it('real class-local authoring, policy fields rejected, all wrong roles and cross-class publication blocked', async () => {
      section = (
        await agent(f.teacher.id)
          .post(base('sections'))
          .send({ title: 'Assignment section', introduction: 'Published independently' })
          .expect(201)
      ).body;
      a = await newAssignment(body.title);
      for (const u of f.users.filter((u) => u.id !== f.teacher.id)) {
        const r = await agent(u.id)
          .post(base('sections/' + section.id + '/activities'))
          .send(body);
        expect(r.status).toBe(u.role === 'INSTRUCTOR' ? 404 : 403);
      }
      for (const extra of [
        { availableUntil: '2030-01-01T00:00:00Z' },
        { resourceUrl: 'https://example.com/private' },
        { sourceLessonId: f.standardLesson.id },
      ])
        await agent(f.teacher.id)
          .post(base('sections/' + section.id + '/activities'))
          .send({ ...body, ...extra })
          .expect(400);
      await agent(f.learner.id)
        .get(base('activities/' + a.id))
        .expect(404);
      await agent(f.teacher.id)
        .post(base('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(409);
      const s = (
        await agent(f.teacher.id)
          .post(base('sections/' + section.id + '/publish'))
          .send({ expectedLockVersion: section.lockVersion })
          .expect(201)
      ).body;
      section.lockVersion = s.lockVersion;
      await agent(f.otherTeacher.id)
        .post(base('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(404);
      a = {
        ...a,
        ...(
          await agent(f.teacher.id)
            .post(base('activities/' + a.id + '/publish'))
            .send({ expectedLockVersion: a.lockVersion })
            .expect(201)
        ).body,
      };
      await request(dev.app.getHttpServer()).get(ap('mine')).expect(401);
      await agent(f.otherLearner.id).get(ap('mine')).expect(404);
      await agent(f.learner.id)
        .get(
          '/api/v2/class-lms/classes/' +
            f.lmsClasses[1].id +
            '/activities/' +
            a.id +
            '/assignment/mine',
        )
        .expect(404);
      for (const u of f.users.filter((u) => u.role !== 'STUDENT'))
        await agent(u.id).get(ap('mine')).expect(403);
      evidence.push({ name: 'class/role/publication/policy boundaries', pass: true });
    });
    it('text draft CAS, unpublished/mixed source blocked, teacher cannot read private drafts, no fake score', async () => {
      const b = {
        revisionId: a.revisionId,
        expectedLockVersion: 0,
        text: 'Our office will open a new training room.',
      };
      await agent(f.learner.id)
        .put(ap('mine'))
        .send({ ...b, revisionId: randomUUID() })
        .expect(409);
      draft = (await agent(f.learner.id).put(ap('mine')).send(b).expect(200)).body;
      expect(draft.state).toBe('DRAFT');
      expect(draft.grade).toBeNull();
      expect(draft.receipt).toBeNull();
      await agent(f.learner.id).put(ap('mine')).send(b).expect(409);
      expect(
        (await agent(f.teacher.id).get(ap('submissions')).expect(200)).body.submissions,
      ).toHaveLength(0);
      const r = await agent(f.learner.id)
        .put(ap('mine'))
        .send({ ...b, expectedLockVersion: draft.lockVersion, score: 0 });
      expect(r.status).toBe(400);
      evidence.push({ name: 'draft CAS/private/null grade', pass: true });
    });
    it('file baseline validates MIME, extension, size, path; failures retain saved draft; authenticated private streaming', async () => {
      const form = () =>
        agent(f.learner.id)
          .post(ap('mine/file'))
          .field('revisionId', a.revisionId)
          .field('expectedLockVersion', String(draft.lockVersion))
          .field('text', draft.text);
      for (const [name, type, buffer] of [
        ['bad.html', 'text/html', Buffer.from('<script>bad</script>')],
        ['bad.pdf', 'application/pdf', Buffer.from('not PDF')],
        ['bad.txt', 'application/pdf', Buffer.from('wrong MIME')],
        ['bad.txt', 'text/plain', Buffer.from([65, 0, 66])],
      ] as const)
        await form().attach('file', buffer, { filename: name, contentType: type }).expect(400);
      await form()
        .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1, 65), {
          filename: 'large.txt',
          contentType: 'text/plain',
        })
        .expect(413);
      const storage = dev.app.select(ClassLmsModule).get(LearningResourceStorage, { strict: true });
      await expect(
        storage.put({
          buffer: Buffer.from('x'),
          size: 1,
          mimetype: 'text/plain',
          originalname: '../escape.txt',
        }),
      ).rejects.toThrow();
      expect(
        (await agent(f.learner.id).get(ap('mine')).expect(200)).body.submission.lockVersion,
      ).toBe(draft.lockVersion);
      const content = Buffer.from('Synthetic written response attachment.');
      draft = (
        await form()
          .attach('file', content, { filename: 'response.txt', contentType: 'text/plain' })
          .expect(201)
      ).body;
      expect(draft.file.sha256).toBe(createHash('sha256').update(content).digest('hex'));
      expect(JSON.stringify(draft)).not.toContain('storageKey');
      const file = ap('submissions/' + draft.id + '/file');
      const r = await agent(f.learner.id).get(file).expect(200);
      expect(r.text).toBe(content.toString());
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      await agent(f.teacher.id).get(file).expect(404);
      await agent(f.otherLearner.id).get(file).expect(404);
      await request(dev.app.getHttpServer()).get(file).expect(401);
      evidence.push({ name: 'private file validation/ownership/draft preservation', pass: true });
    });
    it('storage outage/integrity failure preserves draft; identical concurrent submit returns one immutable receipt and one audit', async () => {
      const b = {
          revisionId: a.revisionId,
          expectedLockVersion: draft.lockVersion,
          // PostgreSQL canonicalizes UUIDs; identical uppercase transport retries must replay too.
          idempotencyKey: randomUUID().toUpperCase(),
        },
        storage = dev.app.select(ClassLmsModule).get(LearningResourceStorage, { strict: true }),
        spy = jest.spyOn(storage, 'stat').mockRejectedValueOnce(new Error('Synthetic outage'));
      await agent(f.learner.id).post(ap('mine/submit')).send(b).expect(503);
      spy.mockRestore();
      expect((await agent(f.learner.id).get(ap('mine')).expect(200)).body.submission.state).toBe(
        'DRAFT',
      );
      const corrupt = jest.spyOn(storage, 'stat').mockResolvedValueOnce({ sizeBytes: 1 });
      await agent(f.learner.id).post(ap('mine/submit')).send(b).expect(503);
      corrupt.mockRestore();
      const rs = await Promise.all(
        Array.from({ length: 4 }, () => agent(f.learner.id).post(ap('mine/submit')).send(b)),
      );
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(new Set(rs.map((r) => r.body.receipt.id)).size).toBe(1);
      draft = rs[0].body;
      expect(draft.state).toBe('SUBMITTED');
      expect(draft.grade).toBeNull();
      expect(
        await dev.prisma.classAssignmentSubmission.count({ where: { activityId: a.id } }),
      ).toBe(1);
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { objectId: draft.id, action: 'W03B_SUBMIT' },
        }),
      ).toBe(1);
      await agent(f.learner.id)
        .post(ap('mine/submit'))
        .send({ ...b, idempotencyKey: randomUUID() })
        .expect(409);
      await agent(f.learner.id)
        .post(ap('mine/submit'))
        .send({ ...b, revisionId: randomUUID() })
        .expect(409);
      await agent(f.learner.id)
        .put(ap('mine'))
        .send({
          revisionId: a.revisionId,
          expectedLockVersion: draft.lockVersion,
          text: 'Overwrite',
        })
        .expect(409);
      expect(
        (await agent(f.teacher.id).get(ap('submissions')).expect(200)).body.submissions[0].source
          .contentMarkdown,
      ).toBe(body.contentMarkdown);
      await agent(f.otherTeacher.id).get(ap('submissions')).expect(404);
      await agent(f.teacher.id)
        .get(ap('submissions/' + draft.id + '/file'))
        .expect(200);
      evidence.push({
        name: 'storage failure + 4 concurrent identical submits',
        receiptId: draft.id,
        singleAudit: true,
        nullableGrade: true,
        pass: true,
      });
    });
    it('published revision replacement keeps provenance, no resubmission even on new revision; draft source requires explicit rebase', async () => {
      let second = await newAssignment('Version race exercise');
      second = {
        ...second,
        ...(
          await agent(f.teacher.id)
            .post(base('activities/' + second.id + '/publish'))
            .send({ expectedLockVersion: second.lockVersion })
            .expect(201)
        ).body,
      };
      const own = base('activities/' + second.id + '/assignment/mine'),
        d = (
          await agent(f.learner.id)
            .put(own)
            .send({
              revisionId: second.revisionId,
              expectedLockVersion: 0,
              text: 'Version one answer',
            })
            .expect(200)
        ).body;
      const edit = (
        await agent(f.teacher.id)
          .patch(base('sections/' + section.id + '/activities/' + second.id))
          .send({
            ...body,
            title: 'Version race exercise v2',
            contentMarkdown: 'New instructions',
            expectedLockVersion: second.lockVersion,
          })
          .expect(200)
      ).body;
      await agent(f.learner.id).get(own).expect(404);
      const pub = (
        await agent(f.teacher.id)
          .post(base('activities/' + second.id + '/publish'))
          .send({ expectedLockVersion: edit.lockVersion })
          .expect(201)
      ).body;
      await agent(f.learner.id)
        .post(own + '/submit')
        .send({
          revisionId: second.revisionId,
          expectedLockVersion: d.lockVersion,
          idempotencyKey: randomUUID(),
        })
        .expect(409);
      const rebased = (
        await agent(f.learner.id)
          .put(own)
          .send({
            revisionId: pub.revisionId,
            expectedLockVersion: d.lockVersion,
            text: 'Reviewed new instructions',
          })
          .expect(200)
      ).body;
      await agent(f.learner.id)
        .post(own + '/submit')
        .send({
          revisionId: pub.revisionId,
          expectedLockVersion: rebased.lockVersion,
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const oldRevision = draft.revisionId,
        edit1 = (
          await agent(f.teacher.id)
            .patch(base('sections/' + section.id + '/activities/' + a.id))
            .send({
              ...body,
              contentMarkdown: 'Changed source after submission',
              expectedLockVersion: a.lockVersion,
            })
            .expect(200)
        ).body;
      a = {
        ...a,
        ...(
          await agent(f.teacher.id)
            .post(base('activities/' + a.id + '/publish'))
            .send({ expectedLockVersion: edit1.lockVersion })
            .expect(201)
        ).body,
      };
      const row = (await agent(f.learner.id).get(ap('mine')).expect(200)).body.submission;
      expect(row.revisionId).toBe(oldRevision);
      await agent(f.learner.id)
        .post(ap('mine/submit'))
        .send({
          revisionId: a.revisionId,
          expectedLockVersion: row.lockVersion,
          idempotencyKey: randomUUID(),
        })
        .expect(409);
      evidence.push({
        name: 'source version change explicit rebase + immutable historical provenance',
        pass: true,
      });
    });
    it('different-key concurrent submits choose one winner; simultaneous publish/submit never mixes versions', async () => {
      const t = agent(f.teacher.id),
        s = agent(f.learner.id);
      let item = await newAssignment('Different idempotency keys race');
      item = {
        ...item,
        ...(
          await t
            .post(base('activities/' + item.id + '/publish'))
            .send({ expectedLockVersion: item.lockVersion })
            .expect(201)
        ).body,
      };
      const own = base('activities/' + item.id + '/assignment/mine'),
        saved = (
          await s
            .put(own)
            .send({
              revisionId: item.revisionId,
              expectedLockVersion: 0,
              text: 'One original response',
            })
            .expect(200)
        ).body;
      const rs = await Promise.all(
        [randomUUID(), randomUUID()].map((idempotencyKey) =>
          s.post(own + '/submit').send({
            revisionId: item.revisionId,
            expectedLockVersion: saved.lockVersion,
            idempotencyKey,
          }),
        ),
      );
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await dev.prisma.classAssignmentSubmission.count({
          where: { activityId: item.id, state: 'SUBMITTED' },
        }),
      ).toBe(1);
      const next = await newAssignment('Publish versus learner save race');
      const p1 = (
        await t
          .post(base('activities/' + next.id + '/publish'))
          .send({ expectedLockVersion: next.lockVersion })
          .expect(201)
      ).body;
      const mp = base('activities/' + next.id + '/assignment/mine'),
        d = (
          await s
            .put(mp)
            .send({
              revisionId: p1.revisionId,
              expectedLockVersion: 0,
              text: 'Answer to the first source',
            })
            .expect(200)
        ).body;
      const edit = { ...body, title: 'Next source', contentMarkdown: 'Revised source' };
      const race = await Promise.all([
        t
          .patch(base('sections/' + section.id + '/activities/' + next.id))
          .send({ ...edit, expectedLockVersion: p1.lockVersion }),
        s.post(mp + '/submit').send({
          revisionId: p1.revisionId,
          expectedLockVersion: d.lockVersion,
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(race[0].status).toBe(200);
      expect([201, 404]).toContain(race[1].status);
      const stored = await dev.prisma.classAssignmentSubmission.findUniqueOrThrow({
        where: { id: d.id },
      });
      expect(stored.revisionId).toBe(p1.revisionId);
      expect(stored.text).toBe('Answer to the first source');
      expect(stored.state).toBe(race[1].status === 201 ? 'SUBMITTED' : 'DRAFT');
      evidence.push({
        name: 'different keys race + teacher edit/student submit serialization',
        outcomes: rs.map((r) => r.status),
        editSubmit: race.map((r) => r.status),
        pass: true,
      });
    });
    it('empty submission rejected, file-only first submission accepted with security baseline and no deadline/score', async () => {
      const item = await newAssignment('File-only original submission'),
        pub = (
          await agent(f.teacher.id)
            .post(base('activities/' + item.id + '/publish'))
            .send({ expectedLockVersion: item.lockVersion })
            .expect(201)
        ).body;
      const p = base('activities/' + item.id + '/assignment/mine'),
        b = { revisionId: pub.revisionId, expectedLockVersion: 0, text: '' };
      const d = (await agent(f.learner.id).put(p).send(b).expect(200)).body;
      await agent(f.learner.id)
        .post(p + '/submit')
        .send({
          revisionId: pub.revisionId,
          expectedLockVersion: d.lockVersion,
          idempotencyKey: randomUUID(),
        })
        .expect(400);
      await agent(f.learner.id)
        .post(p + '/file')
        .field('revisionId', pub.revisionId)
        .field('expectedLockVersion', String(d.lockVersion))
        .field('text', '')
        .expect(400);
      const file = (
        await agent(f.learner.id)
          .post(p + '/file')
          .field('revisionId', pub.revisionId)
          .field('expectedLockVersion', String(d.lockVersion))
          .field('text', '')
          .attach('file', Buffer.from('Original file-only answer'), {
            filename: 'original.txt',
            contentType: 'text/plain',
          })
          .expect(201)
      ).body;
      const submitted = (
        await agent(f.learner.id)
          .post(p + '/submit')
          .send({
            revisionId: pub.revisionId,
            expectedLockVersion: file.lockVersion,
            idempotencyKey: randomUUID(),
          })
          .expect(201)
      ).body;
      expect(submitted.grade).toBeNull();
      expect(submitted.receipt.id).toBe(file.id);
      expect(submitted.text).toBe('');
      evidence.push({
        name: 'empty denied400; file-only submit with immutable receipt and null grade',
        pass: true,
      });
    });
    it('current V2 teacher expiry while queued denies submission review without reviving legacy instructorId', async () => {
      const c = await dev.prisma.classOffering.create({
        data: {
          courseId: f.published.id,
          instructorId: f.teacher.id,
          code: 'W03B-EXP-' + randomUUID().slice(0, 8),
          name: 'Finite teacher',
          status: 'OPEN',
        },
      });
      await dev.prisma.enrollment.create({
        data: { classOfferingId: c.id, learnerId: f.learner.id, status: 'ACTIVE' },
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
      const maker = agent(f.academic.id),
        checker = agent(f.planningApprover.id),
        start = Date.now() + 1700,
        end = start + 5000;
      let asn = (
        await maker
          .post('/api/v2/academic/classes/' + c.id + '/assignments')
          .send({
            instructorId: f.teacher.id,
            effectiveFrom: new Date(start).toISOString(),
            effectiveTo: new Date(end).toISOString(),
            reason: f.reason,
          })
          .expect(201)
      ).body;
      asn = (
        await maker
          .post('/api/v2/academic/assignments/' + asn.id + '/submit')
          .send({ expectedLockVersion: asn.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await checker
        .post('/api/v2/academic/assignments/' + asn.id + '/approve')
        .send({
          expectedLockVersion: asn.lockVersion,
          reason: f.reason,
          eligibilityConfirmed: true,
        })
        .expect(201);
      await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now() + 100)));
      const p = '/api/v2/class-lms/classes/' + c.id,
        t = agent(f.teacher.id),
        learner = agent(f.learner.id);
      const sec = (
        await t
          .post(p + '/sections')
          .send({ title: 'Finite Section', introduction: '' })
          .expect(201)
      ).body;
      await t
        .post(p + '/sections/' + sec.id + '/publish')
        .send({ expectedLockVersion: sec.lockVersion })
        .expect(201);
      const act = (
          await t
            .post(p + '/sections/' + sec.id + '/activities')
            .send(body)
            .expect(201)
        ).body,
        pub = (
          await t
            .post(p + '/activities/' + act.id + '/publish')
            .send({ expectedLockVersion: act.lockVersion })
            .expect(201)
        ).body;
      const own = p + '/activities/' + act.id + '/assignment/mine',
        d = (
          await learner
            .put(own)
            .send({
              revisionId: pub.revisionId,
              expectedLockVersion: 0,
              text: 'Finite original response',
            })
            .expect(200)
        ).body;
      await learner
        .post(own + '/submit')
        .send({
          revisionId: pub.revisionId,
          expectedLockVersion: d.lockVersion,
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const list = p + '/activities/' + act.id + '/assignment/submissions';
      await t.get(list).expect(200);
      const lock = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await lock.connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT pg_advisory_xact_lock(842030)');
        const queued = t.get(list).then((r) => r);
        await new Promise((r) => setTimeout(r, Math.max(0, end - Date.now() + 150)));
        await lock.query('COMMIT');
        expect((await queued).status).toBe(404);
      } finally {
        await lock.end();
      }
      await t.get(list).expect(404);
      await t.get(p + '/activities/' + act.id).expect(404);
      evidence.push({
        name: 'effective teacher expiry after lock wait denies review/detail; legacy fallback not restored',
        pass: true,
      });
    }, 20000);
    it('PostgreSQL guards reject direct tamper/foreign ownership and fake assignment completion; persistent receipt survives application restart', async () => {
      const c = new Client({ connectionString: process.env.WAVE01_PG_URL });
      await c.connect();
      try {
        const {
          rows: [session],
        } = await c.query(
          "SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 AND expire>now() LIMIT 1",
          [f.learner.id],
        );
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.learner.id, session.sid],
        );
        const {
          rows: [current],
        } = await c.query(
          'SELECT s.id FROM class_assignment_submissions s JOIN class_activities a ON a.id=s."activityId" AND a."publishedRevisionId"=s."revisionId" WHERE s.state=\'SUBMITTED\' AND s."learnerId"=$1 LIMIT 1',
          [f.learner.id],
        );
        await expect(
          c.query(
            'UPDATE class_assignment_submissions SET text=\'tampered\',"lockVersion"="lockVersion"+1 WHERE id=$1',
            [current.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.learner.id, session.sid],
        );
        await expect(
          c.query(
            'INSERT INTO class_assignment_submissions(id,"activityId","enrollmentId","revisionId","learnerId","classOfferingId",text,"updatedAt") SELECT gen_random_uuid(),$1,e.id,$2,e."learnerId",e."classOfferingId",\'foreign\',now() FROM enrollments e WHERE e."learnerId"=$3 LIMIT 1',
            [a.id, a.revisionId, f.otherLearner.id],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await c.query('ROLLBACK');
      } finally {
        await c.end();
      }
      await agent(f.learner.id)
        .post(base('activities/' + a.id + '/complete'))
        .send({})
        .expect(409);
      const guard = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await guard.connect();
      try {
        const {
          rows: [session],
        } = await guard.query(
          "SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 AND expire>now() LIMIT 1",
          [f.learner.id],
        );
        await guard.query('BEGIN');
        await guard.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.learner.id, session.sid],
        );
        await guard.query(
          'INSERT INTO class_activity_progress(id,"enrollmentId","revisionId") SELECT gen_random_uuid(),e.id,$1 FROM enrollments e WHERE e."learnerId"=$2 AND e."classOfferingId"=$3',
          [a.revisionId, f.learner.id, f.lmsClasses[0].id],
        );
        await expect(
          guard.query(
            'UPDATE class_activity_progress SET status=\'COMPLETED\',"completedAt"=now() WHERE "revisionId"=$1',
            [a.revisionId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await guard.query('ROLLBACK');
      } finally {
        await guard.end();
      }
      const receipt = draft.id;
      await dev.app.close();
      dev = await startWave01App();
      const fresh = request.agent(dev.app.getHttpServer());
      await fresh
        .post('/api/auth/login')
        .send({ email: f.learner.email, password: f.password })
        .expect(200);
      expect((await fresh.get(ap('mine')).expect(200)).body.submission.receipt.id).toBe(receipt);
      // Re-login all actors on the restarted application for remaining checks.
      for (const u of f.users) {
        const r = request.agent(dev.app.getHttpServer());
        await r.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
        f.agents.set(u.id, r);
      }
      evidence.push({
        name: 'SQL tamper/owner denial, no fake progress, app restart receipt',
        pass: true,
      });
    });
    it('PENDING enrollment, hidden/logout denied; upload storage failure retains saved draft', async () => {
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.learner.id },
        data: { status: 'PENDING_PAYMENT' },
      });
      await agent(f.learner.id).get(ap('mine')).expect(404);
      await agent(f.learner.id)
        .get(ap('submissions/' + draft.id + '/file'))
        .expect(404);
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.learner.id },
        data: { status: 'ACTIVE' },
      });
      const storage = dev.app.select(ClassLmsModule).get(LearningResourceStorage, { strict: true }),
        fail = jest.spyOn(storage, 'put').mockRejectedValueOnce(new Error('Synthetic disk full'));
      const fresh = await newAssignment('Upload failure draft');
      const pub = (
        await agent(f.teacher.id)
          .post(base('activities/' + fresh.id + '/publish'))
          .send({ expectedLockVersion: fresh.lockVersion })
          .expect(201)
      ).body;
      const p = base('activities/' + fresh.id + '/assignment/mine');
      const d = (
        await agent(f.learner.id)
          .put(p)
          .send({ revisionId: pub.revisionId, expectedLockVersion: 0, text: 'Keep my draft' })
          .expect(200)
      ).body;
      await agent(f.learner.id)
        .post(p + '/file')
        .field('revisionId', pub.revisionId)
        .field('expectedLockVersion', String(d.lockVersion))
        .field('text', 'New unsaved')
        .attach('file', Buffer.from('x'), { filename: 'x.txt', contentType: 'text/plain' })
        .expect(500);
      fail.mockRestore();
      expect((await agent(f.learner.id).get(p)).body.submission.text).toBe('Keep my draft');
      await agent(f.teacher.id)
        .post(base('activities/' + fresh.id + '/hide'))
        .send({ expectedLockVersion: pub.lockVersion })
        .expect(201);
      await agent(f.learner.id).get(p).expect(404);
      await agent(f.learner.id).post('/api/auth/logout').send({});
      await agent(f.learner.id).get(ap('mine')).expect(401);
      evidence.push({
        name: 'enrollment loss/hidden/logout/upload error retains draft',
        pass: true,
      });
    });
  },
);
