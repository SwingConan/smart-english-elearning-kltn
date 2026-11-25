import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave06 } from './wave06.fixture';
import { grantAcademic } from './wave02b.fixture';
import { articleDraft, tagDraft } from './wave03bd.fixture';
import { runArgonWave02BrowserVerification } from './argon-wave02-browser-capture';

async function setupWave02Fixture(d: Awaited<ReturnType<typeof startWave01App>>) {
  process.env.W06_ENABLED = 'DEV_DEC047';
  process.env.W08_ENABLED = 'DEV_DEC053';
  const f = await seedWave06(d.prisma);
  const g = await seedWave06(d.prisma);
  const agents = new Map<string, ReturnType<typeof request.agent>>();
  for (const u of [...f.users, f.otherAcademic, f.ungrantedAcademic, ...g.users, g.otherAcademic]) {
    if (!agents.has(u.id)) {
      const a = request.agent(d.app.getHttpServer());
      await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
      agents.set(u.id, a);
    }
  }
  for (const cls of [f.classroom, g.classroom]) {
    for (const u of [f.academic, f.planningApprover, g.academic, g.planningApprover]) {
      for (const cap of ['inspection.assign', 'inspection.hours.review', 'shift.review']) {
        await grantAcademic(d.prisma, u.id, f.approver.id, f.secondApprover.id, cap, 'CLASS', cls.id);
      }
    }
  }
  const post = async (u: { id: string }, p: string, b: object) =>
    (await agents.get(u.id)!.post('/api' + p).send(b).expect(201)).body as {
      id: string;
      lockVersion: number;
    };
  const now = async () =>
    (
      await d.prisma.$queryRaw<{ ms: number }[]>`SELECT extract(epoch FROM clock_timestamp())::double precision*1000 AS ms`
    )[0].ms;
  const reason = 'Synthetic W08 human evidence; no real staff';
  const assignments = [];
  const baseMs = await now();
  const effectiveFromIso = new Date(baseMs + 1500).toISOString();
  const effectiveToIso = new Date(baseMs + 86400000).toISOString();
  for (const x of [f, g]) {
    const a = await post(x.academic, '/v2/academic/classes/' + x.classroom.id + '/assignments', {
      instructorId: x.teacher.id,
      effectiveFrom: effectiveFromIso,
      effectiveTo: effectiveToIso,
      reason,
    });
    const pending = await post(x.academic, '/v2/academic/assignments/' + a.id + '/submit', {
      expectedLockVersion: 0,
      reason,
    });
    await post(x.planningApprover, '/v2/academic/assignments/' + a.id + '/approve', {
      expectedLockVersion: pending.lockVersion,
      eligibilityConfirmed: true,
      reason,
    });
    assignments.push(a);
  }
  while ((await now()) < baseMs + 1800) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const sessBaseMs = await now();
  const startsAt = new Date(sessBaseMs + 8000);
  const endsAt = new Date(sessBaseMs + 3600000);
  const sessions = [];
  for (const [i, x] of [f, g].entries()) {
    const draft = await d.prisma.teachingSession.create({
      data: {
        classOfferingId: x.classroom.id,
        startsAt,
        endsAt,
        timezone: 'Asia/Ho_Chi_Minh',
        modality: 'ONLINE',
        assignmentId: assignments[i].id,
        instructorId: x.teacher.id,
        requiredCapabilities: [],
        proposedBy: x.academic.id,
        reason,
      },
    });
    const p = await post(x.academic, '/v2/academic/sessions/' + draft.id + '/submit', {
      expectedLockVersion: 0,
      reason,
    });
    await post(x.planningApprover, '/v2/academic/sessions/' + draft.id + '/approve', {
      expectedLockVersion: p.lockVersion,
      reason,
    });
    const meet = await post(x.teacher, '/v2/session-engagement/sessions/' + draft.id + '/meet', {
      url: 'https://meet.google.com/abc-defg-hij',
      key: randomUUID(),
      reason,
    });
    await post(x.planningApprover, '/v2/session-engagement/reviews/meet/' + meet.id, {
      decision: 'APPROVED',
      key: randomUUID(),
      reason,
    });
    sessions.push(draft);
  }
  while ((await now()) < startsAt.getTime() + 100) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return { f, g, agents, sessions, reason };
}

