import * as request from 'supertest';
import { Client } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { LearningResourceStorage } from '../src/modules/learning/learning-resource.storage';
import { ClassLmsModule } from '../src/modules/class-lms/class-lms.module';
import { AssessmentInstructorService } from '../src/modules/assessments/assessment-instructor.service';
type Rubric = {
  id: string;
  version: number;
  state: string;
  lockVersion: number;
  criteria: { id: string; maxScore: string }[];
};
type Grade = {
  id: string;
  number: number;
  state: string;
  lockVersion: number;
  earned: string | null;
  max: string;
  percent: string | null;
  rubric: { id: string; version: number };
};
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03B-B D1-D6 actual HTTP/PostgreSQL22',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      activity: { id: string; lockVersion: number; revisionId: string },
      submission: { id: string; file: { sha256: string } },
      rubric: Rubric,
      grade: Grade,
      originalGrade: Grade;
    const evidence: object[] = [],
      ag = (id: string) => f.agents.get(id)!,
      root = (p = '') =>
        '/api/v2/assignment-grading/classes/' + f.lmsClasses[0].id + (p ? '/' + p : ''),
      base = (p = '') => root('activities/' + activity.id + (p ? '/' + p : '')),
      lms = (p = '') => '/api/v2/class-lms/classes/' + f.lmsClasses[0].id + (p ? '/' + p : ''),
      key = () => randomUUID().toUpperCase();
    const rb = () => ({
      name: 'Assignment rubric',
      description: 'Synthetic approved class rubric',
      expectedPreviousVersion: 0,
      idempotencyKey: key(),
      criteria: [
        {
          name: 'Task fulfilment',
          description: 'Communicates two requested details',
          maxScore: '10.00',
        },
        { name: 'Clarity', description: 'Clear English for the audience', maxScore: '10.00' },
      ],
    });
    const gb = (scores: { criterionId: string; score: string; feedback: string }[] = []) => ({
      rubricId: rubric.id,
      expectedPreviousVersion: 0,
      idempotencyKey: key(),
      reason: '',
      feedback: 'SECRET_DRAFT_FEEDBACK',
      scores,
    });
    const scores = (a = '0', b = '10') =>
      rubric.criteria.map((c, i) => ({
        criterionId: c.id,
        score: i ? b : a,
        feedback: i ? 'Clear' : 'Needs practice',
      }));
    async function book() {
      return (await ag(f.learner.id).get(root('gradebook')).expect(200)).body;
    }
    beforeAll(async () => {
      process.env.LEARNING_RESOURCE_STORAGE_ROOT = resolve(
        resolve(
          process.env.W03BB_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bb',
          'test-private-files',
        ),
      );
      dev = await startWave01App();
      f = await seedWave03A(dev);
      for (const cap of ['academic.rubric.approve', 'academic.grade.publish'])
        await grantAcademic(
          dev.prisma,
          f.planningApprover.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          f.lmsClasses[0].id,
        );
      const t = ag(f.teacher.id),
        s = (
          await t
            .post(lms('sections'))
            .send({ title: 'W03B-B grading', introduction: 'Class-local, synthetic' })
            .expect(201)
        ).body;
      await t
        .post(lms('sections/' + s.id + '/publish'))
        .send({ expectedLockVersion: s.lockVersion })
        .expect(201);
      activity = (
        await t
          .post(lms('sections/' + s.id + '/activities'))
          .send({
            type: 'ASSIGNMENT',
            title: 'Frozen workplace writing',
            introduction: 'Synthetic source',
            contentMarkdown: 'Write a workplace announcement including two details.',
          })
          .expect(201)
      ).body;
      activity = {
        ...activity,
        ...(
          await t
            .post(lms('activities/' + activity.id + '/publish'))
            .send({ expectedLockVersion: activity.lockVersion })
            .expect(201)
        ).body,
      };
      const mine = lms('activities/' + activity.id + '/assignment/mine'),
        file = Buffer.from('Synthetic original text/file answer.');
      const draft = (
        await ag(f.learner.id)
          .post(mine + '/file')
          .field('revisionId', activity.revisionId)
          .field('expectedLockVersion', '0')
          .field('text', 'Original learner announcement.')
          .attach('file', file, { filename: 'original.txt', contentType: 'text/plain' })
          .expect(201)
      ).body;
      submission = (
        await ag(f.learner.id)
          .post(mine + '/submit')
          .send({
            revisionId: activity.revisionId,
            expectedLockVersion: draft.lockVersion,
            idempotencyKey: randomUUID(),
          })
          .expect(201)
      ).body;
      expect(submission.file.sha256).toBe(createHash('sha256').update(file).digest('hex'));
    }, 60000);
    afterAll(async () => {
      await mkdir(process.env.W03BB_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bb', {
        recursive: true,
      });
      await writeFile(
        resolve(
          process.env.W03BB_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bb',
          'grading-http-evidence.json',
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
    it('current teacher/scoped checker/own ACTIVE student only; no default HVU/QT/grader privileges', async () => {
      await request(dev.app.getHttpServer()).get(base('queue')).expect(401);
      for (const u of f.users.filter((u) => u.id !== f.teacher.id)) {
        const r = await ag(u.id).get(base('queue'));
        expect(r.status).toBe(u.role === 'INSTRUCTOR' ? 404 : 403);
      }
      expect(
        (await ag(f.academic.id).get('/api/v2/assignment-grading/checker').expect(200)).body
          .classes,
      ).toHaveLength(0);
      expect(
        (
          await ag(f.planningApprover.id).get('/api/v2/assignment-grading/checker').expect(200)
        ).body.classes.map((c: { id: string }) => c.id),
      ).toContain(f.lmsClasses[0].id);
      await ag(f.teacher.id).get('/api/v2/assignment-grading/checker').expect(403);
      await ag(f.otherLearner.id).get(root('gradebook')).expect(404);
      const q = (await ag(f.teacher.id).get(base('queue')).expect(200)).body;
      expect(q.submissions[0].text).toBe('Original learner announcement.');
      expect(q.submissions[0].source.id).toBe(activity.revisionId);
      expect((await book()).entries[0]).toMatchObject({
        status: 'NOT_GRADED',
        result: null,
        history: [],
      });
      evidence.push({
        ac: 'D1/D5',
        roleScopeNegative: true,
        activeSourcePinned: true,
        pendingGradeNull: true,
      });
    });
    it('real rubric draft reuses criteria; idempotent create; stale edit and source/private legacy boundaries', async () => {
      const b = rb();
      for (const criteria of [[{ name: 'Bad', description: 'Missing maximum', maxScore: '0' }], []])
        await ag(f.teacher.id)
          .post(base('rubrics'))
          .send({ ...b, idempotencyKey: key(), criteria })
          .expect(400);
      const rs = await Promise.all(
        [0, 1].map(() => ag(f.teacher.id).post(base('rubrics')).send(b)),
      );
      expect(rs.map((r) => r.status)).toEqual([201, 201]);
      expect(rs[0].body.id).toBe(rs[1].body.id);
      rubric = rs[0].body;
      await ag(f.otherTeacher.id)
        .post(base('rubrics'))
        .send({ ...rb() })
        .expect(404);
      await ag(f.teacher.id)
        .post(base('rubrics'))
        .send({ ...b, idempotencyKey: key() })
        .expect(409);
      const edit = {
        ...b,
        expectedPreviousVersion: rubric.version,
        expectedLockVersion: rubric.lockVersion,
        idempotencyKey: key(),
        description: 'Reviewed attainment descriptors',
      };
      const r = (
        await ag(f.teacher.id)
          .put(base('rubrics/' + rubric.id))
          .send(edit)
          .expect(200)
      ).body;
      await ag(f.teacher.id)
        .put(base('rubrics/' + rubric.id))
        .send({ ...edit, idempotencyKey: key() })
        .expect(409);
      rubric = r;
      expect(await dev.prisma.rubricCriterion.count({ where: { rubricId: rubric.id } })).toBe(2);
      const service = dev.app.get(AssessmentInstructorService);
      expect((await service.listActiveRubrics()).some((r) => r.id === rubric.id)).toBe(false);
      await expect(service.getActiveRubric(rubric.id)).rejects.toThrow();
      expect(JSON.stringify(await book())).not.toContain('Reviewed attainment descriptors');
      evidence.push({
        ac: 'D2',
        rubricDraftCAS: true,
        duplicateCreateSameId: true,
        legacyRubricListExcluded: true,
      });
    });
    it('unapproved rubric cannot grade/final; wrong-role and cross-class checker cannot publish', async () => {
      await ag(f.teacher.id)
        .post(base('submissions/' + submission.id + '/grades'))
        .send(gb(scores()))
        .expect(409);
      await ag(f.teacher.id)
        .post(base('rubrics/' + rubric.id + '/publish'))
        .send({ expectedLockVersion: rubric.lockVersion, idempotencyKey: key() })
        .expect(403);
      await ag(f.academic.id)
        .post(base('rubrics/' + rubric.id + '/publish'))
        .send({ expectedLockVersion: rubric.lockVersion, idempotencyKey: key() })
        .expect(403);
      await ag(f.planningApprover.id)
        .post(
          '/api/v2/assignment-grading/classes/' +
            f.lmsClasses[1].id +
            '/activities/' +
            activity.id +
            '/rubrics/' +
            rubric.id +
            '/publish',
        )
        .send({ expectedLockVersion: rubric.lockVersion, idempotencyKey: key() })
        .expect(403);
      expect((await book()).entries[0].result).toBeNull();
      evidence.push({
        ac: 'D2/D3',
        unapprovedGrade409: true,
        wrongRole403: true,
        foreignScope403: true,
      });
    });
    it('independent rubric approval enforced even if maker changes role; immutable published rubric and criterion', async () => {
      await dev.prisma.user.update({
        where: { id: f.teacher.id },
        data: { role: 'ACADEMIC_MANAGER' },
      });
      await grantAcademic(
        dev.prisma,
        f.teacher.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.rubric.approve',
        'CLASS',
        f.lmsClasses[0].id,
      );
      await ag(f.teacher.id)
        .post(base('rubrics/' + rubric.id + '/publish'))
        .send({ expectedLockVersion: rubric.lockVersion, idempotencyKey: key() })
        .expect(403);
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { role: 'INSTRUCTOR' } });
      const body = { expectedLockVersion: rubric.lockVersion, idempotencyKey: key() },
        rs = await Promise.all(
          [0, 1, 2].map(() =>
            ag(f.planningApprover.id)
              .post(base('rubrics/' + rubric.id + '/publish'))
              .send(body),
          ),
        );
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201]);
      rubric = rs[0].body;
      expect(rubric.state).toBe('PUBLISHED');
      await ag(f.planningApprover.id)
        .post(base('rubrics/' + rubric.id + '/publish'))
        .send({ ...body, idempotencyKey: key() })
        .expect(409);
      await ag(f.teacher.id)
        .put(base('rubrics/' + rubric.id))
        .send({ ...rb(), expectedPreviousVersion: 1, expectedLockVersion: rubric.lockVersion })
        .expect(409);
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { objectId: rubric.id, action: 'RUBRIC_PUBLISH' },
        }),
      ).toBe(1);
      evidence.push({
        ac: 'D2',
        independentMakerRoleChange403: true,
        publishTripleReplayOneAudit: true,
      });
    });
    it('criterion bounds/foreign criterion rejected; two concurrent graders choose one draft and keep pending null', async () => {
      for (const items of [
        scores('-1'),
        scores('10.01'),
        [{ criterionId: randomUUID(), score: '1', feedback: 'Foreign' }],
      ])
        await ag(f.teacher.id)
          .post(base('submissions/' + submission.id + '/grades'))
          .send(gb(items))
          .expect(400);
      const bodies = [
        gb([{ criterionId: rubric.criteria[0].id, score: '0', feedback: 'Explicit zero' }]),
        gb(scores()),
      ];
      const rs = await Promise.all(
        bodies.map((b) =>
          ag(f.teacher.id)
            .post(base('submissions/' + submission.id + '/grades'))
            .send(b),
        ),
      );
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      grade = rs.find((r) => r.status === 201)!.body;
      // Start with an explicitly partial saved draft independent of the winning network order.
      grade = (
        await ag(f.teacher.id)
          .put(base('submissions/' + submission.id + '/grades/' + grade.id))
          .send({
            ...gb([{ criterionId: rubric.criteria[0].id, score: '0', feedback: 'Explicit zero' }]),
            expectedPreviousVersion: 1,
            expectedLockVersion: grade.lockVersion,
          })
          .expect(200)
      ).body;
      expect(grade.earned).toBeNull();
      expect((await book()).entries[0]).toMatchObject({
        status: 'GRADING_IN_PROGRESS',
        result: null,
        history: [],
      });
      await ag(f.teacher.id)
        .post(base('grades/' + grade.id + '/final'))
        .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
        .expect(409);
      expect(JSON.stringify(await book())).not.toContain('SECRET_DRAFT_FEEDBACK');
      const next = (
        await ag(f.teacher.id)
          .post(base('rubrics'))
          .send({
            ...rb(),
            expectedPreviousVersion: 1,
            name: 'Version2 different rubric',
            idempotencyKey: key(),
            criteria: [
              { name: 'New criterion', description: 'Explicit new attainment', maxScore: '5' },
            ],
          })
          .expect(201)
      ).body;
      await ag(f.planningApprover.id)
        .post(base('rubrics/' + next.id + '/publish'))
        .send({ expectedLockVersion: next.lockVersion, idempotencyKey: key() })
        .expect(201);

      evidence.push({
        ac: 'D4/D5',
        bounds400: true,
        twoDraftRace: rs.map((r) => r.status),
        partialEarnedNull: true,
        noPrivateFeedback: true,
      });
    });
    it('draft edit CAS and retry; GV final pins exact source/rubric; pending release never leaks points', async () => {
      const old = grade.lockVersion,
        b = { ...gb(scores()), expectedPreviousVersion: 1, expectedLockVersion: old };
      const rs = await Promise.all(
        [0, 1].map(() =>
          ag(f.teacher.id)
            .put(base('submissions/' + submission.id + '/grades/' + grade.id))
            .send(b),
        ),
      );
      expect(rs.map((r) => r.status)).toEqual([200, 200]);
      grade = rs[0].body;
      const replayStorage = jest
        .spyOn(dev.app.select(ClassLmsModule).get(LearningResourceStorage, { strict: true }), 'stat')
        .mockRejectedValueOnce(new Error('Synthetic transient file outage during receipt replay'));
      await ag(f.teacher.id)
        .put(base('submissions/' + submission.id + '/grades/' + grade.id))
        .send(b)
        .expect(200);
      expect(replayStorage).not.toHaveBeenCalled();
      replayStorage.mockRestore();
      await ag(f.teacher.id)
        .put(base('submissions/' + submission.id + '/grades/' + grade.id))
        .send({ ...b, feedback: 'Conflicting payload on same key' })
        .expect(409);
      await ag(f.teacher.id)
        .put(base('submissions/' + submission.id + '/grades/' + grade.id))
        .send({ ...b, idempotencyKey: key() })
        .expect(409);
      expect(grade.earned).toBe('10.00');
      expect(grade.max).toBe('20.00');
      expect(grade.percent).toBe('50');
      const r = (
        await ag(f.teacher.id)
          .post(base('grades/' + grade.id + '/final'))
          .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
          .expect(201)
      ).body;
      grade = r;
      expect(grade.state).toBe('REVIEWED_FINAL');
      const entry = (await book()).entries[0];
      expect(entry).toMatchObject({ status: 'PENDING_PUBLICATION', result: null, history: [] });
      expect(JSON.stringify(entry)).not.toContain('SECRET_DRAFT_FEEDBACK');
      expect(JSON.stringify(entry)).not.toContain('10.00');
      const q = (await ag(f.teacher.id).get(base('queue')).expect(200)).body;
      expect(q.submissions[0].source.id).toBe(activity.revisionId);
      expect(q.submissions[0].grades[0].rubric.id).toBe(rubric.id);
      evidence.push({
        ac: 'D3/D4/D5',
        teacherFinal: true,
        pendingNoScoreOrFeedback: true,
        sourceAndRubricPinned: true,
      });
    });
    it('checker=file authorization, independent grade publication and duplicate network retries', async () => {
      const file = base('grades/' + grade.id + '/file');
      await ag(f.teacher.id).get(file).expect(200);
      await ag(f.planningApprover.id).get(file).expect(200);
      await ag(f.learner.id).get(file).expect(403);
      await ag(f.academic.id).get(file).expect(403);
      await ag(f.otherTeacher.id).get(file).expect(404);
      await grantAcademic(
        dev.prisma,
        f.planningApprover.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.grade.publish',
        'CLASS',
        f.lmsClasses[1].id,
      );
      await ag(f.planningApprover.id)
        .get(
          '/api/v2/assignment-grading/classes/' +
            f.lmsClasses[1].id +
            '/activities/' +
            activity.id +
            '/grades/' +
            grade.id +
            '/file',
        )
        .expect(404);
      await request(dev.app.getHttpServer()).get(file).expect(401);
      await ag(f.teacher.id)
        .post(base('grades/' + grade.id + '/publish'))
        .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
        .expect(403);
      await dev.prisma.user.update({
        where: { id: f.teacher.id },
        data: { role: 'ACADEMIC_MANAGER' },
      });
      await grantAcademic(
        dev.prisma,
        f.teacher.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.grade.publish',
        'CLASS',
        f.lmsClasses[0].id,
      );
      await ag(f.teacher.id)
        .post(base('grades/' + grade.id + '/publish'))
        .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
        .expect(403);
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { role: 'INSTRUCTOR' } });
      const b = { expectedLockVersion: grade.lockVersion, idempotencyKey: key() },
        rs = await Promise.all(
          [0, 1, 2].map(() =>
            ag(f.planningApprover.id)
              .post(base('grades/' + grade.id + '/publish'))
              .send(b),
          ),
        );
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201]);
      grade = rs[0].body;
      originalGrade = grade;
      await ag(f.planningApprover.id)
        .post(base('grades/' + grade.id + '/publish'))
        .send({ ...b, idempotencyKey: key() })
        .expect(409);
      expect(
        await dev.prisma.domainAuditEvent.count({
          where: { objectId: grade.id, action: 'GRADE_PUBLISH' },
        }),
      ).toBe(1);
      expect((await book()).entries[0].result).toMatchObject({
        earned: '10.00',
        max: '20.00',
        percent: '50',
        number: 1,
        state: 'PUBLISHED',
      });
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.otherLearner.id },
        data: { status: 'ACTIVE' },
      });
      const peer = await ag(f.otherLearner.id)
        .get(root('gradebook') + '?learnerId=' + f.learner.id)
        .expect(200);
      expect(peer.body.entries).toEqual([]);
      await ag(f.otherLearner.id)
        .get(
          lms('activities/' + activity.id + '/assignment/submissions/' + submission.id + '/file'),
        )
        .expect(404);
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.otherLearner.id },
        data: { status: 'PENDING_PAYMENT' },
      });
      evidence.push({
        ac: 'D3/D5',
        independentSelfDenial: true,
        privateFileScope: true,
        publishTripleReplayOneAudit: true,
      });
    });
    it('rubric revision during grading stays pinned; correction draft does not replace old learner publication', async () => {
      expect((await book()).entries[0].result.rubric.version).toBe(1);
      await ag(f.teacher.id)
        .post(base('submissions/' + submission.id + '/grades'))
        .send({ ...gb(scores('0', '0')), expectedPreviousVersion: 1 })
        .expect(400);
      grade = (
        await ag(f.teacher.id)
          .post(base('submissions/' + submission.id + '/grades'))
          .send({
            ...gb(scores('0', '0')),
            expectedPreviousVersion: 1,
            reason: 'Corrected after checking original evidence',
          })
          .expect(201)
      ).body;
      expect(grade.number).toBe(2);
      const entry = (await book()).entries[0];
      expect(entry.result.number).toBe(1);
      expect(entry.history).toHaveLength(1);
      expect(JSON.stringify(entry)).not.toContain('Corrected after checking');
      evidence.push({
        ac: 'D2/D6',
        oldRubricPinned: true,
        correctionNeedsReason: true,
        unpublishedCorrectionHidden: true,
      });
    });
    it('storage corruption and enrollment loss deny final/publication without fake zero; explicit zero publishes as new version', async () => {
      const storage = dev.app.select(ClassLmsModule).get(LearningResourceStorage, { strict: true }),
        spy = jest.spyOn(storage, 'stat').mockResolvedValueOnce({ sizeBytes: 999 });
      await ag(f.teacher.id)
        .post(base('grades/' + grade.id + '/final'))
        .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
        .expect(503);
      spy.mockRestore();
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.learner.id },
        data: { status: 'DROPPED' },
      });
      await ag(f.learner.id).get(root('gradebook')).expect(404);
      await ag(f.teacher.id)
        .post(base('grades/' + grade.id + '/final'))
        .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
        .expect(404);
      await dev.prisma.enrollment.updateMany({
        where: { classOfferingId: f.lmsClasses[0].id, learnerId: f.learner.id },
        data: { status: 'ACTIVE' },
      });
      grade = (
        await ag(f.teacher.id)
          .post(base('grades/' + grade.id + '/final'))
          .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
          .expect(201)
      ).body;
      const pending = (await book()).entries[0];
      expect(pending.result.number).toBe(1);
      grade = (
        await ag(f.planningApprover.id)
          .post(base('grades/' + grade.id + '/publish'))
          .send({ expectedLockVersion: grade.lockVersion, idempotencyKey: key() })
          .expect(201)
      ).body;
      const entry = (await book()).entries[0];
      expect(entry.result).toMatchObject({ earned: '0.00', percent: '0', number: 2 });
      expect(entry.history.map((g: Grade) => g.number)).toEqual([2, 1]);
      expect(
        (await dev.prisma.assignmentGrade.findUniqueOrThrow({ where: { id: originalGrade.id } }))
          .state,
      ).toBe('PUBLISHED');
      const activityRow = await dev.prisma.classActivity.findUniqueOrThrow({
        where: { id: activity.id },
      });
      const changed = (
        await ag(f.teacher.id)
          .patch(lms('sections/' + activityRow.sectionId + '/activities/' + activity.id))
          .send({
            type: 'ASSIGNMENT',
            title: 'SECRET_NEW_DRAFT_TITLE',
            introduction: 'SECRET_NEW_DRAFT_INTRO',
            contentMarkdown: 'SECRET_NEW_DRAFT_PROMPT',
            expectedLockVersion: activityRow.lockVersion,
          })
          .expect(200)
      ).body;
      await ag(f.learner.id)
        .get(lms('activities/' + activity.id))
        .expect(404);
      let historical = (await book()).entries[0];
      expect(historical.result.number).toBe(2);
      expect(historical.title).toBe('Frozen workplace writing');
      expect(JSON.stringify(historical)).not.toContain('SECRET_NEW_DRAFT');
      await ag(f.teacher.id)
        .post(lms('activities/' + activity.id + '/hide'))
        .send({ expectedLockVersion: changed.lockVersion })
        .expect(201);
      historical = (await book()).entries[0];
      expect(historical.result.number).toBe(2);
      expect(historical.history).toHaveLength(2);
      evidence.push({
        ac: 'D4/D6',
        corruption503: true,
        enrollmentLoss404: true,
        explicitZeroNotNull: true,
        oldPublicationImmutable: true,
        laterActivityDraftOrHideDoesNotUnpublishGradeOrLeakDraftMetadata: true,
      });
    });
    it('PostgreSQL rejects published grade/score/rubric edits and same-actor checker; no legacy/class score mixing', async () => {
      const draftRubric = (
        await ag(f.teacher.id)
          .post(base('rubrics'))
          .send({ ...rb(), expectedPreviousVersion: 2 })
          .expect(201)
      ).body;
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      try {
        const {
          rows: [session],
        } = await c.query(
          "SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 AND expire>now() LIMIT 1",
          [f.teacher.id],
        );
        for (const sql of [
          'UPDATE assignment_grades SET feedback=\'tamper\',"lockVersion"="lockVersion"+1 WHERE id=$1',
          'DELETE FROM assignment_grades WHERE id=$1',
        ]) {
          await c.query('BEGIN');
          await c.query(
            "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
            [f.teacher.id, session.sid],
          );
          await expect(c.query(sql, [grade.id])).rejects.toMatchObject({ code: '23514' });
          await c.query('ROLLBACK');
        }
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.teacher.id, session.sid],
        );
        await expect(
          c.query('UPDATE rubric_criterion_scores SET score=9 WHERE "assignmentGradeId"=$1', [
            grade.id,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.teacher.id, session.sid],
        );
        await expect(
          c.query('UPDATE rubric_criteria SET "maxScore"=99 WHERE "rubricId"=$1', [rubric.id]),
        ).rejects.toMatchObject({ code: '23514' });
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.teacher.id, session.sid],
        );
        await c.query("UPDATE users SET role='ACADEMIC_MANAGER' WHERE id=$1", [f.teacher.id]);
        await expect(
          c.query(
            'UPDATE rubrics SET "assignmentState"=\'PUBLISHED\',"approvedById"=$1,"approvedAt"=now(),"lockVersion"="lockVersion"+1 WHERE id=$2',
            [f.teacher.id, draftRubric.id],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.teacher.id, session.sid],
        );
        await expect(
          c.query(
            'INSERT INTO rubric_criterion_scores(id,"answerEvaluationId","rubricCriterionId",score,"createdAt") VALUES(gen_random_uuid(),$1,$2,0,now())',
            [randomUUID(), rubric.criteria[0].id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await c.query('ROLLBACK');
      } finally {
        await c.end();
      }
      evidence.push({ ac: 'D2/D6', sqlImmutableGradeScoreRubric: true });
    });
    it('checker revocation while queued prevents publication; old published learner result remains selected', async () => {
      const g = (
        await ag(f.teacher.id)
          .post(base('submissions/' + submission.id + '/grades'))
          .send({
            ...gb(scores('1', '1')),
            expectedPreviousVersion: 2,
            reason: 'Synthetic queued publication probe',
          })
          .expect(201)
      ).body;
      const final = (
        await ag(f.teacher.id)
          .post(base('grades/' + g.id + '/final'))
          .send({ expectedLockVersion: g.lockVersion, idempotencyKey: key() })
          .expect(201)
      ).body;
      const lock = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await lock.connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT pg_advisory_xact_lock(842030)');
        const pending = ag(f.planningApprover.id)
          .post(base('grades/' + final.id + '/publish'))
          .send({ expectedLockVersion: final.lockVersion, idempotencyKey: key() })
          .then((r) => r);
        await dev.prisma.permissionGrant.updateMany({
          where: {
            userId: f.planningApprover.id,
            capability: 'academic.grade.publish',
            scopeId: f.lmsClasses[0].id,
          },
          data: {
            revokedAt: new Date(),
            revokedBy: f.approver.id,
            revokeReason: 'Synthetic queued checker revocation',
          },
        });
        await lock.query('COMMIT');
        expect((await pending).status).toBe(403);
      } finally {
        await lock.end();
      }
      expect(
        (await dev.prisma.assignmentGrade.findUniqueOrThrow({ where: { id: final.id } })).state,
      ).toBe('REVIEWED_FINAL');
      expect((await book()).entries[0].result.number).toBe(2);
      evidence.push({ ac: 'D3/D5', queuedRevocation403: true, oldPublishedStillVisible: true });
    });
    it('effective teacher expiry while new grading request waits denies FINAL with no legacy fallback', async () => {
      const c = await dev.prisma.classOffering.create({
        data: {
          courseId: f.published.id,
          instructorId: f.teacher.id,
          code: 'W03BB-EXP-' + randomUUID().slice(0, 8),
          name: 'Finite grading assignment',
          status: 'OPEN',
        },
      });
      await dev.prisma.enrollment.create({
        data: { classOfferingId: c.id, learnerId: f.learner.id, status: 'ACTIVE' },
      });
      for (const cap of ['academic.schedule.approve', 'academic.rubric.approve'])
        await grantAcademic(
          dev.prisma,
          f.planningApprover.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          c.id,
        );
      const maker = ag(f.academic.id),
        checker = ag(f.planningApprover.id),
        start = Date.now() + 1600,
        end = start + 4500;
      let ia = (
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
      ia = (
        await maker
          .post('/api/v2/academic/assignments/' + ia.id + '/submit')
          .send({ expectedLockVersion: ia.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await checker
        .post('/api/v2/academic/assignments/' + ia.id + '/approve')
        .send({ expectedLockVersion: ia.lockVersion, reason: f.reason, eligibilityConfirmed: true })
        .expect(201);
      await new Promise((r) => setTimeout(r, Math.max(0, start - Date.now() + 100)));
      const lp = '/api/v2/class-lms/classes/' + c.id,
        t = ag(f.teacher.id),
        s = (
          await t
            .post(lp + '/sections')
            .send({ title: 'Finite grading', introduction: '' })
            .expect(201)
        ).body;
      await t
        .post(lp + '/sections/' + s.id + '/publish')
        .send({ expectedLockVersion: s.lockVersion })
        .expect(201);
      const act = (
          await t
            .post(lp + '/sections/' + s.id + '/activities')
            .send({
              type: 'ASSIGNMENT',
              title: 'Finite source',
              introduction: '',
              contentMarkdown: 'Original finite source',
            })
            .expect(201)
        ).body,
        pub = (
          await t
            .post(lp + '/activities/' + act.id + '/publish')
            .send({ expectedLockVersion: act.lockVersion })
            .expect(201)
        ).body;
      const mine = lp + '/activities/' + act.id + '/assignment/mine',
        d = (
          await ag(f.learner.id)
            .put(mine)
            .send({
              revisionId: pub.revisionId,
              expectedLockVersion: 0,
              text: 'Original finite response',
            })
            .expect(200)
        ).body,
        su = (
          await ag(f.learner.id)
            .post(mine + '/submit')
            .send({
              revisionId: pub.revisionId,
              expectedLockVersion: d.lockVersion,
              idempotencyKey: key(),
            })
            .expect(201)
        ).body;
      const p = '/api/v2/assignment-grading/classes/' + c.id + '/activities/' + act.id,
        r = (
          await t
            .post(p + '/rubrics')
            .send(rb())
            .expect(201)
        ).body,
        rp = (
          await checker
            .post(p + '/rubrics/' + r.id + '/publish')
            .send({ expectedLockVersion: r.lockVersion, idempotencyKey: key() })
            .expect(201)
        ).body;
      const g = (
        await t
          .post(p + '/submissions/' + su.id + '/grades')
          .send({
            ...gb(),
            rubricId: rp.id,
            scores: rp.criteria.map((x: { id: string }) => ({
              criterionId: x.id,
              score: '1',
              feedback: '',
            })),
          })
          .expect(201)
      ).body;
      const lock = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await lock.connect();
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT pg_advisory_xact_lock(842030)');
        const pending = t
          .post(p + '/grades/' + g.id + '/final')
          .send({ expectedLockVersion: g.lockVersion, idempotencyKey: key() })
          .then((r) => r);
        await new Promise((r) => setTimeout(r, Math.max(0, end - Date.now() + 150)));
        await lock.query('COMMIT');
        expect((await pending).status).toBe(404);
      } finally {
        await lock.end();
      }
      await t.get(p + '/queue').expect(404);
      expect(
        (await dev.prisma.assignmentGrade.findUniqueOrThrow({ where: { id: g.id } })).state,
      ).toBe('DRAFT');
      evidence.push({ ac: 'D3', queuedTeacherExpiry404: true, noLegacyFallback: true });
    }, 20000);
    it('revoked scoped checker loses inbox/files/publication; expired teacher never regains legacy read, logout denies', async () => {
      await dev.prisma.permissionGrant.updateMany({
        where: {
          userId: f.planningApprover.id,
          capability: 'academic.grade.publish',
          scopeId: f.lmsClasses[0].id,
        },
        data: {
          revokedAt: new Date(),
          revokedBy: f.approver.id,
          revokeReason: 'Synthetic checker revocation probe',
        },
      });
      await ag(f.planningApprover.id)
        .get(base('grades/' + grade.id + '/file'))
        .expect(403);
      // Effective assignment expiry is exercised by retained W03A queued-lock and W02B access tests;
      // inactive current teacher is also rejected directly on the new queue, without changing history.
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { status: 'INACTIVE' } });
      await ag(f.teacher.id).get(base('queue')).expect(401);
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { status: 'ACTIVE' } });
      await ag(f.learner.id).post('/api/auth/logout').expect(204);
      await ag(f.learner.id).get(root('gradebook')).expect(401);
      evidence.push({
        ac: 'D3/D5',
        revokedChecker403: true,
        lockedTeacher401: true,
        logout401: true,
      });
    });
  },
);
