import * as request from 'supertest';
import { Client } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { LearningResourceStorage } from '../src/modules/learning/learning-resource.storage';
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03A class-local LMS19 / actual PostgreSQL',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      section: { id: string; lockVersion: number },
      lesson: { id: string; lockVersion: number; revisionId?: string },
      file: { id: string; lockVersion: number },
      eventId: string;
    const evidence: object[] = [];
    const agent = (id: string) => f.agents.get(id)!,
      path = (p = '') => '/api/v2/class-lms/classes/' + f.lmsClasses[0].id + (p ? '/' + p : '');
    const body = {
      type: 'LESSON',
      title: 'Class-only lesson',
      introduction: 'Real synthetic lesson practice',
      contentMarkdown: '# English practice\nRead the passage and choose your own examples.',
    };
    beforeAll(async () => {
      process.env.LEARNING_RESOURCE_STORAGE_ROOT = resolve(
        '.local-storage/v2-wave03a/test-private-files',
      );
      dev = await startWave01App();
      f = await seedWave03A(dev);
    }, 60000);
    afterAll(async () => {
      const root = process.env.WAVE03A_EVIDENCE_ROOT ?? '.local-storage/v2-wave03a';
      await mkdir(root, { recursive: true });
      await writeFile(resolve(root, 'http-evidence.json'), JSON.stringify(evidence, null, 2));
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
    it('current assigned teacher creates persisted section; foreign teacher/all staff roles/learner writes denied', async () => {
      section = (
        await agent(f.teacher.id)
          .post(path('sections'))
          .send({ title: 'Week1 · Class English', introduction: 'Practice only in this class' })
          .expect(201)
      ).body;
      for (const u of f.users.filter((u) => u.id !== f.teacher.id)) {
        const r = await agent(u.id)
          .post(path('sections'))
          .send({ title: 'Illegal section', introduction: '' });
        expect(r.status).toBe(u.role === 'INSTRUCTOR' ? 404 : 403);
      }
      await request(dev.app.getHttpServer()).get(path()).expect(401);
      await agent(f.teacher.id)
        .get('/api/instructor/courses/' + f.published.id + '/modules')
        .expect(403);
      await agent(f.teacher.id).post('/api/admin/courses').send({}).expect(403);
      await agent(f.learner.id).get(path()).expect(200);
      await agent(f.otherLearner.id).get(path()).expect(404);
      await agent(f.contenders[0].id).get(path()).expect(404);
      evidence.push({
        ac: 'AC02/03/04',
        currentTeacherCreate: 201,
        foreignTeacher: 404,
        otherRoles: 403,
        activeLearner: 200,
        pendingAndForeignLearner: 404,
        courseWideEditor: 403,
      });
    });
    it('typed real lesson draft/publish/open/complete; no draft leak or automatic/cross-class progress', async () => {
      lesson = (
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send(body)
          .expect(201)
      ).body;
      let view = (await agent(f.learner.id).get(path()).expect(200)).body;
      expect(view.sections).toEqual([]);
      // CF01: metadata has its own explicit publication; no draft Section leakage.
      await agent(f.teacher.id)
        .post(path('sections/' + section.id + '/publish'))
        .send({ expectedLockVersion: section.lockVersion })
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/open'))
        .expect(404);
      const pub = await agent(f.teacher.id)
        .post(path('activities/' + lesson.id + '/publish'))
        .send({ expectedLockVersion: lesson.lockVersion })
        .expect(201);
      lesson = { ...lesson, ...pub.body };
      view = (await agent(f.learner.id).get(path()).expect(200)).body;
      expect(view.sections[0].activities[0]).toMatchObject({
        title: body.title,
        progress: 'NOT_STARTED',
      });
      expect(
        (
          await agent(f.learner.id)
            .get(path('activities/' + lesson.id))
            .expect(200)
        ).body.contentMarkdown,
      ).toBe(body.contentMarkdown);
      expect(await dev.prisma.classActivityProgress.count()).toBe(0);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/complete'))
        .expect(409);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/open'))
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/complete'))
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/complete'))
        .expect(201);
      expect(await dev.prisma.classActivityProgress.count()).toBe(1);
      expect(await dev.prisma.lessonProgress.count()).toBe(0);
      const other = await agent(f.learner.id)
        .get('/api/v2/class-lms/classes/' + f.lmsClasses[1].id)
        .expect(200);
      expect(other.body.sections).toEqual([]);
      expect(JSON.stringify(view)).not.toMatch(/storageKey|passwordHash|publishedById/);
    });
    it('standard template snapshot survives later template edits; new publication preserves old revision/progress', async () => {
      const source = f.standardLesson;
      let a = (
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send({
            ...body,
            title: 'Imported lesson',
            sourceLessonId: source.id,
            expectedSourceUpdatedAt: source.updatedAt.toISOString(),
          })
          .expect(201)
      ).body;
      const p = (
        await agent(f.teacher.id)
          .post(path('activities/' + a.id + '/publish'))
          .send({ expectedLockVersion: a.lockVersion })
          .expect(201)
      ).body;
      await dev.prisma.lesson.update({
        where: { id: source.id },
        data: { contentMarkdown: 'Later shared standard edit' },
      });
      let v = (await agent(f.learner.id).get(path())).body;
      expect(
        (
          await agent(f.learner.id)
            .get(path('activities/' + a.id))
            .expect(200)
        ).body.contentMarkdown,
      ).toBe('Original immutable lesson snapshot');
      await agent(f.learner.id)
        .post(path('activities/' + a.id + '/open'))
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + a.id + '/complete'))
        .expect(201);
      a = (
        await agent(f.teacher.id)
          .patch(path('sections/' + section.id + '/activities/' + a.id))
          .send({
            ...body,
            title: 'New class publication',
            contentMarkdown: 'New local snapshot',
            expectedLockVersion: p.lockVersion,
          })
          .expect(200)
      ).body;
      expect(
        (await agent(f.learner.id).get(path())).body.sections[0].activities.some(
          (r: { id: string }) => r.id === a.id,
        ),
      ).toBe(false);
      const next = (
        await agent(f.teacher.id)
          .post(path('activities/' + a.id + '/publish'))
          .send({ expectedLockVersion: a.lockVersion })
          .expect(201)
      ).body;
      expect(next.revisionId).not.toBe(p.revisionId);
      expect(
        (await dev.prisma.classActivityRevision.findUniqueOrThrow({ where: { id: p.revisionId } }))
          .contentMarkdown,
      ).toBe('Original immutable lesson snapshot');
      v = (await agent(f.learner.id).get(path())).body;
      expect(v.sections[0].activities.find((r: { id: string }) => r.id === a.id).progress).toBe(
        'NOT_STARTED',
      );
      await agent(f.teacher.id)
        .post(path('sections/' + section.id + '/activities'))
        .send({
          ...body,
          sourceLessonId: f.foreignLesson.id,
          expectedSourceUpdatedAt: f.foreignLesson.updatedAt.toISOString(),
        })
        .expect(404);
      await agent(f.teacher.id)
        .post(path('sections/' + section.id + '/activities'))
        .send({
          ...body,
          sourceLessonId: source.id,
          expectedSourceUpdatedAt: source.updatedAt.toISOString(),
        })
        .expect(409);
      evidence.push({
        ac: 'AC03/04',
        templateEditDoesNotChangePublication: true,
        oldProgressRetained: true,
        newRevisionNotAutomaticallyComplete: true,
        foreignSource: 404,
        staleSource: 409,
      });
    });
    it('private real resource upload/download requires current class access; unsafe URLs/files/forged keys rejected', async () => {
      file = (
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send({
            type: 'RESOURCE',
            title: 'Private document',
            introduction: 'Class document',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
      const bytes = Buffer.from('Synthetic W03 private resource\nNo real question content.\n');
      const attach = (
        await agent(f.teacher.id)
          .post(path('activities/' + file.id + '/file'))
          .field('expectedLockVersion', file.lockVersion)
          .attach('file', bytes, { filename: 'practice.txt', contentType: 'text/plain' })
          .expect(201)
      ).body;
      file.lockVersion = attach.lockVersion;
      expect(attach.file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(JSON.stringify(attach)).not.toContain('storageKey');
      await agent(f.learner.id)
        .get(path('activities/' + file.id + '/file'))
        .expect(404);
      const pub = await agent(f.teacher.id)
        .post(path('activities/' + file.id + '/publish'))
        .send({ expectedLockVersion: file.lockVersion })
        .expect(201);
      file.lockVersion = pub.body.lockVersion;
      const d = await agent(f.learner.id)
        .get(path('activities/' + file.id + '/file'))
        .expect(200);
      expect(d.text).toBe(bytes.toString());
      expect(d.headers['cache-control']).toBe('private, no-store');
      expect(d.headers['x-content-type-options']).toBe('nosniff');
      for (const id of [f.otherLearner.id, f.otherTeacher.id, f.contenders[1].id])
        await agent(id)
          .get(path('activities/' + file.id + '/file'))
          .expect(404);
      await request(dev.app.getHttpServer())
        .get(path('activities/' + file.id + '/file'))
        .expect(401);
      await agent(f.teacher.id)
        .post(path('activities/' + file.id + '/file'))
        .field('expectedLockVersion', file.lockVersion)
        .attach('file', Buffer.from('<script>x</script>'), {
          filename: 'bad.html',
          contentType: 'text/html',
        })
        .expect(400);
      for (const resourceUrl of [
        'javascript:alert(1)',
        'data:text/html,unsafe',
        'https://user:pass@example.com',
        'https://127.0.0.1/private',
      ])
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send({
            type: 'RESOURCE',
            title: 'Unsafe link',
            introduction: '',
            contentMarkdown: '',
            resourceUrl,
          })
          .expect(400);
      await agent(f.teacher.id)
        .post(path('sections/' + section.id + '/activities'))
        .send({ ...body, storageKey: '../../private.wav' })
        .expect(400);
      evidence.push({
        ac: 'AC07',
        realBytesHash: attach.file.sha256,
        download200: true,
        privateNoStore: true,
        noStorageKeyProjection: true,
        foreignAndDraftDenied: true,
        unsafeInputs400: true,
      });
    });
    it('imported standard document owns independent immutable bytes after original template file replacement', async () => {
      const storage = dev.app.get(LearningResourceStorage),
        bytes = Buffer.from('Synthetic source document snapshot'),
        original = await storage.put({
          buffer: bytes,
          size: bytes.length,
          mimetype: 'text/plain',
          originalname: 'source.txt',
        });
      const source = await dev.prisma.learningResource.create({
        data: {
          lessonId: f.standardLesson.id,
          title: 'Standard private file',
          type: 'DOCUMENT',
          storageKey: original.key,
          originalFileName: original.originalFileName,
          mimeType: original.mimeType,
          orderIndex: 50,
        },
      });
      const a = (
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send({
            type: 'RESOURCE',
            title: 'Copied source resource',
            introduction: 'Snapshot import',
            contentMarkdown: '',
            sourceResourceId: source.id,
            expectedSourceUpdatedAt: source.updatedAt.toISOString(),
          })
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(path('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(201);
      const revision = await dev.prisma.classActivityRevision.findFirstOrThrow({
        where: { activityId: a.id },
      });
      expect(revision.storageKey).not.toBe(original.key);
      expect(revision.fileSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      const changed = Buffer.from('Later shared source bytes'),
        next = await storage.put({
          buffer: changed,
          size: changed.length,
          mimetype: 'text/plain',
          originalname: 'source-new.txt',
        });
      await dev.prisma.learningResource.update({
        where: { id: source.id },
        data: { storageKey: next.key },
      });
      await storage.delete(original.key);
      const delivered = await agent(f.learner.id)
        .get(path('activities/' + a.id + '/file'))
        .expect(200);
      expect(delivered.text).toBe(bytes.toString());
      evidence.push({
        ac: 'AC03/07',
        sharedFileCopiedToDifferentPrivateKey: true,
        oldSourceDeletedButPublishedBytesMatch: true,
      });
    });
    it('availability/hidden items excluded; pending enrollment becomes dropped and still denied', async () => {
      const a = (
        await agent(f.teacher.id)
          .post(path('sections/' + section.id + '/activities'))
          .send({
            ...body,
            title: 'Not available yet',
            availableFrom: new Date(Date.now() + 86400000).toISOString(),
          })
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(path('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + a.id + '/open'))
        .expect(404);
      expect(JSON.stringify((await agent(f.learner.id).get(path())).body)).not.toContain(
        'Not available yet',
      );
      await agent(f.teacher.id)
        .post(path('activities/' + lesson.id + '/hide'))
        .send({ expectedLockVersion: lesson.lockVersion })
        .expect(201);
      await agent(f.learner.id)
        .post(path('activities/' + lesson.id + '/complete'))
        .expect(404);
      await dev.prisma.enrollment.updateMany({
        where: { learnerId: f.otherLearner.id, classOfferingId: f.lmsClasses[0].id },
        data: { status: 'DROPPED' },
      });
      await agent(f.otherLearner.id).get(path()).expect(404);
    });
    it('two real HTTP edits and reorders race: one success, one409, no cross-class move or duplicate permutation', async () => {
      const rows = (await agent(f.teacher.id).get(path())).body.sections[0].activities,
        chosen = rows[1];
      const edits = await Promise.all(
        ['First', 'Second'].map((title) =>
          agent(f.teacher.id)
            .patch(path('sections/' + section.id + '/activities/' + chosen.id))
            .send({ ...body, title, expectedLockVersion: chosen.lockVersion }),
        ),
      );
      expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
      const current = (await agent(f.teacher.id).get(path())).body.sections[0].activities;
      const items = current
        .map((r: { id: string; lockVersion: number }) => ({
          id: r.id,
          expectedLockVersion: r.lockVersion,
        }))
        .reverse();
      const race = await Promise.all(
        [0, 1].map(() =>
          agent(f.teacher.id)
            .post(path('sections/' + section.id + '/reorder'))
            .send({ items }),
        ),
      );
      expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
      await agent(f.teacher.id)
        .post(path('sections/' + section.id + '/reorder'))
        .send({ items: [items[0], items[0]] })
        .expect(400);
      await agent(f.otherTeacher.id)
        .patch(
          '/api/v2/class-lms/classes/' +
            f.lmsClasses[1].id +
            '/sections/' +
            section.id +
            '/activities/' +
            chosen.id,
        )
        .send({ ...body, expectedLockVersion: chosen.lockVersion })
        .expect(404);
      evidence.push({
        ac: 'AC08',
        editStatuses: edits.map((r) => r.status),
        reorderStatuses: race.map((r) => r.status),
        duplicateOrder: 400,
        foreignOwner: 404,
      });
    });
    it('SQL guards reject unauthenticated writes, mutable snapshots and cross-class/learner progress', async () => {
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      try {
        await expect(
          c.query('UPDATE class_sections SET title=$1,"lockVersion"="lockVersion"+1 WHERE id=$2', [
            'SQL bypass',
            section.id,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          c.query('UPDATE class_activity_revisions SET title=$1 WHERE "activityId"=$2', [
            'Rewrite historical publication',
            lesson.id,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
        const enrollment = await dev.prisma.enrollment.findFirstOrThrow({
          where: { learnerId: f.learner.id, classOfferingId: f.lmsClasses[1].id },
        });
        const {
          rows: [session],
        } = await c.query("SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 LIMIT 1", [
          f.learner.id,
        ]);
        const validPublication = await dev.prisma.classActivity.findUniqueOrThrow({
          where: { id: file.id },
        });
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(842030)');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.learner.id, session.sid],
        );
        await expect(
          c.query(
            'INSERT INTO class_activity_progress(id,"enrollmentId","revisionId",status)VALUES($1,$2,$3,\'IN_PROGRESS\')',
            [randomUUID(), enrollment.id, validPublication.publishedRevisionId],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await c.query('ROLLBACK');
      } finally {
        await c.end();
      }
    });
    it('approved TeachingSession month projection has correct school year boundary, filter and safe detail', async () => {
      const maker = agent(f.academic.id),
        checker = agent(f.planningApprover.id),
        assignment = await dev.prisma.classInstructorAssignment.findFirstOrThrow({
          where: { classOfferingId: f.lmsClasses[0].id, state: 'PUBLISHED' },
        });
      let row = (
        await maker
          .post('/api/v2/academic/classes/' + f.lmsClasses[0].id + '/sessions')
          .send({
            startLocal: '2027-01-01T00:15',
            endLocal: '2027-01-01T01:15',
            timezone: 'Asia/Ho_Chi_Minh',
            modality: 'ONLINE',
            assignmentId: assignment.id,
            requiredCapabilities: [],
            reason: f.reason,
          })
          .expect(201)
      ).body;
      row = (
        await maker
          .post('/api/v2/academic/sessions/' + row.id + '/submit')
          .send({ expectedLockVersion: row.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await checker
        .post('/api/v2/academic/sessions/' + row.id + '/approve')
        .send({ expectedLockVersion: row.lockVersion, reason: f.reason })
        .expect(201);
      eventId = row.id;
      await maker
        .post('/api/v2/academic/classes/' + f.lmsClasses[0].id + '/sessions')
        .send({
          startLocal: '2027-01-02T18:00',
          endLocal: '2027-01-02T19:00',
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'ONLINE',
          assignmentId: assignment.id,
          requiredCapabilities: [],
          reason: f.reason,
        })
        .expect(201);
      const jan = (await agent(f.learner.id).get('/api/v2/my/calendar?month=2027-01').expect(200))
        .body;
      expect(jan.data).toHaveLength(1);
      expect(jan.data[0]).toMatchObject({
        id: eventId,
        source: 'TEACHING_SESSION',
        startsAt: '2026-12-31T17:15:00.000Z',
      });
      expect(JSON.stringify(jan)).not.toMatch(
        /meetingUrl|sourceTemplate|proposedBy|reason|storageKey/,
      );
      expect(
        (await agent(f.learner.id).get('/api/v2/my/calendar?month=2026-12')).body.data,
      ).toHaveLength(0);
      expect(
        (
          await agent(f.learner.id).get(
            '/api/v2/my/calendar?month=2027-01&classId=' + f.lmsClasses[1].id,
          )
        ).body.data,
      ).toHaveLength(0);
      await agent(f.learner.id)
        .get('/api/v2/my/events/' + eventId)
        .expect(200);
      await agent(f.otherLearner.id)
        .get('/api/v2/my/events/' + eventId)
        .expect(404);
      await agent(f.otherTeacher.id)
        .get('/api/v2/my/events/' + eventId)
        .expect(404);
      for (const role of [f.admin, f.counselor])
        expect((await agent(role.id).get('/api/v2/my/calendar?month=2027-01')).body.data).toEqual(
          [],
        );
      await agent(f.learner.id).get('/api/v2/my/calendar?month=2027-13').expect(400);
      evidence.push({
        ac: 'AC06',
        schoolBoundary: '2027-01-01T00:15+07=2026-12-31T17:15Z',
        onlyPublished: true,
        foreignAndPendingEvent404: true,
        draftsNotProjected: true,
        privateFieldsExcluded: true,
      });
    });
    it('replacement changes class-local teacher rights without granting shared Course editor or changing published content', async () => {
      const current = await dev.prisma.classInstructorAssignment.findFirstOrThrow({
          where: { classOfferingId: f.lmsClasses[0].id, state: 'PUBLISHED' },
        }),
        from = Date.now() + 1700;
      let a = (
        await agent(f.academic.id)
          .post('/api/v2/academic/classes/' + f.lmsClasses[0].id + '/assignments')
          .send({
            instructorId: f.otherTeacher.id,
            replacesId: current.id,
            effectiveFrom: new Date(from).toISOString(),
            effectiveTo: new Date(Date.now() + 100 * 86400000).toISOString(),
            reason: f.reason,
          })
          .expect(201)
      ).body;
      a = (
        await agent(f.academic.id)
          .post('/api/v2/academic/assignments/' + a.id + '/submit')
          .send({ expectedLockVersion: a.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await agent(f.planningApprover.id)
        .post('/api/v2/academic/assignments/' + a.id + '/approve')
        .send({ expectedLockVersion: a.lockVersion, reason: f.reason, eligibilityConfirmed: true })
        .expect(201);
      await agent(f.otherTeacher.id).get(path()).expect(404);
      await new Promise((r) => setTimeout(r, Math.max(0, from - Date.now() + 100)));
      await agent(f.teacher.id).get(path()).expect(404);
      await agent(f.teacher.id)
        .get(path('activities/' + file.id + '/file'))
        .expect(404);
      await agent(f.otherTeacher.id)
        .post(path('sections'))
        .send({ title: 'Replacement teacher section', introduction: 'Class-local only' })
        .expect(201);
      await agent(f.otherTeacher.id)
        .get('/api/instructor/courses/' + f.published.id + '/modules')
        .expect(403);
      const stored = await dev.prisma.classOffering.findUniqueOrThrow({
        where: { id: f.lmsClasses[0].id },
      });
      expect(stored.instructorId).toBe(f.teacher.id);
      evidence.push({
        ac: 'AC02/08',
        replacementCurrentClassCreate: 201,
        oldTeacherAndFileDenied404: true,
        legacyFKUnchanged: true,
        courseEditorStill403: true,
      });
    });
    it('manager scope revocation removes calendar detail; logout revokes class-local mutation session', async () => {
      await agent(f.planningApprover.id)
        .get('/api/v2/my/events/' + eventId)
        .expect(200);
      await dev.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        await tx.permissionGrant.updateMany({
          where: {
            userId: f.planningApprover.id,
            scopeId: f.lmsClasses[0].id,
            capability: 'academic.schedule.approve',
          },
          data: {
            revokedAt: new Date(),
            revokedBy: f.approver.id,
            revokeReason: 'Synthetic grant revocation test',
          },
        });
      });
      await agent(f.planningApprover.id)
        .get('/api/v2/my/events/' + eventId)
        .expect(404);
      const separate = request.agent(dev.app.getHttpServer());
      await separate
        .post('/api/auth/login')
        .send({ email: f.otherTeacher.email, password: f.password })
        .expect(200);
      await separate.post('/api/auth/logout').expect(204);
      await separate
        .post(path('sections'))
        .send({ title: 'Expired session', introduction: '' })
        .expect(401);
      evidence.push({ ac: 'AC08', grantRevocationEvent404: true, logoutMutation401: true });
    });
    it('effective assignment expiry while request waits on global lock denies mutation, no legacy restoration', async () => {
      const maker = agent(f.academic.id),
        checker = agent(f.planningApprover.id),
        c = await dev.prisma.classOffering.create({
          data: {
            courseId: f.published.id,
            instructorId: f.teacher.id,
            code: 'W03-TEMP-' + randomUUID().slice(0, 8),
            name: 'Synthetic finite reservation',
            status: 'OPEN',
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
      const start = Date.now() + 1700,
        end = start + 2200;
      let a = (
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
      a = (
        await maker
          .post('/api/v2/academic/assignments/' + a.id + '/submit')
          .send({ expectedLockVersion: a.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await checker
        .post('/api/v2/academic/assignments/' + a.id + '/approve')
        .send({ expectedLockVersion: a.lockVersion, reason: f.reason, eligibilityConfirmed: true })
        .expect(201);
      const url = '/api/v2/class-lms/classes/' + c.id;
      await agent(f.teacher.id).get(url).expect(404);
      await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now() + 100)));
      await agent(f.teacher.id).get(url).expect(200);
      const lock = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await lock.connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT pg_advisory_xact_lock(842030)');
        const pending = agent(f.teacher.id)
          .post(url + '/sections')
          .send({ title: 'Must not survive expiry', introduction: '' })
          .then((r) => r);
        await new Promise((r) => setTimeout(r, Math.max(0, end - Date.now() + 100)));
        await lock.query('COMMIT');
        expect((await pending).status).toBe(404);
      } finally {
        await lock.end();
      }
      await agent(f.teacher.id).get(url).expect(404);
      expect(await dev.prisma.classSection.count({ where: { classOfferingId: c.id } })).toBe(0);
      evidence.push({
        ac: 'AC08',
        future404: true,
        current200: true,
        expiredWhileQueuedMutation404: true,
        noLegacyFallback: true,
      });
    }, 15000);
  },
);