describe('ROAD99 Argon Wave 02 — Staff, Official Sessions, Google Meet, Attendance, Inspection & W09 Certificates', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>;
  let w08: Awaited<ReturnType<typeof setupWave02Fixture>>;

  const reason = 'Argon Wave 02 isolated E2E verification with SQL readback';
  const key = () => randomUUID();

  const proofs: Record<string, unknown> = {
    executedAtUtc: new Date().toISOString(),
    pillarA_gv_sessions_and_activity_chooser: {},
    pillarB_schedule_meet_and_attendance: {},
    pillarC_w08_teaching_inspection: {},
    pillarD_w09_completion_and_certificates: {},
    sqlReadbacks: {},
  };

  const api = (u: { id: string }) => w08.agents.get(u.id)!;

  let classOfferingId = '';
  let officialSessionId = '';
  let sectionId = '';
  let lessonActId = '';
  let resourceActId = '';
  let assignmentActId = '';
  let quizActId = '';
  let inspectionAssignmentId = '';
  let primaryEnrollmentId = '';
  let secondaryEnrollmentId = '';
  let policyId = '';
  let issuedCertificateId = '';
  let issuedCertificateCode = '';
  let revokedCertificateId = '';
  let revokedCertificateCode = '';

  async function grantGlobalCap(userId: string, capability: string) {
    const f = w08.f;
    const reqAgent = api(f.admin);
    const chkAgent = api(f.approver);
    const u = [...f.users, f.otherAcademic, ...f.contenders].find((x) => x.id === userId)!;
    const row = (
      await reqAgent
        .post('/api/authority/grants')
        .send({
          userId,
          capability,
          scopeType: 'GLOBAL',
          effectiveAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    await chkAgent
      .post('/api/authority/grants/' + row.id + '/approve')
      .send({})
      .expect(201);
    await api(u)
      .post('/api/auth/login')
      .send({ email: u.email, password: f.password })
      .expect(200);
  }

  beforeAll(async () => {
    process.env.W06_ENABLED = 'DEV_DEC047';
    process.env.W08_ENABLED = 'DEV_DEC053';
    process.env.W09_ENABLED = 'DEV_W09';

    d = await startWave01App();
    w08 = await setupWave02Fixture(d);

    const f = w08.f;
    classOfferingId = f.classroom.id;
    officialSessionId = w08.sessions[0].id;

    // Grant W03 grade publish & W09 certificate capabilities on CLASS & COURSE scopes
    for (const actor of [f.academic, f.planningApprover]) {
      for (const cap of [
        'academic.rubric.approve',
        'academic.grade.publish',
        'academic.quiz.approve',
        'academic.quiz.grade.publish',
        'certificate.policy.approve',
        'certificate.review',
        'certificate.issue',
        'certificate.revoke',
      ]) {
        await grantAcademic(
          d.prisma,
          actor.id,
          f.approver.id,
          f.secondApprover.id,
          cap,
          'CLASS',
          f.classroom.id,
        );
      }
      await grantAcademic(
        d.prisma,
        actor.id,
        f.approver.id,
        f.secondApprover.id,
        'certificate.policy.approve',
        'COURSE',
        f.classroom.courseId,
      );
    }

    await grantGlobalCap(f.teacher.id, 'knowledge.author');
    await grantGlobalCap(f.planningApprover.id, 'knowledge.review');
    await grantGlobalCap(f.planningApprover.id, 'knowledge.publish');

    for (const u of [f.planningApprover, f.academic, f.teacher]) {
      await api(u)
        .post('/api/auth/login')
        .send({ email: u.email, password: f.password })
        .expect(200);
    }

    // Ensure contenders are logged in for secondary enrollment & negative tests
    for (const u of f.contenders) {
      if (!w08.agents.has(u.id)) {
        const a = request.agent(d.app.getHttpServer());
        await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
        w08.agents.set(u.id, a);
      }
    }

    const enr = await d.prisma.enrollment.findFirstOrThrow({
      where: {
        classOfferingId: f.classroom.id,
        learnerId: f.learner.id,
        status: 'ACTIVE',
      },
    });
    primaryEnrollmentId = enr.id;

    const secEnr = await d.prisma.enrollment.create({
      data: {
        classOfferingId: f.classroom.id,
        learnerId: f.contenders[0].id,
        status: 'ACTIVE',
      },
    });
    secondaryEnrollmentId = secEnr.id;
  }, 90000);

  afterAll(async () => {
    const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave02/EVIDENCE');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, 'ARGON_WAVE02_BACKEND_E2E_PROOFS.json'),
      JSON.stringify(proofs, null, 2),
      'utf-8',
    );
    if (d) await d.app.close();
  });

  it('Pillar A (UCV2-29..34, 37): GV Classroom exposes official TeachingSessions alongside Sections, supports 6-type Activity Chooser, KnowledgeTag linking, and Rubric/Quiz grading', async () => {
    const f = w08.f;
    const gv = api(f.teacher);
    const hv = api(f.learner);
    const hvuChecker = api(f.planningApprover);
    const lmsBase = `/api/v2/class-lms/classes/${classOfferingId}`;

    // 1. GV creates and publishes a Section in the assigned class
    let sec = (
      await gv
        .post(`${lmsBase}/sections`)
        .send({
          title: 'Tuần 01 — Kỹ năng Email Học thuật & Họp Trực tuyến',
          introduction: 'Section chuẩn IUH LMS gắn với buổi học chính thức Session 01',
        })
        .expect(201)
    ).body;
    sec = (
      await gv
        .post(`${lmsBase}/sections/${sec.id}/publish`)
        .send({ expectedLockVersion: sec.lockVersion })
        .expect(201)
    ).body;
    sectionId = sec.id;

    // 2. GV creates and publishes LESSON activity
    let lessonAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'LESSON',
          title: 'Bài học 01: Cấu trúc Email công sở B1',
          introduction: 'Đọc kỹ tài liệu trước giờ học trực tuyến',
          contentMarkdown:
            '# Cấu trúc Email công sở B1\n\n1. Subject line rõ ràng\n2. Mở đầu trang trọng\n3. Nội dung chính ngắn gọn\n4. Call-to-action và kết thư.',
        })
        .expect(201)
    ).body;
    lessonAct = (
      await gv
        .post(`${lmsBase}/activities/${lessonAct.id}/publish`)
        .send({ expectedLockVersion: lessonAct.lockVersion })
        .expect(201)
    ).body;
    lessonActId = lessonAct.id;

    // 3. GV creates and publishes RESOURCE activity (HTTPS link)
    let resourceAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'RESOURCE',
          title: 'Tài nguyên 01: Sổ tay mẫu câu họp trực tuyến',
          introduction: 'Tài liệu tham khảo chính thức',
          contentMarkdown: '',
          resourceUrl: 'https://example.com/english-workplace-handbook',
        })
        .expect(201)
    ).body;
    resourceAct = (
      await gv
        .post(`${lmsBase}/activities/${resourceAct.id}/publish`)
        .send({ expectedLockVersion: resourceAct.lockVersion })
        .expect(201)
    ).body;
    resourceActId = resourceAct.id;

    // 4. GV creates and publishes ASSIGNMENT activity
    let assignAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'ASSIGNMENT',
          title: 'Bài tập 01: Viết Email xác nhận lịch họp dự án',
          introduction: 'Viết email 120–150 từ xác nhận lịch họp với đối tác',
          contentMarkdown: 'Sử dụng đúng cấu trúc 4 phần đã học ở Bài học 01.',
        })
        .expect(201)
    ).body;
    assignAct = (
      await gv
        .post(`${lmsBase}/activities/${assignAct.id}/publish`)
        .send({ expectedLockVersion: assignAct.lockVersion })
        .expect(201)
    ).body;
    assignmentActId = assignAct.id;

    // 5. Learner opens & completes Lesson, drafts & submits Assignment
    await hv.post(`${lmsBase}/activities/${lessonActId}/open`).expect(201);
    const lessonComplete = (
      await hv.post(`${lmsBase}/activities/${lessonActId}/complete`).expect(201)
    ).body;
    expect(lessonComplete.status).toBe('COMPLETED');

    const aBase = `${lmsBase}/activities/${assignmentActId}/assignment`;
    const mineStatus = (await hv.get(`${aBase}/mine`).expect(200)).body;
    const draftRes = (
      await hv
        .put(`${aBase}/mine`)
        .send({
          revisionId: mineStatus.publishedRevisionId,
          expectedLockVersion: 0,
          text: 'Dear Ms. Nguyen, I am writing to confirm our project review meeting on Thursday at 10:00 AM ICT via Google Meet.',
        })
        .expect(200)
    ).body;
    const submitRes = (
      await hv
        .post(`${aBase}/mine/submit`)
        .send({
          revisionId: mineStatus.publishedRevisionId,
          idempotencyKey: key(),
          expectedLockVersion: draftRes.lockVersion,
        })
        .expect(201)
    ).body;
    expect(submitRes.state).toBe('SUBMITTED');

    // 6. GV authors Rubric, HVU publishes Rubric, GV grades & finalizes, HVU publishes Assignment Grade (W03 evidence)
    const gBase = `/api/v2/assignment-grading/classes/${classOfferingId}/activities/${assignmentActId}`;
    const rubricDraft = (
      await gv
        .post(`${gBase}/rubrics`)
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          name: 'Rubric Chấm Email Công Sở B1',
          description: 'Tiêu chí đánh giá email xác nhận lịch họp',
          criteria: [
            {
              name: 'Task Fulfillment',
              description: 'Đầy đủ thời gian, kênh họp Google Meet và mục tiêu cuộc họp',
              maxScore: '5',
            },
            {
              name: 'Workplace Register & Grammar',
              description: 'Văn phong trang trọng, ngữ pháp chính xác',
              maxScore: '5',
            },
          ],
        })
        .expect(201)
    ).body;
    const rubricPub = (
      await hvuChecker
        .post(`${gBase}/rubrics/${rubricDraft.id}/publish`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: rubricDraft.lockVersion,
        })
        .expect(201)
    ).body;

    const gradeDraft = (
      await gv
        .post(`${gBase}/submissions/${submitRes.id}/grades`)
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          rubricId: rubricPub.id,
          feedback: 'Bố cục rõ ràng, văn phong lịch sự đúng chuẩn B1.',
          scores: [
            {
              criterionId: rubricPub.criteria[0].id,
              score: '5',
              feedback: 'Đầy đủ thông tin lịch họp.',
            },
            {
              criterionId: rubricPub.criteria[1].id,
              score: '4',
              feedback: 'Ngữ pháp và từ vựng chuẩn xác.',
            },
          ],
          reason,
        })
        .expect(201)
    ).body;
    const gradeFinal = (
      await gv
        .post(`${gBase}/grades/${gradeDraft.id}/final`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: gradeDraft.lockVersion,
        })
        .expect(201)
    ).body;
    await hvuChecker
      .post(`${gBase}/grades/${gradeFinal.id}/publish`)
      .send({
        idempotencyKey: key(),
        expectedLockVersion: gradeFinal.lockVersion,
      })
      .expect(201);

    // 7. Knowledge Tag + Article + QUIZ activity + Learner attempt + HVU publish
    const kBase = '/api/v2/knowledge';
    const tr = (v: number) => ({
      idempotencyKey: key(),
      expectedLockVersion: v,
      reason,
      rightsConfirmed: true,
    });
    let tagRev = (await gv.post(`${kBase}/entries`).send(tagDraft('WORKPLACE_EMAIL_B1')).expect(201))
      .body;
    tagRev = (
      await gv.post(`${kBase}/revisions/${tagRev.id}/submit`).send(tr(tagRev.lockVersion)).expect(201)
    ).body;
    tagRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${tagRev.id}/review`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;
    tagRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${tagRev.id}/publish`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;

    let artRev = (
      await gv
        .post(`${kBase}/entries`)
        .send(articleDraft(tagRev.id, 'workplace-email-b1'))
        .expect(201)
    ).body;
    artRev = (
      await gv.post(`${kBase}/revisions/${artRev.id}/submit`).send(tr(artRev.lockVersion)).expect(201)
    ).body;
    artRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${artRev.id}/review`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;
    artRev = (
      await hvuChecker
        .post(`${kBase}/revisions/${artRev.id}/publish`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;

    let quizAct = (
      await gv
        .post(`${lmsBase}/sections/${sectionId}/activities`)
        .send({
          type: 'QUIZ',
          title: 'Quiz 01: Kiểm tra ngữ pháp & từ vựng Email B1',
          introduction: 'Quiz trắc nghiệm 4 câu có gắn chuẩn kiến thức',
          contentMarkdown: '',
        })
        .expect(201)
    ).body;
    quizActId = quizAct.id;

    const qRoot = `/api/v2/class-quiz/classes/${classOfferingId}/activities/${quizActId}`;
    let qSource = (
      await gv
        .post(`${qRoot}/sources`)
        .send({
          idempotencyKey: key(),
          expectedVersion: 0,
          title: 'Quiz 01: Kiểm tra ngữ pháp & từ vựng Email B1',
          openAt: new Date(Date.now() - 60000).toISOString(),
          closeAt: new Date(Date.now() + 3600000).toISOString(),
          durationMinutes: 10,
          questions: [0, 1, 2, 3].map((i) => ({
            content: `Workplace email question ${i + 1}: Select the formal expression.`,
            points: 1,
            explanation: `Explanation for item ${i + 1}`,
            options: [
              { content: `Formal option ${i + 1}`, isCorrect: true },
              { content: `Informal option ${i + 1}`, isCorrect: false },
            ],
          })),
        })
        .expect(201)
    ).body;
    qSource = (
      await hvuChecker
        .post(`${qRoot}/sources/${qSource.id}/approve`)
        .send({ idempotencyKey: key(), expectedLockVersion: qSource.lockVersion })
        .expect(201)
    ).body;
    await gv
      .post(`${lmsBase}/activities/${quizActId}/publish`)
      .send({ expectedLockVersion: quizAct.lockVersion })
      .expect(201);

    for (const q of qSource.questions) {
      let l = (
        await gv
          .post(`${kBase}/links`)
          .send({
            idempotencyKey: key(),
            testQuestionId: q.id,
            tagRevisionId: tagRev.id,
            articleRevisionId: artRev.id,
            reason,
          })
          .expect(201)
      ).body;
      l = (await gv.post(`${kBase}/links/${l.id}/submit`).send(tr(l.lockVersion)).expect(201)).body;
      l = (
        await hvuChecker.post(`${kBase}/links/${l.id}/review`).send(tr(l.lockVersion)).expect(201)
      ).body;
      l = (
        await hvuChecker.post(`${kBase}/links/${l.id}/publish`).send(tr(l.lockVersion)).expect(201)
      ).body;
    }

    const cqRoot = `/api/v2/class-quiz/classes/${classOfferingId}`;
    let qAttempt = (
      await hv
        .post(`${cqRoot}/activities/${quizActId}/start`)
        .send({ sourceId: qSource.id, idempotencyKey: key() })
        .expect(201)
    ).body;
    qAttempt = (
      await hv
        .put(`${cqRoot}/attempts/${qAttempt.id}/answers`)
        .send({
          idempotencyKey: key(),
          expectedLockVersion: qAttempt.lockVersion,
          answers: qSource.questions.map((q: any) => ({
            questionId: q.id,
            optionId: q.options[0].id,
          })),
          marked: [],
        })
        .expect(200)
    ).body;
    qAttempt = (
      await hv
        .post(`${cqRoot}/attempts/${qAttempt.id}/submit`)
        .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
        .expect(201)
    ).body;
    await hvuChecker
      .post(`${cqRoot}/attempts/${qAttempt.id}/publish`)
      .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
      .expect(201);

    // 8. Verify GV & HV class tree includes officialSessions + sessionEngagementEnabled + created section/activities
    const treeRes = await gv.get(lmsBase).expect(200);
    expect(treeRes.body.sessionEngagementEnabled).toBe(true);
    expect(Array.isArray(treeRes.body.officialSessions)).toBe(true);
    expect(treeRes.body.officialSessions.length).toBeGreaterThanOrEqual(1);
    expect(treeRes.body.officialSessions[0].id).toBe(officialSessionId);
    expect(treeRes.body.officialSessions[0].approvedMeetUrl).toBe(
      'https://meet.google.com/abc-defg-hij',
    );

    proofs.pillarA_gv_sessions_and_activity_chooser = {
      classOfferingId,
      officialSessionId,
      sectionId,
      activitiesCreated: {
        lessonActId,
        resourceActId,
        assignmentActId,
        quizActId,
        sessionEngagementEnabled: treeRes.body.sessionEngagementEnabled,
        officialSessionsReturnedInTree: treeRes.body.officialSessions.length,
      },
      publishedAssignmentScorePercent: 90,
      publishedQuizScorePercent: 100,
    };
  }, 90000);

  it('Pillar B (UCV2-25, 26, 35, 36, 37, 39..44): Official TeachingSession, Google Meet governance, Attendance window, 20-hex code rotation, Learner check-in & HVU correction review', async () => {
    const f = w08.f;
    const gv = api(f.teacher);
    const hv = api(f.learner);
    const hvuChecker = api(f.planningApprover);

    // 1. GV opens session attendance window
    await gv
      .post(`/api/v2/session-engagement/sessions/${officialSessionId}/attendance`)
      .send({})
      .expect(201);

    // 2. GV rotates 20-hex attendance code
    const codeRes = await gv
      .post(`/api/v2/session-engagement/sessions/${officialSessionId}/code`)
      .send({ key: key() })
      .expect(201);
    expect(codeRes.body.code).toMatch(/^[A-F0-9]{20}$/);

    // 3. Enrolled Learner checks in with the 20-hex code (concurrent duplicate yields single receipt)
    const checkinCmd = { key: key(), code: codeRes.body.code };
    const [c1, c2] = await Promise.all([
      hv
        .post(`/api/v2/session-engagement/sessions/${officialSessionId}/checkin`)
        .send(checkinCmd),
      hv
        .post(`/api/v2/session-engagement/sessions/${officialSessionId}/checkin`)
        .send(checkinCmd),
    ]);
    expect([c1.status, c2.status]).toEqual([201, 201]);
    expect(c1.body.receipt.id).toBe(c2.body.receipt.id);

    // 4. Learner submits attendance correction & independent HVU approves it
    const corrRes = await hv
      .post(`/api/v2/session-engagement/sessions/${officialSessionId}/corrections`)
      .send({
        key: key(),
        reason,
        learnerId: f.learner.id,
        baseVersion: 0,
        requestedStatus: 'PRESENT',
        evidence: 'Xác nhận có mặt đầy đủ từ đầu buổi học trực tuyến qua Google Meet',
      })
      .expect(201);

    await hvuChecker
      .post(`/api/v2/session-engagement/reviews/correction/${corrRes.body.id}`)
      .send({ key: key(), reason, decision: 'APPROVED' })
      .expect(201);

    // 5. Verify GV roster and learner session view
    const rosterRes = await gv
      .get(`/api/v2/session-engagement/sessions/${officialSessionId}/roster`)
      .expect(200);
    expect(JSON.stringify(rosterRes.body)).not.toContain(codeRes.body.code);

    const hvSessionView = await hv
      .get(`/api/v2/session-engagement/sessions/${officialSessionId}`)
      .expect(200);
    expect(hvSessionView.body.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(hvSessionView.body.attendance.result.status).toBe('PRESENT');

    proofs.pillarB_schedule_meet_and_attendance = {
      officialSessionId,
      approvedMeetUrl: hvSessionView.body.meetUrl,
      codeFormatVerified: '20-HEX',
      receiptId: c1.body.receipt.id,
      correctionId: corrRes.body.id,
      effectiveAttendanceStatus: hvSessionView.body.attendance.result.status,
    };
  }, 60000);

  it('Pillar C (UCV2-48..52): W08 Teaching Inspector dispatch, overlap rejection, shift clock IN/OUT, observation segments, TT-REPORTED report, GV dispute & HVU hours review', async () => {
    const f = w08.f;
    const g = w08.g;
    const hvuMaker = api(f.academic);

    // 1. Concurrent overlapping dispatch of same TT to 2 simultaneous sessions -> [201, 409]
    const dispatchResults = await Promise.all(
      w08.sessions.map((s) =>
        hvuMaker.post('/api/v2/inspection/assignments').send({
          sessionId: s.id,
          inspectorId: f.inspector.id,
          key: key(),
          reason,
        }),
      ),
    );
    expect(dispatchResults.map((r) => r.status).sort()).toEqual([201, 409]);
    const winIdx = dispatchResults.findIndex((r) => r.status === 201);
    inspectionAssignmentId = dispatchResults[winIdx].body.id;
    const assignedCtx = winIdx === 0 ? f : g;

    const viewAssignment = async (actor: { id: string }) =>
      (
        await api(actor)
          .get(`/api/v2/inspection/assignments/${inspectionAssignmentId}`)
          .expect(200)
      ).body;

    const sendCmd = async (
      actor: { id: string },
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      const v = await viewAssignment(actor);
      return api(actor)
        .post(`/api/v2/inspection/assignments/${inspectionAssignmentId}/commands`)
        .send({
          action,
          version: v.assignment.version,
          key: key(),
          reason,
          ...extra,
        });
    };

    // 2. TT shift clock IN
    expect((await sendCmd(f.inspector, 'IN')).status).toBe(201);

    // 3. TT starts observation segment, waits >1s, stops observation segment
    expect((await sendCmd(f.inspector, 'START')).status).toBe(201);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await sendCmd(f.inspector, 'STOP')).status).toBe(201);

    // 4. TT submits supervision report (TT-REPORTED)
    expect(
      (
        await sendCmd(f.inspector, 'REPORT', {
          presence: 'PRESENT',
          conditions: 'Giảng viên mở lớp đúng giờ, tương tác tốt với học viên trên Google Meet.',
        })
      ).status,
    ).toBe(201);

    // 5. HVU reviews and approves teaching hours
    expect(
      (
        await sendCmd(f.academic, 'REVIEW', {
          disposition: 'PARTIAL',
          approvedSeconds: 1,
        })
      ).status,
    ).toBe(201);

    // 6. GV submits dispute and HVU issues compensating review
    expect((await sendCmd(assignedCtx.teacher, 'DISPUTE')).status).toBe(201);
    expect(
      (
        await sendCmd(f.academic, 'REVIEW', {
          disposition: 'APPROVE',
          approvedSeconds: 1,
        })
      ).status,
    ).toBe(201);

    // 7. TT shift clock OUT + shift clock CORRECTION + HVU CORRECTION_REVIEW
    expect((await sendCmd(f.inspector, 'OUT')).status).toBe(201);
    expect(
      (
        await sendCmd(f.inspector, 'CORRECTION', {
          kind: 'WRONG_DEVICE',
          evidence: 'Đăng nhập ca trực từ thiết bị dự phòng của bộ phận Thanh tra.',
        })
      ).status,
    ).toBe(201);

    const vAfterCorr = await viewAssignment(f.inspector);
    const corrId = vAfterCorr.corrections[0].id;
    expect(
      (
        await sendCmd(f.academic, 'CORRECTION_REVIEW', {
          correctionId: corrId,
          disposition: 'ACCEPT',
        })
      ).status,
    ).toBe(201);

    const finalView = await viewAssignment(f.inspector);
    expect(finalView.reports[0].attestation).toBe('TT-REPORTED');
    expect(finalView.approvedSeconds).toBe(1);
    expect(finalView.corrections[0].decision.disposition).toBe('ACCEPT');

    // Verify GV cannot see TT personnel shift clocks
    const gvView = await viewAssignment(assignedCtx.teacher);
    expect(gvView.clocks).toEqual([]);

    proofs.pillarC_w08_teaching_inspection = {
      inspectionAssignmentId,
      overlapStatuses: dispatchResults.map((r) => r.status).sort(),
      observedSeconds: finalView.observedSeconds,
      approvedSeconds: finalView.approvedSeconds,
      reportAttestation: finalView.reports[0].attestation,
      disputeCount: finalView.disputes.length,
      decisionCount: finalView.decisions.length,
      shiftCorrectionDisposition: finalView.corrections[0].decision.disposition,
    };
  }, 60000);

  it('Pillar D (UCV2-28, 46, 47): W09 Completion Policy creation, Maker-Checker approval, W03/W06/W07 evaluation, eligibility review, certificate issuance, idempotent replay, revocation & learner/public lookup', async () => {
    const f = w08.f;
    const hvuMaker = api(f.academic);
    const hvuChecker = api(f.planningApprover);
    const hv = api(f.learner);

    // 1. HVU Maker creates a W09 Completion Policy (labeled isTestPolicy: true on disposable DB)
    const createPol = await hvuMaker
      .post('/api/v2/certificates/policies')
      .send({
        courseId: f.classroom.courseId,
        classOfferingId: f.classroom.id,
        code: 'SE-TOEIC-B1-POLICY-2026',
        title: 'Chuẩn hoàn thành TOEIC Intermediate B1 (TEST_DISPOSABLE)',
        description:
          'Yêu cầu điểm trung bình W03 >= 70%, chuyên cần W06 >= 80%, và hồ sơ ghi danh W07 hợp lệ.',
        isTestPolicy: true,
        reason,
        criteria: [
          {
            criterionId: 'CRIT-W03-GRADE-70',
            domain: 'W03_GRADE',
            label: 'Điểm học thuật đã công bố (Assignment + Quiz) >= 70%',
            required: true,
            minNumericValue: 70,
          },
          {
            criterionId: 'CRIT-W06-ATTENDANCE-80',
            domain: 'W06_ATTENDANCE',
            label: 'Tỷ lệ điểm danh buổi học chính thức (W06) >= 80%',
            required: true,
            minNumericValue: 80,
          },
          {
            criterionId: 'CRIT-W07-ENTITLEMENT',
            domain: 'W07_ENTITLEMENT',
            label: 'Hồ sơ ghi danh & nghĩa vụ học phí (W07) hợp lệ',
            required: true,
          },
        ],
      })
      .expect(201);
    policyId = createPol.body.id;
    expect(createPol.body.state).toBe('DRAFT');

    // 2. Maker-checker: HVU Maker cannot self-approve own policy (403)
    await hvuMaker
      .post(`/api/v2/certificates/policies/${policyId}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(403);

    // 3. Independent HVU Checker approves the policy (201)
    const approvedPol = await hvuChecker
      .post(`/api/v2/certificates/policies/${policyId}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(201);
    expect(approvedPol.body.state).toBe('APPROVED');

    // 4. Evaluate primary learner (who has 95% W03 grade, 100% W06 attendance, ACTIVE W07 enrollment)
    const evalPrimary = await hvuMaker
      .get(`/api/v2/certificates/enrollments/${primaryEnrollmentId}/evaluate`)
      .expect(200);
    expect(evalPrimary.body.status).toBe('ELIGIBLE_FOR_REVIEW');
    expect(
      evalPrimary.body.evaluation.criteria.every(
        (c: { status: string }) => c.status === 'SATISFIED',
      ),
    ).toBe(true);

    // 5. Evaluate secondary learner (who has 0 grades & 0 attendance receipts) -> NOT eligible
    const evalSecondary = await hvuMaker
      .get(`/api/v2/certificates/enrollments/${secondaryEnrollmentId}/evaluate`)
      .expect(200);
    expect(evalSecondary.body.status).not.toBe('ELIGIBLE_FOR_REVIEW');

    // Attempting to submit ELIGIBLE review for ineligible secondary learner fails closed (409)
    await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: secondaryEnrollmentId,
        policyId,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(409);

    // 6. HVU Maker submits ELIGIBLE review for primary learner (201)
    const reviewRes = await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: primaryEnrollmentId,
        policyId,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(201);
    const reviewId = reviewRes.body.id as string;

    // 7. Maker-checker on issuance: HVU Maker (who reviewed) cannot issue the certificate (403)
    const issueKey = `issue-key-${randomUUID()}`;
    await hvuMaker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: primaryEnrollmentId,
        reviewId,
        idempotencyKey: issueKey,
        reason,
      })
      .expect(403);

    // 8. Independent HVU Checker issues the certificate (201)
    const issuedRes = await hvuChecker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: primaryEnrollmentId,
        reviewId,
        idempotencyKey: issueKey,
        reason,
      })
      .expect(201);
    issuedCertificateId = issuedRes.body.id;
    issuedCertificateCode = issuedRes.body.certificateCode;
    expect(issuedRes.body.status).toBe('ISSUED');
    expect(issuedCertificateCode).toMatch(/^SE-CERT-TEST-2026-[A-F0-9]{8}$/);

    // 9. Idempotent replay with same key returns same certificate without duplicate row
    const replayRes = await hvuChecker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: primaryEnrollmentId,
        reviewId,
        idempotencyKey: issueKey,
        reason,
      })
      .expect(201);
    expect(replayRes.body.id).toBe(issuedCertificateId);
    expect(replayRes.body.idempotentReplay).toBe(true);

    // 10. Create a second test policy (with W07_ENTITLEMENT mandatory only) to test certificate REVOCATION lifecycle on secondaryEnrollmentId
    const revokeTestPol = await hvuMaker
      .post('/api/v2/certificates/policies')
      .send({
        courseId: f.classroom.courseId,
        code: 'SE-REVOKE-TEST-POLICY-2026',
        title: 'Chính sách kiểm thử thu hồi chứng chỉ (TEST_DISPOSABLE)',
        description: 'Chính sách dùng riêng để kiểm thử luồng thu hồi chứng chỉ có lý do kiểm toán.',
        isTestPolicy: true,
        reason,
        criteria: [
          {
            criterionId: 'CRIT-W07-ONLY',
            domain: 'W07_ENTITLEMENT',
            label: 'Hồ sơ ghi danh hợp lệ',
            required: true,
          },
        ],
      })
      .expect(201);
    await hvuChecker
      .post(`/api/v2/certificates/policies/${revokeTestPol.body.id}/review`)
      .send({ decision: 'APPROVED', reason })
      .expect(201);

    const secReview = await hvuMaker
      .post('/api/v2/certificates/reviews')
      .send({
        enrollmentId: secondaryEnrollmentId,
        policyId: revokeTestPol.body.id,
        decision: 'ELIGIBLE',
        reason,
      })
      .expect(201);

    const secIssued = await hvuChecker
      .post('/api/v2/certificates/issue')
      .send({
        enrollmentId: secondaryEnrollmentId,
        reviewId: secReview.body.id,
        idempotencyKey: `issue-sec-${randomUUID()}`,
        reason,
      })
      .expect(201);
    revokedCertificateId = secIssued.body.id;
    revokedCertificateCode = secIssued.body.certificateCode;

    const revokedRes = await hvuChecker
      .post(`/api/v2/certificates/${revokedCertificateId}/revoke`)
      .send({
        reason: 'Thu hồi chứng chỉ kiểm thử theo yêu cầu hậu kiểm học vụ (Audit Revocation Proof).',
      })
      .expect(201);
    expect(revokedRes.body.status).toBe('REVOKED');

    // 11. Verify Learner GET /api/v2/certificates/readiness shows ISSUED certificate & satisfied criteria
    const readinessRes = await hv.get('/api/v2/certificates/readiness').expect(200);
    expect(readinessRes.body.issuanceAvailable).toBe(true);
    const classRecord = readinessRes.body.enrollments.find(
      (r: { classId: string }) => r.classId === classOfferingId,
    );
    expect(classRecord).toBeDefined();
    expect(classRecord.assessment).toBe('ISSUED');
    expect(classRecord.certificate.certificateCode).toBe(issuedCertificateCode);

    // 12. Verify Public Lookup for both ISSUED and REVOKED certificates
    const lookupIssued = await request(d.app.getHttpServer())
      .get(`/api/v2/certificates/lookup/${issuedCertificateCode}`)
      .expect(200);
    expect(lookupIssued.body.status).toBe('ISSUED');
    expect(lookupIssued.body.valid).toBe(true);

    const lookupRevoked = await request(d.app.getHttpServer())
      .get(`/api/v2/certificates/lookup/${revokedCertificateCode}`)
      .expect(200);
    expect(lookupRevoked.body.status).toBe('REVOKED');
    expect(lookupRevoked.body.valid).toBe(false);

    // SQL readbacks
    const [policyCount] = await d.prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM w09_completion_policies
    `;
    const [certCount] = await d.prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM w09_certificates
    `;
    const [eventCount] = await d.prisma.$queryRaw<{ c: number }[]>`
      SELECT count(*)::int AS c FROM w09_certificate_events
    `;

    proofs.pillarD_w09_completion_and_certificates = {
      policyId,
      primaryEnrollmentId,
      issuedCertificateId,
      issuedCertificateCode,
      revokedCertificateId,
      revokedCertificateCode,
      learnerReadinessState: classRecord.assessment,
      lookupIssuedValid: lookupIssued.body.valid,
      lookupRevokedValid: lookupRevoked.body.valid,
    };
    proofs.sqlReadbacks = {
      w09CompletionPoliciesCount: policyCount.c,
      w09CertificatesCount: certCount.c,
      w09CertificateEventsCount: eventCount.c,
    };
  }, 60000);

  it('Browser CDP Verification (1440x900 Desktop & 390x844 Mobile): Captures all 10 Wave 02 UI proofs with zero horizontal overflow', async () => {
    const f = w08.f;
    await d.app.listen(0, '127.0.0.1');
    const apiPort = (d.app.getHttpServer().address() as AddressInfo).port;

    const browserSummary = await runArgonWave02BrowserVerification({
      apiPort,
      password: f.password,
      actors: {
        teacherEmail: f.teacher.email,
        learnerEmail: f.learner.email,
        inspectorEmail: f.inspector.email,
        hvuMakerEmail: f.academic.email,
        hvuCheckerEmail: f.planningApprover.email,
      },
      ids: {
        classOfferingId,
        sessionId: officialSessionId,
        inspectionAssignmentId,
        enrollmentId: primaryEnrollmentId,
        policyId,
        certificateId: issuedCertificateId,
        certificateCode: issuedCertificateCode,
        revokedCertificateCode,
      },
    });

    expect(browserSummary.totalScreenshots).toBe(10);
    expect(browserSummary.zeroOverflowAllCaptures).toBe(true);
    proofs.browserVerification = browserSummary;
  }, 120000);
});
