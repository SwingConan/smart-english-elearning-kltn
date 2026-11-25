import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { grantKnowledge, tagDraft, articleDraft } from './wave03bd.fixture';
import type { Prisma } from '../src/generated/prisma/client';
type Revision = {
  id: string;
  entryId: string;
  number: number;
  state: string;
  lockVersion: number;
  entryLockVersion: number;
  payload: ReturnType<typeof articleDraft>;
  sourceHash: string;
};
type Link = { id: string; state: string; lockVersion: number };
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03B-D K1-K6 real knowledge, provenance and bounded private aggregate',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      tag: Revision,
      article: Revision,
      quiz: { id: string; lockVersion: number },
      source: {
        id: string;
        lockVersion: number;
        questions: { id: string; options: { id: string; isCorrect: boolean }[] }[];
      },
      attempt: { id: string; lockVersion: number; receipt: string };
    const links: Link[] = [];
    const evidence: object[] = [],
      base = '/api/v2/knowledge',
      ag = (id: string) => f.agents.get(id)!,
      teacher = () => ag(f.teacher.id),
      checker = () => ag(f.planningApprover.id),
      student = () => ag(f.learner.id),
      key = () => randomUUID(),
      reason = 'Synthetic independent editorial accuracy/rights and frozen source verification',
      tr = (v: number) => ({
        idempotencyKey: key(),
        expectedLockVersion: v,
        reason,
        rightsConfirmed: true,
      });
    async function step(r: Revision, action: string, who = checker()) {
      return (
        await who
          .post(base + '/revisions/' + r.id + '/' + action)
          .send(tr(r.lockVersion))
          .expect(201)
      ).body as Revision;
    }

    async function sqlActor<T>(id: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
      return dev.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
        const [s] = await tx.$queryRaw<
          { sid: string }[]
        >`SELECT sid FROM user_sessions WHERE sess->>'userId'=${id} AND expire>clock_timestamp() LIMIT 1`;
        await tx.$queryRaw`SELECT set_config('app.class_lms_actor',${id},true),set_config('app.class_lms_session',${s.sid},true)`;
        return work(tx);
      });
    }
    function privateQuiz(x: unknown) {
      expect(JSON.stringify(x)).not.toMatch(
        /isCorrect|explanation|pointsAwarded|sourceHash|PRIVATE_QUIZ_KEY/,
      );
    }
    beforeAll(async () => {
      dev = await startWave01App();
      f = await seedWave03A(dev);
      await grantKnowledge(f, f.teacher.id, 'knowledge.author');
      await grantKnowledge(f, f.planningApprover.id, 'knowledge.review');
      await grantKnowledge(f, f.planningApprover.id, 'knowledge.publish');
      for (const cap of ['academic.quiz.approve', 'academic.quiz.grade.publish'])
        await grantAcademic(
          dev.prisma,
          f.planningApprover.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          f.lmsClasses[0].id,
        );
    }, 60000);
    afterAll(async () => {
      await writeFile(
        (process.env.W04A_EVIDENCE_ROOT ?? '.local-storage/v2-wave03bd')+'/knowledge-http-evidence.json',
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
    it('requires explicit GLOBAL knowledge grants; no guest/role/class/assignment fallback', async () => {
      await request(dev.app.getHttpServer())
        .get(base + '/articles')
        .expect(401);
      await ag(f.otherTeacher.id)
        .post(base + '/entries')
        .send(tagDraft('UNGRANTED'))
        .expect(403);
      await ag(f.academic.id)
        .post(base + '/entries')
        .send(tagDraft('HVU'))
        .expect(403);
      await student()
        .get(base + '/workspace')
        .expect(403);
      await ag(f.admin.id)
        .get(base + '/workspace')
        .expect(403);
      const denied = (
        await ag(f.academic.id)
          .get(base + '/workspace')
          .expect(200)
      ).body;
      expect(denied.capabilities).toEqual({ author: false, review: false, publish: false });
      await ag(f.admin.id)
        .post('/api/authority/grants')
        .send({
          userId: f.teacher.id,
          capability: 'knowledge.author',
          scopeType: 'CLASS',
          scopeId: f.lmsClasses[0].id,
          effectiveAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          reason,
        })
        .expect(400);
      evidence.push({
        k: 'K1/K2',
        guest401: true,
        noRoleFallback403: true,
        knowledgeClassGrant400: true,
      });
    });
    it('creates canonical typed tag with real maker/checker lifecycle, CAS and duplicate race protection', async () => {
      const b = tagDraft();
      const responses = await Promise.all(
        [1, 2].map(() =>
          teacher()
            .post(base + '/entries')
            .send(b)
            .expect(201),
        ),
      );
      tag = responses[0].body;
      expect(responses[1].body.id).toBe(tag.id);
      await teacher()
        .post(base + '/entries')
        .send({ ...b, idempotencyKey: key() })
        .expect(409);
      await teacher()
        .post(base + '/entries')
        .send({ ...b, idempotencyKey: key(), slug: 'different-slug' })
        .expect(409);
      tag = await step(tag, 'submit', teacher());
      const t = tr(tag.lockVersion),
        rs = await Promise.all(
          [1, 2].map(() =>
            checker()
              .post(base + '/revisions/' + tag.id + '/review')
              .send(t)
              .expect(201),
          ),
        );
      tag = rs[0].body;
      expect(rs[1].body.sourceHash).toBe(tag.sourceHash);
      tag = await step(tag, 'publish');
      expect(tag.state).toBe('PUBLISHED');
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.knowledgeRevision.update({
            where: { id: tag.id },
            data: { title: 'Tampered tag', lockVersion: { increment: 1 } },
          }),
        ),
      ).rejects.toThrow(/FROZEN/);
      evidence.push({
        k: 'K4',
        canonicalCode: 'WORD_FORMS',
        skill: 'READING',
        part: 5,
        independentReviewedVersion: true,
        duplicate409: true,
        sqlPublishedFrozen: true,
      });
    });
    it('rejects XSS, external tracking/unsafe URLs and incomplete rights before publication', async () => {
      const b = articleDraft(tag.id, 'security-probe');
      for (const patch of [
        { bodyMarkdown: '<script>alert(1)</script>' },
        { bodyMarkdown: '![tracking](https://example.com/pixel)' },
        { bodyMarkdown: 'javascript:alert(1)' },
        { references: [{ title: 'Bad', url: 'https://example.com/ref?utm_source=tracking' }] },
        { references: [{ title: 'Bad', url: 'https://127.0.0.1/private' }] },
      ])
        await teacher()
          .post(base + '/entries')
          .send({ ...b, ...patch, idempotencyKey: key() })
          .expect(400);
      let r = (
        await teacher()
          .post(base + '/entries')
          .send({ ...b, rights: { ...b.rights, proof: '' } })
          .expect(201)
      ).body;
      await teacher()
        .post(base + '/revisions/' + r.id + '/submit')
        .send(tr(r.lockVersion))
        .expect(400);
      r = (
        await teacher()
          .post(base + '/entries')
          .send({
            ...articleDraft(tag.id, 'incomplete-practice'),
            practice: articleDraft(tag.id).practice.slice(0, 2),
          })
          .expect(201)
      ).body;
      await teacher()
        .post(base + '/revisions/' + r.id + '/submit')
        .send(tr(r.lockVersion))
        .expect(400);
      evidence.push({
        k: 'K3/K5',
        unsafeTextAndReference400: true,
        missingRights400: true,
        lessThan3Practice400: true,
      });
    });
    it('keeps article draft/private, enforces explicit rights review then publishes real standalone content', async () => {
      article = (
        await teacher()
          .post(base + '/entries')
          .send(articleDraft(tag.id))
          .expect(201)
      ).body;
      await student()
        .get(base + '/articles/word-forms')
        .expect(404);
      await student()
        .get(base + '/revisions/' + article.id)
        .expect(403);
      article = await step(article, 'submit', teacher());
      await ag(f.academic.id)
        .post(base + '/revisions/' + article.id + '/review')
        .send(tr(article.lockVersion))
        .expect(403);
      await checker()
        .post(base + '/revisions/' + article.id + '/review')
        .send({ ...tr(article.lockVersion), rightsConfirmed: false })
        .expect(400);
      article = await step(article, 'review');
      await student()
        .get(base + '/articles/word-forms')
        .expect(404);
      article = await step(article, 'publish');
      expect(article.state).toBe('PUBLISHED');
      evidence.push({
        k: 'K2/K3/K5',
        draftAndReviewedLearner404: true,
        explicitRightsReview: true,
        publishedImmutableRevision: 1,
      });
    });
    it('allows signed-in learner without enrollment, synonym/skill/Part/tag browse and non-graded version-pinned self-check', async () => {
      const learner = f.contenders[0],
        u = ag(learner.id);
      expect(await dev.prisma.enrollment.count({ where: { learnerId: learner.id } })).toBe(0);
      const found = (
        await u
          .get(base + '/articles?search=word%20families&skill=READING&part=5&tag=WORD_FORMS')
          .expect(200)
      ).body;
      expect(found.meta.total).toBe(1);
      const a = (await u.get(base + '/articles/word-forms').expect(200)).body;
      expect(a.practice).toHaveLength(3);
      expect(JSON.stringify(a)).not.toMatch(
        /"answer"|rights|proof|makerIds|reviewedById|sourceHash/,
      );
      const before = await dev.prisma.testAttempt.count({ where: { learnerId: learner.id } });
      const x = (
        await u
          .post(base + '/articles/word-forms/self-check')
          .send({ revisionId: article.id, item: 0, option: 0 })
          .expect(201)
      ).body;
      expect(x).toMatchObject({ correct: true, formativeOnly: true, gradeRecorded: false });
      expect(await dev.prisma.testAttempt.count({ where: { learnerId: learner.id } })).toBe(before);
      await u
        .post(base + '/articles/word-forms/self-check')
        .send({ revisionId: randomUUID(), item: 0, option: 0 })
        .expect(409);
      await u.get(base + '/recommendations?learnerId=' + f.learner.id).expect(400);
      evidence.push({
        k: 'K1/K5',
        noEnrollmentRequired: true,
        canonicalSynonymSearch: true,
        threeStandaloneSelfChecks: true,
        noGradeOrEvidenceWritten: true,
        versionMismatch409: true,
      });
    });
    it('draft changes, reviewer rejection and a new version do not overwrite or leak the published article', async () => {
      const b = {
        ...articleDraft(tag.id),
        title: 'PRIVATE_NEW_DRAFT_TITLE',
        expectedPreviousVersion: article.number,
        expectedLockVersion: article.entryLockVersion,
        idempotencyKey: key(),
      };
      let next = (
        await teacher()
          .post(base + '/entries/' + article.entryId + '/revisions')
          .send(b)
          .expect(201)
      ).body;
      const a = (
        await student()
          .get(base + '/articles/word-forms')
          .expect(200)
      ).body;
      expect(a.version).toBe(1);
      expect(JSON.stringify(a)).not.toContain('PRIVATE_NEW');
      const staleBody = {
        ...b,
        expectedPreviousVersion: next.number,
        expectedLockVersion: next.lockVersion,
        idempotencyKey: key(),
      };
      next = (
        await teacher()
          .put(base + '/revisions/' + next.id)
          .send(staleBody)
          .expect(200)
      ).body;
      await teacher()
        .put(base + '/revisions/' + next.id)
        .send({ ...staleBody, idempotencyKey: key() })
        .expect(409);
      next = await step(next, 'submit', teacher());
      next = await step(next, 'reject');
      expect(next.state).toBe('REJECTED');
      expect(next.reviewReason).toBe(reason);
      await teacher()
        .put(base + '/revisions/' + article.id)
        .send({ ...b, expectedPreviousVersion: 1, expectedLockVersion: article.lockVersion })
        .expect(409);
      evidence.push({
        k: 'K2/K3',
        publishedV1PreservedWhileV2Private: true,
        staleEdit409: true,
        rejectReasonRetained: true,
      });
    });
    it('constructs fresh synthetic approved Quiz with4 distinct tagged candidates without changing protected sources', async () => {
      const lp = '/api/v2/class-lms/classes/' + f.lmsClasses[0].id,
        section = (
          await teacher()
            .post(lp + '/sections')
            .send({ title: 'Knowledge evidence synthetic', introduction: '' })
            .expect(201)
        ).body;
      await teacher()
        .post(lp + '/sections/' + section.id + '/publish')
        .send({ expectedLockVersion: section.lockVersion })
        .expect(201);
      quiz = (
        await teacher()
          .post(lp + '/sections/' + section.id + '/activities')
          .send({
            type: 'QUIZ',
            title: 'New synthetic tagged grammar Quiz',
            introduction: '',
            contentMarkdown: '',
          })
          .expect(201)
      ).body;
      const root = '/api/v2/class-quiz/classes/' + f.lmsClasses[0].id + '/activities/' + quiz.id;
      source = (
        await teacher()
          .post(root + '/sources')
          .send({
            idempotencyKey: key(),
            expectedVersion: 0,
            title: 'New synthetic tagged grammar Quiz',
            openAt: new Date(Date.now() - 1000).toISOString(),
            closeAt: new Date(Date.now() + 3600000).toISOString(),
            durationMinutes: 5,
            questions: [0, 1, 2, 3].map((i) => ({
              content: 'Distinct synthetic question ' + (i + 1) + ' requires a word class.',
              points: 1,
              explanation: 'PRIVATE_QUIZ_KEY_' + i,
              options: [
                { content: 'Correct synthetic form ' + i, isCorrect: true },
                { content: 'Distractor synthetic form ' + i, isCorrect: false },
              ],
            })),
          })
          .expect(201)
      ).body;
      source = (
        await checker()
          .post(root + '/sources/' + source.id + '/approve')
          .send({ idempotencyKey: key(), expectedLockVersion: source.lockVersion })
          .expect(201)
      ).body;
      await teacher()
        .post(lp + '/activities/' + quiz.id + '/publish')
        .send({ expectedLockVersion: quiz.lockVersion })
        .expect(201);
      expect(
        (
          await student()
            .get(base + '/recommendations')
            .expect(200)
        ).body,
      ).toMatchObject({ state: 'INSUFFICIENT_DATA', recommendations: [] });
      evidence.push({
        k: 'K4/K6',
        newSyntheticQuiz4DistinctItems: true,
        protectedSourcesNeverUsed: true,
        missingEvidenceInsufficient: true,
      });
    });
    it('mapping requires author+current class, approved immutable sources/article/tag and separate exact-class review scope', async () => {
      const b = {
        idempotencyKey: key(),
        testQuestionId: source.questions[0].id,
        tagRevisionId: tag.id,
        articleRevisionId: article.id,
        reason,
      };
      await ag(f.otherTeacher.id)
        .post(base + '/links')
        .send(b)
        .expect(403);
      await grantKnowledge(f, f.otherTeacher.id, 'knowledge.author');
      await ag(f.otherTeacher.id)
        .post(base + '/links')
        .send({ ...b, idempotencyKey: key() })
        .expect(404);
      await ag(f.otherTeacher.id)
        .get(base + '/quiz-sources/' + f.lmsClasses[0].id)
        .expect(404);
      const foreign = (await dev.prisma.testQuestion.findFirst({
        where: { test: { quizActivityId: quiz.id } },
      }))!;
      expect(foreign.id).toBeTruthy();
      await teacher()
        .post(base + '/links')
        .send({
          ...b,
          articleRevisionId: (
            await dev.prisma.knowledgeRevision.findFirstOrThrow({
              where: { entryId: article.entryId, state: 'REJECTED' },
            })
          ).id,
        })
        .expect(409);
      for (const q of source.questions) {
        let l = (
          await teacher()
            .post(base + '/links')
            .send({ ...b, idempotencyKey: key(), testQuestionId: q.id })
            .expect(201)
        ).body;
        l = (
          await teacher()
            .post(base + '/links/' + l.id + '/submit')
            .send(tr(l.lockVersion))
            .expect(201)
        ).body;
        l = (
          await checker()
            .post(base + '/links/' + l.id + '/review')
            .send(tr(l.lockVersion))
            .expect(201)
        ).body;
        l = (
          await checker()
            .post(base + '/links/' + l.id + '/publish')
            .send(tr(l.lockVersion))
            .expect(201)
        ).body;
        links.push(l);
      }
      const hash = await dev.prisma.$queryRaw<
        { actual: string; stored: string }[]
      >`SELECT w03bc_source_hash(id) AS actual,"quizSourceHash" AS stored FROM tests WHERE id=${source.id}::uuid`;
      expect(hash[0].actual).toBe(hash[0].stored);
      evidence.push({
        k: 'K4',
        externalApprovedMapping4: true,
        sourceHashUnchanged: true,
        noFrozenQuestionRewrite: true,
        unpublishedTarget409: true,
      });
    });
    it('review and publish grants are distinct; center knowledge review does not open another class assessment source', async () => {
      await grantKnowledge(f, f.academic.id, 'knowledge.review');
      let r = (
        await teacher()
          .post(base + '/entries')
          .send(tagDraft('REVIEW_ONLY'))
          .expect(201)
      ).body;
      r = await step(r, 'submit', teacher());
      r = await step(r, 'review', ag(f.academic.id));
      await ag(f.academic.id)
        .post(base + '/revisions/' + r.id + '/publish')
        .send(tr(r.lockVersion))
        .expect(403);
      await step(r, 'publish');
      const link = await teacher()
        .post(base + '/links')
        .send({
          idempotencyKey: key(),
          testQuestionId: source.questions[0].id,
          tagRevisionId: tag.id,
          articleRevisionId: article.id,
          reason,
        })
        .expect(409);
      expect(link.status).toBe(409);
      const row = await dev.prisma.quizKnowledgeLink.findFirstOrThrow({
        where: { testQuestionId: source.questions[0].id, tagRevisionId: tag.id },
      });
      await ag(f.academic.id)
        .post(base + '/links/' + row.id + '/review')
        .send(tr(row.lockVersion))
        .expect(403);
      expect(
        (
          await ag(f.academic.id)
            .get(base + '/workspace')
            .expect(200)
        ).body.links,
      ).toHaveLength(0);
      evidence.push({
        k: 'K2/K4',
        reviewIsNotPublish403: true,
        knowledgeReviewIsNotClassQuizAuthority403: true,
      });
    });
    it('active or pending Quiz never yields recommendation or keys, regardless of caller IDs', async () => {
      const root = '/api/v2/class-quiz/classes/' + f.lmsClasses[0].id;
      attempt = (
        await student()
          .post(root + '/activities/' + quiz.id + '/start')
          .send({ sourceId: source.id, idempotencyKey: key() })
          .expect(201)
      ).body;
      let rec = (
        await student()
          .get(base + '/recommendations')
          .expect(200)
      ).body;
      expect(rec.state).toBe('INSUFFICIENT_DATA');
      privateQuiz(rec);
      attempt = (
        await student()
          .put(root + '/attempts/' + attempt.id + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: attempt.lockVersion,
            answers: source.questions.map((q, i) => ({
              questionId: q.id,
              optionId: q.options[i === 0 ? 0 : 1].id,
            })),
            marked: [],
          })
          .expect(200)
      ).body;
      attempt = (
        await student()
          .post(root + '/attempts/' + attempt.id + '/submit')
          .send({ idempotencyKey: key(), expectedLockVersion: attempt.lockVersion })
          .expect(201)
      ).body;
      rec = (
        await student()
          .get(base + '/recommendations')
          .expect(200)
      ).body;
      expect(rec.state).toBe('INSUFFICIENT_DATA');
      privateQuiz(rec);
      privateQuiz(
        (
          await student()
            .get(root + '/attempts/' + attempt.id)
            .expect(200)
        ).body,
      );
      await student()
        .get(base + '/recommendations?classId=' + f.lmsClasses[1].id)
        .expect(400);
      await teacher()
        .get(base + '/recommendations')
        .expect(403);
      evidence.push({
        k: 'K6',
        activeAndPendingInsufficient: true,
        callerIdInjection400: true,
        noQuizKeyLeak: true,
      });
    });
    it('only independently released own Quiz produces aggregate1/4; no per-question correctness or cross-learner evidence', async () => {
      const root = '/api/v2/class-quiz/classes/' + f.lmsClasses[0].id;
      await checker()
        .post(root + '/attempts/' + attempt.id + '/publish')
        .send({ idempotencyKey: key(), expectedLockVersion: attempt.lockVersion })
        .expect(201);
      const r = (
        await student()
          .get(base + '/recommendations')
          .expect(200)
      ).body;
      expect(r.state).toBe('AVAILABLE');
      expect(r.recommendations[0]).toMatchObject({
        code: 'WORD_FORMS',
        correct: 1,
        total: 4,
        notProficiency: true,
      });
      privateQuiz(r);
      expect(JSON.stringify(r)).not.toMatch(
        /questionId|testQuestionId|attemptId|learnerId|optionId/,
      );
      expect(
        (
          await ag(f.contenders[0].id)
            .get(base + '/recommendations')
            .expect(200)
        ).body,
      ).toMatchObject({ state: 'INSUFFICIENT_DATA', recommendations: [] });
      evidence.push({
        k: 'K6',
        publishedOwnAggregate: '1/4',
        noItemDetails: true,
        noOtherLearnerEvidence: true,
        notProficiency: true,
      });
    });
    it('less than4 approved mapping observations suppresses diagnostics, never fabricates0 or reveals items', async () => {
      const link = links[0];
      await checker()
        .post(base + '/links/' + link.id + '/withdraw')
        .send(tr(link.lockVersion))
        .expect(201);
      const r = (
        await student()
          .get(base + '/recommendations')
          .expect(200)
      ).body;
      expect(r).toMatchObject({
        state: 'INSUFFICIENT_DATA',
        message: 'Chưa đủ dữ liệu',
        recommendations: [],
      });
      privateQuiz(r);
      evidence.push({ k: 'K6', threeScoredTaggedItemsSuppressed: true, noFakeZero: true });
    });
    it('new tag/article versions preserve old content and suppress stale provenance until independently relinked', async () => {
      const oldTag = tag,
        oldArticle = article;
      tag = (
        await teacher()
          .post(base + '/entries/' + oldTag.entryId + '/revisions')
          .send({
            ...tagDraft(),
            expectedPreviousVersion: 1,
            expectedLockVersion: oldTag.entryLockVersion,
            idempotencyKey: key(),
            synonyms: ['word families', 'word-class selection'],
          })
          .expect(201)
      ).body;
      tag = await step(tag, 'submit', teacher());
      tag = await step(tag, 'review');
      tag = await step(tag, 'publish');
      const rejected = await dev.prisma.knowledgeRevision.findFirstOrThrow({
        where: { entryId: article.entryId, state: 'REJECTED' },
      });
      article = (
        await teacher()
          .put(base + '/revisions/' + rejected.id)
          .send({
            ...articleDraft(tag.id),
            title: 'Word Forms — revised version',
            expectedPreviousVersion: 2,
            expectedLockVersion: rejected.lockVersion,
            idempotencyKey: key(),
          })
          .expect(200)
      ).body;
      article = await step(article, 'submit', teacher());
      article = await step(article, 'review');
      article = await step(article, 'publish');
      const current = (
        await student()
          .get(base + '/articles/word-forms')
          .expect(200)
      ).body;
      expect(current.version).toBe(2);
      expect(current.tags[0].version).toBe(2);
      expect(
        (await dev.prisma.knowledgeRevision.findUniqueOrThrow({ where: { id: oldTag.id } }))
          .sourceHash,
      ).toBe(oldTag.sourceHash);
      expect(
        (await dev.prisma.knowledgeRevision.findUniqueOrThrow({ where: { id: oldArticle.id } }))
          .sourceHash,
      ).toBe(oldArticle.sourceHash);
      await student()
        .post(base + '/articles/word-forms/self-check')
        .send({ revisionId: oldArticle.id, item: 0, option: 0 })
        .expect(409);
      expect(
        (
          await student()
            .get(base + '/recommendations')
            .expect(200)
        ).body.recommendations,
      ).toHaveLength(0);
      evidence.push({
        k: 'K3/K4/K6',
        publishedVersions2: true,
        oldSnapshotsUnchanged: true,
        oldSelfCheck409: true,
        staleProvenanceSuppressed: true,
      });
    });
    it('new independently checked links restore a valid aggregate without rewriting Quiz source or scores', async () => {
      const previous = await dev.prisma.testAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      for (const q of source.questions) {
        let l = (
          await teacher()
            .post(base + '/links')
            .send({
              idempotencyKey: key(),
              testQuestionId: q.id,
              tagRevisionId: tag.id,
              articleRevisionId: article.id,
              reason,
            })
            .expect(201)
        ).body;
        for (const action of ['submit', 'review', 'publish'])
          l = (
            await (action === 'submit' ? teacher() : checker())
              .post(base + '/links/' + l.id + '/' + action)
              .send(tr(l.lockVersion))
              .expect(201)
          ).body;
      }
      const rec = (
        await student()
          .get(base + '/recommendations')
          .expect(200)
      ).body;
      expect(rec.recommendations[0]).toMatchObject({
        correct: 1,
        total: 4,
        article: { version: 2 },
      });
      privateQuiz(rec);
      const after = await dev.prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      expect(after.quizReceipt).toBe(previous.quizReceipt);
      expect(after.score).toBe(previous.score);
      expect(after.quizPublishedAt).toEqual(previous.quizPublishedAt);
      evidence.push({
        k: 'K4/K6',
        authorizedRelinkV2: true,
        sameQuizReceiptAndScore: true,
        aggregateStill1of4: true,
      });
    });
    it('withdrawal denies bookmarked content/self-check and suggestions while authorized history stays immutable', async () => {
      const e = await dev.prisma.knowledgeEntry.findUniqueOrThrow({
        where: { id: article.entryId },
      });
      const b = tr(e.lockVersion),
        rs = await Promise.all(
          [1, 2].map(() =>
            checker()
              .post(base + '/entries/' + e.id + '/withdraw')
              .send(b)
              .expect(201),
          ),
        );
      expect(rs[0].body.visibility).toBe('WITHDRAWN');
      expect(rs[0].body.lockVersion).toBe(rs[1].body.lockVersion);
      await student()
        .get(base + '/articles/word-forms')
        .expect(404);
      await student()
        .post(base + '/articles/word-forms/self-check')
        .send({ revisionId: article.id, item: 0, option: 0 })
        .expect(404);
      expect(
        (
          await student()
            .get(base + '/articles')
            .expect(200)
        ).body.data,
      ).toHaveLength(0);
      expect(
        (
          await checker()
            .get(base + '/revisions/' + article.id)
            .expect(200)
        ).body.state,
      ).toBe('PUBLISHED');
      await expect(
        sqlActor(f.teacher.id, (tx) =>
          tx.knowledgeRevisionTag.deleteMany({ where: { articleRevisionId: article.id } }),
        ),
      ).rejects.toThrow(/FROZEN/);
      evidence.push({
        k: 'K3/K6',
        withdrawnUrlAndPractice404: true,
        noOldPageLeak: true,
        reviewerHistoryRetained: true,
      });
    });
    it('historical source maker cannot self-review after role change; expired/revoked grants and logout fail closed', async () => {
      let r = (
        await teacher()
          .post(base + '/entries')
          .send(tagDraft('ROLE_HISTORY'))
          .expect(201)
      ).body;
      r = await step(r, 'submit', teacher());
      await dev.prisma.user.update({
        where: { id: f.teacher.id },
        data: { role: 'ACADEMIC_MANAGER' },
      });
      await grantKnowledge(f, f.teacher.id, 'knowledge.review');
      await teacher()
        .post(base + '/revisions/' + r.id + '/review')
        .send(tr(r.lockVersion))
        .expect(403);
      await dev.prisma.user.update({ where: { id: f.teacher.id }, data: { role: 'INSTRUCTOR' } });
      await dev.prisma.permissionGrant.updateMany({
        where: { userId: f.teacher.id, capability: 'knowledge.author' },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await teacher()
        .post(base + '/entries')
        .send(tagDraft('EXPIRED'))
        .expect(403);
      await ag(f.admin.id)
        .post(
          '/api/authority/grants/' +
            (
              await dev.prisma.permissionGrant.findFirstOrThrow({
                where: {
                  userId: f.planningApprover.id,
                  capability: 'knowledge.publish',
                  revokedAt: null,
                },
              })
            ).id +
            '/revoke',
        )
        .send({ reason })
        .expect(201);
      await checker()
        .get(base + '/workspace')
        .expect(401);
      await student().post('/api/auth/logout').expect(204);
      await student()
        .get(base + '/articles')
        .expect(401);
      evidence.push({
        k: 'K2',
        roleHistorySelf403: true,
        expiredAuthor403: true,
        grantRevocationSession401: true,
        logout401: true,
      });
    });
  },
);
