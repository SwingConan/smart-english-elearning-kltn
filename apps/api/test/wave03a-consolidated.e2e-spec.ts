import { Client } from 'pg';
import * as request from 'supertest';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
(process.env.WAVE01_PG_URL ? describe : describe.skip)(
  'W03A-BR01 CF Section metadata20 and genuine proposal affordance',
  () => {
    let dev: Awaited<ReturnType<typeof startWave01App>>,
      f: Awaited<ReturnType<typeof seedWave03A>>,
      section: { id: string; lockVersion: number },
      activity: { id: string; lockVersion: number },
      publicationId: string;
    const evidence: object[] = [],
      extraUsers: string[] = [];
    const agent = (id: string) => f.agents.get(id)!,
      base = (p = '') => '/api/v2/class-lms/classes/' + f.lmsClasses[0].id + (p ? '/' + p : '');
    const body = {
      type: 'LESSON',
      title: 'Published class lesson',
      introduction: 'Synthetic only',
      contentMarkdown: 'Frozen class activity content',
    };
    async function tree() {
      return (await agent(f.learner.id).get(base()).expect(200)).body;
    }
    beforeAll(async () => {
      process.env.LEARNING_RESOURCE_STORAGE_ROOT = resolve(
        '.local-storage/v2-wave03a-cf01/test-private-files',
      );
      dev = await startWave01App();
      f = await seedWave03A(dev);
    }, 60000);
    afterAll(async () => {
      const root = process.env.W03A_CF_EVIDENCE_ROOT ?? '.local-storage/v2-wave03a-cf01';
      await mkdir(root, { recursive: true });
      await writeFile(resolve(root, 'finding-evidence.json'), JSON.stringify(evidence, null, 2));
      if (dev) {
        if (f)
          await dev.prisma.user.updateMany({
            where: {
              id: {
                in: [
                  ...f.users.map((u) => u.id),
                  f.otherAcademic.id,
                  ...f.contenders.map((u) => u.id),
                  ...extraUsers,
                ],
              },
            },
            data: { status: 'INACTIVE' },
          });
        await dev.app.close();
      }
    });
    it('F01 never-published/metadata-only/draft-only Sections are absent; explicit metadata before activity publication', async () => {
      section = (
        await agent(f.teacher.id)
          .post(base('sections'))
          .send({ title: 'Reviewed Section v1', introduction: 'Reviewed introduction v1' })
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(base('sections'))
        .send({
          title: 'NEVER_PUBLISHED_SECTION_SECRET',
          introduction: 'NEVER_PUBLISHED_INTRO_SECRET',
        })
        .expect(201);
      expect((await tree()).sections).toEqual([]);
      activity = (
        await agent(f.teacher.id)
          .post(base('sections/' + section.id + '/activities'))
          .send(body)
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(base('activities/' + activity.id + '/publish'))
        .send({ expectedLockVersion: activity.lockVersion })
        .expect(409);
      expect(
        await dev.prisma.classActivityRevision.count({ where: { activityId: activity.id } }),
      ).toBe(0);
      section = {
        ...section,
        ...(
          await agent(f.teacher.id)
            .post(base('sections/' + section.id + '/publish'))
            .send({ expectedLockVersion: section.lockVersion })
            .expect(201)
        ).body,
      };
      expect((await tree()).sections).toEqual([]);
      activity = {
        ...activity,
        ...(
          await agent(f.teacher.id)
            .post(base('activities/' + activity.id + '/publish'))
            .send({ expectedLockVersion: activity.lockVersion })
            .expect(201)
        ).body,
      };
      const view = await tree();
      expect(view.sections).toHaveLength(1);
      expect(view.sections[0]).toMatchObject({
        title: 'Reviewed Section v1',
        introduction: 'Reviewed introduction v1',
      });
      expect(JSON.stringify(view)).not.toMatch(
        /NEVER_PUBLISHED|lockVersion|hasDraftChanges|publishedMetadata/,
      );
      await agent(f.otherLearner.id).get(base()).expect(404);
      await agent(f.contenders[0].id).get(base()).expect(404);
      for (const u of [f.learner, f.academic, f.admin])
        await agent(u.id)
          .post(base('sections/' + section.id + '/publish'))
          .send({ expectedLockVersion: section.lockVersion })
          .expect(403);
      await agent(f.otherTeacher.id)
        .post(base('sections/' + section.id + '/publish'))
        .send({ expectedLockVersion: section.lockVersion })
        .expect(404);
      evidence.push({
        finding: 'F01',
        draftAndMetadataOnlySectionsHidden: true,
        activityPublishBeforeSection409: true,
        accessiblePublishedSectionOnly: true,
        noDraftMetadataInStudentPayload: true,
        foreignAndPendingDenied: true,
      });
    });
    it('F01 draft edits and activity re-publication keep old metadata until explicit Section CAS publication', async () => {
      section = (
        await agent(f.teacher.id)
          .patch(base('sections/' + section.id))
          .send({
            title: 'Next Section v2',
            introduction: 'PENDING_METADATA_v2',
            expectedLockVersion: section.lockVersion,
          })
          .expect(200)
      ).body;
      expect((await tree()).sections[0]).toMatchObject({
        title: 'Reviewed Section v1',
        introduction: 'Reviewed introduction v1',
      });
      activity = (
        await agent(f.teacher.id)
          .patch(base('sections/' + section.id + '/activities/' + activity.id))
          .send({
            ...body,
            title: 'New activity publication',
            expectedLockVersion: activity.lockVersion,
          })
          .expect(200)
      ).body;
      activity = {
        ...activity,
        ...(
          await agent(f.teacher.id)
            .post(base('activities/' + activity.id + '/publish'))
            .send({ expectedLockVersion: activity.lockVersion })
            .expect(201)
        ).body,
      };
      expect(JSON.stringify(await tree())).not.toContain('PENDING_METADATA_v2');
      const p = (
        await agent(f.teacher.id)
          .post(base('sections/' + section.id + '/publish'))
          .send({ expectedLockVersion: section.lockVersion })
          .expect(201)
      ).body;
      section = { ...section, ...p };
      publicationId = p.revisionId;
      expect((await tree()).sections[0]).toMatchObject({
        title: 'Next Section v2',
        introduction: 'PENDING_METADATA_v2',
      });
      await agent(f.teacher.id)
        .post(base('activities/' + activity.id + '/hide'))
        .send({ expectedLockVersion: activity.lockVersion })
        .expect(201);
      expect((await tree()).sections).toEqual([]);
      expect(
        await dev.prisma.classSectionRevision.count({ where: { sectionId: section.id } }),
      ).toBe(2);
      evidence.push({
        finding: 'F01',
        metadataDraftStayedPrivate: true,
        activityPublishDidNotPublishMetadataDraft: true,
        explicitSectionPublishRevealedV2: true,
        lastAccessibleActivityHiddenRemovesSection: true,
        oldMetadataSnapshotsRetained: 2,
      });
    });
    it('F01 metadata publication cannot expose a Section containing only future-available activities; classes remain isolated', async () => {
      const s = (
        await agent(f.teacher.id)
          .post(base('sections'))
          .send({ title: 'FUTURE_SECTION_SECRET', introduction: 'FUTURE_INTRO_SECRET' })
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(base('sections/' + s.id + '/publish'))
        .send({ expectedLockVersion: s.lockVersion })
        .expect(201);
      const a = (
        await agent(f.teacher.id)
          .post(base('sections/' + s.id + '/activities'))
          .send({ ...body, availableFrom: new Date(Date.now() + 86400000).toISOString() })
          .expect(201)
      ).body;
      await agent(f.teacher.id)
        .post(base('activities/' + a.id + '/publish'))
        .send({ expectedLockVersion: a.lockVersion })
        .expect(201);
      expect((await tree()).sections).toEqual([]);
      await agent(f.learner.id)
        .get(base('activities/' + a.id))
        .expect(404);
      await agent(f.learner.id)
        .post(base('activities/' + a.id + '/open'))
        .expect(404);
      const b = '/api/v2/class-lms/classes/' + f.lmsClasses[1].id,
        sb = (
          await agent(f.otherTeacher.id)
            .post(b + '/sections')
            .send({ title: 'Other class approved section', introduction: 'Other class metadata' })
            .expect(201)
        ).body;
      await agent(f.otherTeacher.id)
        .post(b + '/sections/' + sb.id + '/publish')
        .send({ expectedLockVersion: sb.lockVersion })
        .expect(201);
      const ab = (
        await agent(f.otherTeacher.id)
          .post(b + '/sections/' + sb.id + '/activities')
          .send(body)
          .expect(201)
      ).body;
      await agent(f.otherTeacher.id)
        .post(b + '/activities/' + ab.id + '/publish')
        .send({ expectedLockVersion: ab.lockVersion })
        .expect(201);
      expect((await agent(f.learner.id).get(b).expect(200)).body.sections[0].title).toBe(
        'Other class approved section',
      );
      expect((await tree()).sections).toEqual([]);
      evidence.push({
        finding: 'F01',
        futureOnlySectionHidden: true,
        directActivityAndProgress404: true,
        sameCourseOtherClassUnaffected: true,
      });
    });
    it('F01 PostgreSQL immutable metadata/pointer guards and genuine concurrent CAS publication', async () => {
      const ownLegacy = '/api/v2/class-lms/classes/' + f.classroom.id,
        b = (
          await agent(f.teacher.id)
            .post(ownLegacy + '/sections')
            .send({ title: 'Other owned section', introduction: '' })
            .expect(201)
        ).body,
        pb = (
          await agent(f.teacher.id)
            .post(ownLegacy + '/sections/' + b.id + '/publish')
            .send({ expectedLockVersion: b.lockVersion })
            .expect(201)
        ).body;
      const c = new Client({ connectionString: process.env.E2E_DATABASE_URL });
      await c.connect();
      try {
        await expect(
          c.query("UPDATE class_section_revisions SET title='SQL rewrite' WHERE id=$1", [
            publicationId,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          c.query('DELETE FROM class_section_revisions WHERE id=$1', [publicationId]),
        ).rejects.toMatchObject({ code: '23514' });
        const {
          rows: [sess],
        } = await c.query("SELECT sid FROM user_sessions WHERE sess->>'userId'=$1 LIMIT 1", [
          f.teacher.id,
        ]);
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(842030)');
        await c.query(
          "SELECT set_config('app.class_lms_actor',$1,true),set_config('app.class_lms_session',$2,true)",
          [f.teacher.id, sess.sid],
        );
        await expect(
          c.query(
            'UPDATE class_sections SET "publishedRevisionId"=$1,"revisionNumber"="revisionNumber"+1,"lockVersion"="lockVersion"+1 WHERE id=$2',
            [pb.revisionId, section.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await c.query('ROLLBACK');
      } finally {
        await c.end();
      }
      const edits = await Promise.all(
        ['Race draft A', 'Race draft B'].map((title) =>
          agent(f.teacher.id)
            .patch(base('sections/' + section.id))
            .send({
              title,
              introduction: 'Concurrent draft',
              expectedLockVersion: section.lockVersion,
            }),
        ),
      );
      expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = edits.find((r) => r.status === 200)!.body;
      const pubs = await Promise.all(
        [0, 1].map(() =>
          agent(f.teacher.id)
            .post(base('sections/' + section.id + '/publish'))
            .send({ expectedLockVersion: winner.lockVersion }),
        ),
      );
      expect(pubs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await dev.prisma.classSectionRevision.count({ where: { sectionId: section.id } }),
      ).toBe(3);
      evidence.push({
        finding: 'F01',
        immutableSnapshotUpdateDelete23514: true,
        crossSectionPointer23514: true,
        concurrentEdits: edits.map((r) => r.status),
        concurrentPublications: pubs.map((r) => r.status),
        noDuplicateRevision: true,
      });
    });
    it('F03 empty/read-only/approval-only/revoked/expired manager scopes do not advertise proposal authority', async () => {
      const u = await dev.prisma.user.create({
        data: {
          email: 'w03cf-manager-' + randomUUID() + '@example.invalid',
          fullName: 'Synthetic unowned manager',
          role: 'ACADEMIC_MANAGER',
          passwordHash: f.academic.passwordHash,
        },
      });
      extraUsers.push(u.id);
      const a = request.agent(dev.app.getHttpServer());
      await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
      let response = (await a.get('/api/v2/my/classes').expect(200)).body;
      expect(response.canProposeOfficialSession).toBe(false);
      expect(response.data).toEqual([]);
      await grantAcademic(
        dev.prisma,
        u.id,
        f.approver.id,
        f.secondApprover.id,
        'class.read',
        'CLASS',
        f.lmsClasses[0].id,
      );
      response = (await a.get('/api/v2/my/classes')).body;
      expect(response.data.some((c: { id: string }) => c.id === f.lmsClasses[0].id)).toBe(true);
      expect(response.canProposeOfficialSession).toBe(false);
      const g = await grantAcademic(
        dev.prisma,
        u.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        f.lmsClasses[0].id,
      );
      expect((await a.get('/api/v2/my/classes')).body.canProposeOfficialSession).toBe(false);
      await dev.prisma.permissionGrant.updateMany({
        where: { userId: u.id },
        data: {
          revokedAt: new Date(),
          revokedBy: f.approver.id,
          revokeReason: 'Synthetic scope revocation',
        },
      });
      expect((await a.get('/api/v2/my/classes')).body.canProposeOfficialSession).toBe(false);
      await dev.prisma.permissionGrant.update({
        where: { id: g.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await a.get('/api/v2/my/classes')).body.canProposeOfficialSession).toBe(false);
      await a
        .post('/api/v2/academic/classes/' + f.lmsClasses[0].id + '/sessions')
        .send({
          startLocal: '2027-01-05T18:00',
          endLocal: '2027-01-05T19:00',
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'ONLINE',
          requiredCapabilities: [],
          reason: f.reason,
        })
        .expect(404);
      expect(
        (await agent(f.academic.id).get('/api/v2/my/classes')).body.canProposeOfficialSession,
      ).toBe(true);
      for (const id of [f.teacher.id, f.learner.id, f.admin.id])
        expect((await agent(id).get('/api/v2/my/classes')).body.canProposeOfficialSession).toBe(
          false,
        );
      evidence.push({
        finding: 'F03',
        emptyManager: false,
        readGrantOnly: false,
        approvalGrantOnly: false,
        revokedOrExpired: false,
        foreignProposal404: true,
        ownedClassManager: true,
        otherRoles: false,
      });
    });
    it('F03 legitimate proposal remains DRAFT and cannot self-approve even with a scoped synthetic approval grant', async () => {
      const maker = agent(f.academic.id);
      let r = (
        await maker
          .post('/api/v2/academic/classes/' + f.lmsClasses[0].id + '/sessions')
          .send({
            startLocal: '2027-01-06T18:00',
            endLocal: '2027-01-06T19:00',
            timezone: 'Asia/Ho_Chi_Minh',
            modality: 'ONLINE',
            requiredCapabilities: [],
            reason: f.reason,
          })
          .expect(201)
      ).body;
      expect(r.state).toBe('DRAFT');
      r = (
        await maker
          .post('/api/v2/academic/sessions/' + r.id + '/submit')
          .send({ expectedLockVersion: r.lockVersion, reason: f.reason })
          .expect(201)
      ).body;
      await grantAcademic(
        dev.prisma,
        f.academic.id,
        f.approver.id,
        f.secondApprover.id,
        'academic.schedule.approve',
        'CLASS',
        f.lmsClasses[0].id,
      );
      await maker
        .post('/api/v2/academic/sessions/' + r.id + '/approve')
        .send({ expectedLockVersion: r.lockVersion, reason: f.reason })
        .expect(403);
      expect(
        (await dev.prisma.teachingSession.findUniqueOrThrow({ where: { id: r.id } })).state,
      ).toBe('PENDING_APPROVAL');
      evidence.push({
        finding: 'F03',
        ownedProposal201: true,
        noAutoPublication: true,
        selfApprovalWithGrant403: true,
      });
    });
  },
);
