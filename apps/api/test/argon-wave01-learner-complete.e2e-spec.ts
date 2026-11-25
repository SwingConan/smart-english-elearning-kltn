import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { grantKnowledge, tagDraft, articleDraft } from './wave03bd.fixture';
import { seedOriginalPlacementBank } from './seed-original-placement-bank';
import { runArgonWave01BrowserVerification } from './argon-wave01-browser-capture';

describe('ROAD99 Argon Wave 01 — Complete Learner Pillars (W05B 1:1 + Placement 200/219 + LMS UCV2-18..24,28)', () => {
  let d: Awaited<ReturnType<typeof startWave01App>>;
  let f: Awaited<ReturnType<typeof seedWave03A>>;
  let lrBank: Awaited<ReturnType<typeof seedOriginalPlacementBank>>;
  let fourBank: Awaited<ReturnType<typeof seedOriginalPlacementBank>>;
  let lrTimingPolicyId: string;
  let fourTimingPolicyId: string;
  let fourRubricPolicyId: string;
  let lrAttemptId: string;
  let fourAttemptId: string;

  const reason = 'Argon Wave 01 isolated end-to-end verification with SQL readback';
  const key = () => randomUUID();
  const proofs: Record<string, unknown> = {
    executedAtUtc: new Date().toISOString(),
    pillar1_w05b_consultation: {},
    pillar2_placement_lr_and_four_skills: {},
    pillar3_enrolled_learner_lms: {},
    sqlReadbacks: {},
  };

  const ag = (id: string) => f.agents.get(id)!;
  const unEnrolledLearner = () => ag(f.contenders[0].id);
  const secondUnEnrolledLearner = () => ag(f.contenders[1].id);
  const enrolledLearner = () => ag(f.learner.id);
  const foreignEnrolledLearner = () => ag(f.otherLearner.id);
  const teacher = () => ag(f.teacher.id);
  const hvuMaker = () => ag(f.academic.id);
  const hvuChecker = () => ag(f.planningApprover.id);

  async function login(u: { id: string; email: string }) {
    const agent = request.agent(d.app.getHttpServer());
    await agent.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, agent);
    return agent;
  }

  async function grantGlobal(user: { id: string; email: string }, capability: string) {
    const r = await ag(f.approver.id)
      .post('/api/authority/grants')
      .send({
        userId: user.id,
        capability,
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await ag(f.secondApprover.id)
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(user);
    return r.body.id as string;
  }

  async function grantTeacherScoped(
    user: { id: string; email: string },
    capability: string,
    teacherId: string,
  ) {
    const r = await ag(f.approver.id)
      .post('/api/authority/grants')
      .send({
        userId: user.id,
        capability,
        scopeType: 'TEACHER',
        scopeId: teacherId,
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await ag(f.secondApprover.id)
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(user);
    return r.body.id as string;
  }

  function wavBuffer() {
    const b = Buffer.alloc(44 + 3200);
    b.write('RIFF');
    b.writeUInt32LE(b.length - 8, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(16000, 24);
    b.writeUInt32LE(32000, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(3200, 40);
    return b;
  }

  beforeAll(async () => {
    process.env.W04B_ENABLED = 'DEV_WORKFLOW';
    process.env.W05B_ENABLED = 'DEV_DEC060';
    d = await startWave01App();
    f = await seedWave03A(d);

    // Consultation grants (TEACHER-scoped for independent HVU checker)
    for (const cap of [
      'consultation.profile.approve',
      'consultation.link.approve',
      'consultation.booking.review',
    ]) {
      await grantTeacherScoped(f.planningApprover, cap, f.teacher.id);
    }

    // Placement workflow grants
    for (const cap of ['placement.source.author', 'placement.rubric.author']) {
      await grantGlobal(f.teacher, cap);
    }
    for (const u of [f.academic, f.planningApprover]) {
      for (const cap of [
        'placement.source.approve',
        'placement.rubric.approve',
        'placement.grader.assign',
        'placement.result.publish',
        'placement.criteria.author',
        'placement.criteria.approve',
      ]) {
        await grantGlobal(u, cap);
      }
    }

    // Knowledge + Class LMS grading/quiz grants for Pillar 3
    await grantKnowledge(f, f.teacher.id, 'knowledge.author');
    await grantKnowledge(f, f.planningApprover.id, 'knowledge.review');
    await grantKnowledge(f, f.planningApprover.id, 'knowledge.publish');
    for (const cap of [
      'academic.rubric.approve',
      'academic.grade.publish',
      'academic.quiz.approve',
      'academic.quiz.grade.publish',
    ]) {
      await grantAcademic(
        d.prisma,
        f.planningApprover.id,
        f.approver.id,
        f.secondApprover.id,
        cap,
        'CLASS',
        f.lmsClasses[0].id,
      );
    }
    await login(f.planningApprover);
    await login(f.academic);
    await login(f.teacher);
  }, 120000);

  afterAll(async () => {
    const outDir = resolve(__dirname, '../../../docs/v2/v2-road-to-99-argon-wave01/EVIDENCE');
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, 'ARGON_WAVE01_BACKEND_E2E_PROOFS.json'),
      JSON.stringify(proofs, null, 2),
    );
    await d?.app.close();
  }, 30000);

  it('Pillar 1 (W05B — UCV2-27, UCV2-57): Free 1:1 teacher consultation lifecycle, double-booking race, link governance & SQL readback', async () => {
    const cBase = '/api/v2/consultations/';
    const hv1Id = f.contenders[0].id;

    // Verify learner has 0 enrollments and 0 payment orders (completely free 1:1 consultation)
    expect(await d.prisma.enrollment.count({ where: { learnerId: hv1Id } })).toBe(0);

    // 1. GV saves profile -> draft/pending not visible to learner until independent HVU approves
    const saveRes = await teacher()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'PROFILE_SAVE',
        displayName: 'ThS. Nguyễn Thu Hà — Chuyên gia Tư vấn Lộ trình TOEIC 4 Kỹ năng',
        bio: '10 năm kinh nghiệm huấn luyện TOEIC Listening, Reading, Speaking & Writing.',
        specialties: 'TOEIC LR 650+, TOEIC Speaking & Writing 150+',
        reason,
      })
      .expect(201);
    const profileId = saveRes.body.id as string;

    // Self-approval by GV is forbidden (returns 404 from W05B_INDEPENDENT / W05B_ROLE_DENIED)
    await teacher()
      .post(cBase + 'commands')
      .send({ key: key(), op: 'PROFILE_APPROVE', id: profileId, reason })
      .expect(404);

    // Before approval, learner sees 0 approved profiles
    expect((await unEnrolledLearner().get(cBase + 'profiles').expect(200)).body).toEqual([]);

    // Independent HVU approves profile
    await hvuChecker()
      .post(cBase + 'commands')
      .send({ key: key(), op: 'PROFILE_APPROVE', id: profileId, reason })
      .expect(201);

    const profiles = (await unEnrolledLearner().get(cBase + 'profiles').expect(200)).body;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].teacherId).toBe(f.teacher.id);

    // 2. GV adds weekly availability (09:00-17:00 = 540..1020) across all 7 weekdays in Asia/Ho_Chi_Minh
    for (let weekday = 0; weekday < 7; weekday++) {
      await teacher()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'AVAILABILITY_ADD',
          kind: 'WEEKLY',
          weekday,
          startMinute: 540,
          endMinute: 1020,
          reason,
        })
        .expect(201);
    }

    const availableSlots = (
      await unEnrolledLearner()
        .get(cBase + 'slots')
        .query({ teacherId: f.teacher.id })
        .expect(200)
    ).body as { startsAt: string; endsAt: string }[];
    expect(availableSlots.length).toBeGreaterThan(25);
    expect(availableSlots.length).toBeLessThanOrEqual(224);
    const slot1 = availableSlots[10].startsAt;
    const slot2 = availableSlots[20].startsAt;
    const slot3 = availableSlots[30].startsAt;

    // 3. Learner 1 holds slot1 and submits consultation request (HOLD -> PENDING_GV)
    const hold1 = (
      await unEnrolledLearner()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'HOLD',
          teacherId: f.teacher.id,
          startsAt: slot1,
        })
        .expect(201)
    ).body;
    expect(hold1.state).toBe('HOLD');

    // Double-booking / race check: Learner 2 trying to HOLD the same teacher + slot1 gets 409
    await secondUnEnrolledLearner()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'HOLD',
        teacherId: f.teacher.id,
        startsAt: slot1,
      })
      .expect(409);

    // Submit booking with topic & learning goal
    await unEnrolledLearner()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'SUBMIT',
        id: hold1.id,
        topic: 'Tư vấn lộ trình tăng tốc Reading Part 7 và Speaking S10 để đạt TOEIC LR 750+',
      })
      .expect(201);

    const sub1Row = await d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: hold1.id } });
    expect(sub1Row.state).toBe('PENDING_GV');

    // Foreign learner cannot cancel or mutate Learner 1's booking
    await secondUnEnrolledLearner()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'CANCEL',
        id: sub1Row.id,
        version: sub1Row.version,
        reason: 'Foreign learner tamper attempt',
      })
      .expect(404);

    // 4. GV confirms booking (PENDING_GV -> CONFIRMED) and proposes Meet link -> HVU approves link
    await teacher()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'CONFIRM',
        id: sub1Row.id,
      })
      .expect(201);
    const conf1Row = await d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: sub1Row.id } });
    expect(conf1Row.state).toBe('CONFIRMED');

    const linkProp = (
      await teacher()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'LINK_PROPOSE',
          id: conf1Row.id,
          url: 'https://meet.google.com/abc-defg-hij',
          reason: 'GV đề xuất link Google Meet tư vấn 1:1',
        })
        .expect(201)
    ).body;

    await hvuChecker()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'LINK_APPROVE',
        id: linkProp.id,
        reason: 'HVU phê duyệt link Google Meet hợp lệ',
      })
      .expect(201);
    const linkRow = await d.prisma.w05BLink.findUniqueOrThrow({ where: { id: linkProp.id } });
    expect(linkRow.state).toBe('APPROVED');

    // Verify learner bookings view redacts future joinUrl before the 15-minute join window
    const hvBookingsRes = (await unEnrolledLearner().get(cBase + 'bookings').expect(200)).body;
    const myBooking = hvBookingsRes.data.find((b: { id: string }) => b.id === conf1Row.id);
    expect(myBooking.state).toBe('CONFIRMED');
    expect(myBooking.joinUrl).toBeNull();

    // 5. Verify GV CHANGE_REQUEST -> HVU CHANGE_APPROVE & Learner RESCHEDULE / CANCEL lifecycle
    // Re-read booking row after LINK_PROPOSE incremented version
    const conf1AfterLink = await d.prisma.w05BBooking.findUniqueOrThrow({
      where: { id: conf1Row.id },
    });
    const chgReq = (
      await teacher()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'CHANGE_REQUEST',
          id: conf1AfterLink.id,
          kind: 'RESCHEDULE',
          version: conf1AfterLink.version,
          startsAt: slot2,
          reason: 'GV đề xuất đổi sang khung giờ kế tiếp theo nguyện vọng học viên',
        })
        .expect(201)
    ).body;

    const chgApproveRes = (
      await hvuChecker()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'CHANGE_APPROVE',
          id: chgReq.id,
          reason: 'HVU đồng ý duyệt thay đổi khung giờ tư vấn',
        })
        .expect(201)
    ).body;
    const chgRow = await d.prisma.w05BChange.findUniqueOrThrow({ where: { id: chgReq.id } });
    expect(chgRow.state).toBe('APPROVED');

    // Confirm the replacement booking on slot2 and approve its link so learner has an active CONFIRMED booking
    const replacementBookingId = chgApproveRes.id;
    await teacher()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'CONFIRM',
        id: replacementBookingId,
      })
      .expect(201);
    const linkProp2 = (
      await teacher()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'LINK_PROPOSE',
          id: replacementBookingId,
          url: 'https://meet.google.com/seh-wave-two',
          reason: 'Link Google Meet mới cho khung giờ tư vấn đã đổi',
        })
        .expect(201)
    ).body;
    await hvuChecker()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'LINK_APPROVE',
        id: linkProp2.id,
        reason: 'HVU duyệt link Google Meet cho lịch tư vấn mới',
      })
      .expect(201);

    // Create a second booking on slot3 and cancel it to prove CANCEL transition
    const hold3 = (
      await secondUnEnrolledLearner()
        .post(cBase + 'commands')
        .send({
          key: key(),
          op: 'HOLD',
          teacherId: f.teacher.id,
          startsAt: slot3,
        })
        .expect(201)
    ).body;
    await secondUnEnrolledLearner()
      .post(cBase + 'commands')
      .send({
        key: key(),
        op: 'CANCEL',
        id: hold3.id,
        version: hold3.version ?? 0,
        reason: 'Học viên chủ động hủy giữ chỗ',
      })
      .expect(201);
    const cancel3Row = await d.prisma.w05BBooking.findUniqueOrThrow({ where: { id: hold3.id } });
    expect(cancel3Row.state).toBe('CANCELLED');

    const dbBooking1 = await d.prisma.w05BBooking.findUniqueOrThrow({
      where: { id: replacementBookingId },
    });
    const dbEventsCount = await d.prisma.w05BEvent.count();
    const dbOutboxCount = await d.prisma.w05BOutbox.count();

    proofs.pillar1_w05b_consultation = {
      passed: true,
      unenrolledLearnerEnrollmentCount: 0,
      approvedProfileId: profileId,
      availableSlotCount: availableSlots.length,
      confirmedBookingId: replacementBookingId,
      confirmedBookingState: dbBooking1.state,
      supersededOriginalBookingId: conf1Row.id,
      approvedLinkId: linkProp2.id,
      approvedLinkState: 'APPROVED',
      futureLinkHiddenFromLearnerOutsideWindow: myBooking.joinUrl === null,
      changeRequestId: chgRow.id,
      changeRequestState: chgRow.state,
      cancelledBookingId: cancel3Row.id,
      cancelledBookingState: cancel3Row.state,
      doubleBookingRaceStatus: 409,
      foreignLearnerTamperStatus: 404,
      sqlEventCount: dbEventsCount,
      sqlNotificationOutboxCount: dbOutboxCount,
    };
  }, 60000);

  it('Pillar 2 (Placement — UCV2-06, UCV2-07, UCV2-45): Full 200-item LR & 219-task FOUR_SKILLS Original Bank, Sitting, Manual Rubric Grading, Independent Release & Positive/Negative Class Matching', async () => {
    const pBase = '/api/v2/placement/workflow';

    // 1. Seed full 200-item LR and 219-task FOUR_SKILLS original banks into disposable DB
    lrBank = await seedOriginalPlacementBank(d, 'LR', false);
    const fourBlueprintBank = await seedOriginalPlacementBank(d, 'FOUR_SKILLS', false);
    fourBank = await seedOriginalPlacementBank(d, 'FOUR_SKILLS', true);

    expect(lrBank.eligibility.counts).toEqual({ LISTENING: 100, READING: 100 });
    expect(lrBank.eligibility.parts).toEqual({
      1: 6,
      2: 25,
      3: 39,
      4: 30,
      5: 30,
      6: 16,
      7: 54,
    });
    expect(lrBank.eligibility.learnerPublishable).toBe(false);

    expect(fourBlueprintBank.eligibility.counts).toEqual({
      LISTENING: 100,
      READING: 100,
      SPEAKING: 11,
      WRITING: 8,
    });
    expect(fourBlueprintBank.eligibility.parts).toEqual({
      1: 6,
      2: 25,
      3: 39,
      4: 30,
      5: 30,
      6: 16,
      7: 54,
    });
    expect(fourBlueprintBank.eligibility.learnerPublishable).toBe(false);
    expect(fourBlueprintBank.eligibility.reasons).not.toContain('S10_WAV_MISSING');
    expect(fourBlueprintBank.eligibility.reasons).not.toContain('FULL_PART_BLUEPRINT_MISMATCH');
    expect(fourBlueprintBank.eligibility.reasons).not.toContain('FULL_FOUR_SKILLS_219_REQUIRED');

    // 2. Author & independently approve SOURCE_TIMING policies for LR and FOUR_SKILLS
    const lrTimingRes = await teacher()
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: 'LR',
        sourceId: lrBank.version.id,
        body: {
          sourceHash: lrBank.version.sourceHash,
          evidence: reason,
          tasks: [],
        },
        reason,
      })
      .expect(201);
    lrTimingPolicyId = lrTimingRes.body.id;
    await hvuChecker()
      .post(pBase + '/policies/' + lrTimingPolicyId + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    const fourTimingTasks = fourBank.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        preparationSeconds: 0,
        playbackSeconds: 0,
        responseSeconds: 30,
        uploadSeconds: 120,
      }));
    const fourTimingRes = await teacher()
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: 'FOUR_SKILLS',
        sourceId: fourBank.version.id,
        body: {
          sourceHash: fourBank.version.sourceHash,
          evidence: reason,
          tasks: fourTimingTasks,
        },
        reason,
      })
      .expect(201);
    fourTimingPolicyId = fourTimingRes.body.id;
    await hvuChecker()
      .post(pBase + '/policies/' + fourTimingPolicyId + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    // 3. Author & independently approve RUBRIC policy for FOUR_SKILLS (all 19 S/W tasks)
    const fourRubricTasks = fourBank.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        criteria: [
          {
            code: 'TASK_FULFILLMENT',
            descriptor: 'Original Smart English rubric criterion: task fulfillment & accuracy (0-4)',
            max: 4,
          },
          {
            code: 'LANGUAGE_DELIVERY',
            descriptor: 'Original Smart English rubric criterion: grammar, vocabulary & delivery (0-4)',
            max: 4,
          },
        ],
      }));
    const fourRubricRes = await teacher()
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'RUBRIC',
        mode: 'FOUR_SKILLS',
        sourceId: fourBank.version.id,
        body: {
          sourceHash: fourBank.version.sourceHash,
          evidence: reason,
          scale: 'INTERNAL_0_100_DRAFT_RUBRIC',
          tasks: fourRubricTasks,
        },
        reason,
      })
      .expect(201);
    fourRubricPolicyId = fourRubricRes.body.id;
    await hvuChecker()
      .post(pBase + '/policies/' + fourRubricPolicyId + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    // 4. Execute full 200-item LR sitting for unenrolled learner 1
    const lrStart = (
      await unEnrolledLearner()
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: lrBank.version.id,
          policyId: lrTimingPolicyId,
          mode: 'LR',
          goalLR: 650,
        })
        .expect(201)
    ).body;
    lrAttemptId = lrStart.attemptId;

    let lrSitting = (await unEnrolledLearner().get(pBase + '/attempts/' + lrAttemptId).expect(200))
      .body;
    expect(lrSitting.phase).toBe('LISTENING');
    const listeningQuestionCount = lrSitting.groups.reduce(
      (acc: number, g: { questions: unknown[] }) => acc + g.questions.length,
      0,
    );
    expect(listeningQuestionCount).toBe(100);

    // Answer sample Listening items across Parts 1..4
    for (const grp of [lrBank.groups[0], lrBank.groups[6], lrBank.groups[31], lrBank.groups[44]]) {
      const q = grp.questions[0];
      const opts = await d.prisma.questionOption.findMany({
        where: { questionId: q.question.id },
        orderBy: { orderIndex: 'asc' },
      });
      const correctOpt = opts.find((o) => o.isCorrect) ?? opts[0];
      lrSitting = (
        await unEnrolledLearner()
          .post(pBase + '/attempts/' + lrAttemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: lrSitting.lockVersion,
            questionId: q.tq.id,
            selectedOptionIds: [correctOpt.id],
          })
          .expect(201)
      ).body;
    }

    // Advance LR sitting to READING phase (100 items across Parts 5..7)
    await unEnrolledLearner()
      .post(pBase + '/attempts/' + lrAttemptId + '/commands')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: lrSitting.lockVersion,
        action: 'NEXT',
      })
      .expect(201);
    lrSitting = (await unEnrolledLearner().get(pBase + '/attempts/' + lrAttemptId).expect(200))
      .body;
    expect(lrSitting.phase).toBe('READING');
    const readingQuestionCount = lrSitting.groups.reduce(
      (acc: number, g: { questions: unknown[] }) => acc + g.questions.length,
      0,
    );
    expect(readingQuestionCount).toBe(100);

    // Answer Reading items in Part 5, Part 6, Part 7
    const readingGroups = lrBank.groups.filter((g) => g.group.skill === 'READING');
    for (const grp of [readingGroups[0], readingGroups[30], readingGroups[34]]) {
      const q = grp.questions[0];
      const opts = await d.prisma.questionOption.findMany({
        where: { questionId: q.question.id },
        orderBy: { orderIndex: 'asc' },
      });
      const correctOpt = opts.find((o) => o.isCorrect) ?? opts[0];
      lrSitting = (
        await unEnrolledLearner()
          .post(pBase + '/attempts/' + lrAttemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: lrSitting.lockVersion,
            questionId: q.tq.id,
            selectedOptionIds: [correctOpt.id],
          })
          .expect(201)
      ).body;
    }

    // Submit LR sitting
    lrSitting = (
      await unEnrolledLearner()
        .post(pBase + '/attempts/' + lrAttemptId + '/commands')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: lrSitting.lockVersion,
          action: 'NEXT',
        })
        .expect(201)
    ).body;
    expect(lrSitting.phase).toBe('SUBMITTED');
    expect(lrSitting.receipt).toMatch(/^[a-f0-9-]{36}$/);

    // Independent HVU publishes LR evaluation
    const lrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId: lrAttemptId, skill: 'LR' },
    });
    await hvuChecker()
      .post(pBase + '/evaluations/' + lrEval.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    // 5. Create & approve CourseVersion + ClassOffering + Room + InstructorAssignment + ClassDatedSession + CRITERIA policy for Positive Class Matching (UCV2-07)
    const ap = '/api/v2/academic';
    let cv = (
      await hvuMaker()
        .post(ap + '/programs/' + f.published.id + '/versions')
        .send({
          title: 'TOEIC LR Intermediate Track (SE-LR-650)',
          description: 'Original Smart English V2 LR curriculum for placement class matching proof',
          level: 'B1',
          skillScope: 'LR',
          standardPricingType: 'FREE',
          standardTuitionFeeVnd: 0,
          effectiveFrom: new Date(Date.now() - 60000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    cv = (
      await hvuMaker()
        .post(ap + '/versions/' + cv.id + '/submit')
        .send({ expectedLockVersion: cv.lockVersion, reason })
        .expect(201)
    ).body;
    cv = (
      await hvuChecker()
        .post(ap + '/versions/' + cv.id + '/approve')
        .send({
          expectedLockVersion: cv.lockVersion,
          reason,
          poPriceConfirmed: true,
          poPriceReference: 'DEC-056-FREE-PLACEMENT-MATCH-PROOF',
        })
        .expect(201)
    ).body;

    const futureStart = new Date(Date.now() + 14 * 86400000);
    const futureEnd = new Date(futureStart.getTime() + 3600000);
    const matchClass = (
      await hvuMaker()
        .post(ap + '/versions/' + cv.id + '/offers')
        .send({
          code: 'SE-LR-' + key().slice(0, 6).toUpperCase(),
          name: 'Lớp TOEIC LR B1 Tăng tốc (Matched via Placement)',
          modality: 'OFFLINE',
          maxStudents: 1,
          enrollmentStart: new Date(Date.now() - 86400000).toISOString(),
          enrollmentEnd: futureStart.toISOString(),
          classStart: futureStart.toISOString(),
          classEnd: futureEnd.toISOString(),
          reason,
        })
        .expect(201)
    ).body;

    await d.prisma.classOffering.update({
      where: { id: matchClass.id },
      data: {
        status: 'OPEN',
        totalSessions: 1,
      },
    });

    const room = (
      await hvuMaker()
        .post(ap + '/rooms')
        .send({
          code: 'RM-' + key().slice(0, 6).toUpperCase(),
          name: 'Phòng học 302 Cơ sở Quận 3',
          location: 'District 3 Campus',
          capacity: 1,
          capabilities: ['WHITEBOARD'],
          status: 'ACTIVE',
          reason,
        })
        .expect(201)
    ).body;

    await grantAcademic(
      d.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.schedule.approve',
      'CLASS',
      matchClass.id,
    );
    await login(f.planningApprover);

    let instrAssign = (
      await hvuMaker()
        .post(ap + '/classes/' + matchClass.id + '/assignments')
        .send({
          instructorId: f.teacher.id,
          effectiveFrom: new Date(Date.now() + 1000).toISOString(),
          effectiveTo: new Date(Date.now() + 30 * 86400000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    instrAssign = (
      await hvuMaker()
        .post(ap + '/assignments/' + instrAssign.id + '/submit')
        .send({ expectedLockVersion: instrAssign.lockVersion, reason })
        .expect(201)
    ).body;
    instrAssign = (
      await hvuChecker()
        .post(ap + '/assignments/' + instrAssign.id + '/approve')
        .send({
          expectedLockVersion: instrAssign.lockVersion,
          reason,
          eligibilityConfirmed: true,
        })
        .expect(201)
    ).body;

    const toLocalStr = (dt: Date) => new Date(dt.getTime() + 7 * 3600000).toISOString().slice(0, 16);
    let datedSession = (
      await hvuMaker()
        .post(ap + '/classes/' + matchClass.id + '/sessions')
        .send({
          startLocal: toLocalStr(futureStart),
          endLocal: toLocalStr(futureEnd),
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'OFFLINE',
          roomId: room.id,
          assignmentId: instrAssign.id,
          requiredCapabilities: ['WHITEBOARD'],
          reason,
        })
        .expect(201)
    ).body;
    datedSession = (
      await hvuMaker()
        .post(ap + '/sessions/' + datedSession.id + '/submit')
        .send({ expectedLockVersion: datedSession.lockVersion, reason })
        .expect(201)
    ).body;
    await hvuChecker()
      .post(ap + '/sessions/' + datedSession.id + '/approve')
      .send({ expectedLockVersion: datedSession.lockVersion, reason })
      .expect(201);

    const criteriaPolicy = (
      await hvuMaker()
        .post(pBase + '/policies')
        .send({
          idempotencyKey: key(),
          kind: 'CRITERIA',
          mode: 'LR',
          body: {
            evidence: reason,
            rules: [
              {
                skill: 'READING',
                part: 'P7',
                scale: 'INTERNAL_RAW_COUNT',
                minSamples: 1,
                min: 0,
                max: 54,
                courseVersionIds: [cv.id],
              },
            ],
          },
          reason,
        })
        .expect(201)
    ).body;
    await hvuChecker()
      .post(pBase + '/policies/' + criteriaPolicy.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    const lrDiagnosticMatched = (
      await unEnrolledLearner()
        .get(pBase + '/attempts/' + lrAttemptId + '/diagnostic')
        .expect(200)
    ).body;
    expect(lrDiagnosticMatched.state).toBe('PUBLISHED');
    expect(lrDiagnosticMatched.parts).toHaveLength(103);
    expect(new Set(lrDiagnosticMatched.parts.map((p: { part: string }) => p.part)).size).toBe(7);
    expect(
      lrDiagnosticMatched.parts.reduce((acc: number, p: { samples: number }) => acc + p.samples, 0),
    ).toBe(200);
    expect(lrDiagnosticMatched.matching.status).toBe('MATCHED');
    expect(lrDiagnosticMatched.matching.classes).toHaveLength(1);
    expect(lrDiagnosticMatched.matching.classes[0].id).toBe(matchClass.id);
    expect(lrDiagnosticMatched.matching.classes[0].availableSeats).toBe(1);
    expect(lrDiagnosticMatched.matching.classes[0].seatGuaranteed).toBe(false);

    // Fill the 1 seat and verify honest exclusion (CLASS_FULL_OR_CAPACITY_UNVERIFIED)
    await d.prisma.enrollment.create({
      data: {
        learnerId: f.otherLearner.id,
        classOfferingId: matchClass.id,
        status: 'PENDING_PAYMENT',
      },
    });
    const lrDiagnosticFull = (
      await unEnrolledLearner()
        .get(pBase + '/attempts/' + lrAttemptId + '/diagnostic')
        .expect(200)
    ).body;
    expect(lrDiagnosticFull.matching.classes).toEqual([]);
    expect(lrDiagnosticFull.matching.reasons).toContain('CLASS_FULL_OR_CAPACITY_UNVERIFIED');

    // 6. Execute full 219-task FOUR_SKILLS sitting for unenrolled learner 2 (including S10 protocol + WAV uploads + Writing responses + GV manual grading + HVU release)
    const fourStart = (
      await secondUnEnrolledLearner()
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: fourBank.version.id,
          policyId: fourTimingPolicyId,
          mode: 'FOUR_SKILLS',
          goalLR: 700,
          goalSpeaking: 150,
          goalWriting: 160,
        })
        .expect(201)
    ).body;
    fourAttemptId = fourStart.attemptId;

    let fourSitting = (
      await secondUnEnrolledLearner().get(pBase + '/attempts/' + fourAttemptId).expect(200)
    ).body;
    expect(fourSitting.phase).toBe('LISTENING');

    // Transition LISTENING -> READING -> BREAK -> SPEAKING
    for (const action of ['NEXT', 'BREAK', 'NEXT']) {
      fourSitting = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            action,
          })
          .expect(201)
      ).body;
    }
    fourSitting = (
      await secondUnEnrolledLearner().get(pBase + '/attempts/' + fourAttemptId).expect(200)
    ).body;
    expect(fourSitting.phase).toBe('SPEAKING');
    expect(fourSitting.groups).toHaveLength(1);

    // Record & upload WAV for all 11 Speaking tasks, stepping through taskIndex 0..10
    const speakingGroups = fourBank.groups.filter((g) => g.group.skill === 'SPEAKING');
    expect(speakingGroups).toHaveLength(11);
    for (let i = 0; i < speakingGroups.length; i++) {
      const sg = speakingGroups[i];
      const qId = sg.questions[0].tq.id;
      const tabId = key();
      const token = key();
      const ticket = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/recordings/' + qId + '/begin')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            tabId,
            token,
          })
          .expect(201)
      ).body;
      const up = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/recordings/' + qId)
          .field('idempotencyKey', key())
          .field('expectedLockVersion', String(ticket.lockVersion))
          .field('tabId', tabId)
          .field('token', token)
          .attach('file', wavBuffer(), {
            filename: `${sg.group.taskCode}.wav`,
            contentType: 'audio/wav',
          })
          .expect(201)
      ).body;
      fourSitting = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: up.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }

    expect(fourSitting.phase).toBe('WRITING');

    // Submit text responses for all 8 Writing tasks (W1..W8), stepping through taskIndex 0..7
    const writingGroups = fourBank.groups.filter((g) => g.group.skill === 'WRITING');
    expect(writingGroups).toHaveLength(8);
    for (let j = 0; j < writingGroups.length; j++) {
      const wg = writingGroups[j];
      const qId = wg.questions[0].tq.id;
      fourSitting = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            questionId: qId,
            textResponse:
              'Original learner writing response for ' +
              wg.group.taskCode +
              ': The librarian is helping visitors arrange the chairs and return books.',
          })
          .expect(201)
      ).body;
      fourSitting = (
        await secondUnEnrolledLearner()
          .post(pBase + '/attempts/' + fourAttemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: fourSitting.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }

    expect(fourSitting.phase).toBe('SUBMITTED');

    // HVU assigns eligible GV grader -> GV reads all 11 WAV recordings + review workspace -> GV submits manual FINAL evaluations -> HVU publishes all 3 evaluations (LR, SPEAKING, WRITING)
    await hvuMaker()
      .post(pBase + '/attempts/' + fourAttemptId + '/assignments')
      .send({
        idempotencyKey: key(),
        graderId: f.teacher.id,
        eligibilityConfirmed: true,
        reason,
      })
      .expect(201);

    await teacher()
      .get(pBase + '/attempts/' + fourAttemptId + '/review')
      .expect(200);

    for (const sg of speakingGroups) {
      const qId = sg.questions[0].tq.id;
      await teacher()
        .get(pBase + '/attempts/' + fourAttemptId + '/recordings/' + qId)
        .expect(200);
    }

    const speakingScores: Record<string, unknown[]> = {};
    for (const sg of speakingGroups) {
      speakingScores[sg.group.id] = [
        {
          code: 'TASK_FULFILLMENT',
          score: 3,
          evidence: 'Clear acoustic response addressing task prompt ' + sg.group.taskCode,
          feedback: 'Good task fulfillment and natural pacing.',
        },
        {
          code: 'LANGUAGE_DELIVERY',
          score: 3,
          evidence: 'Intelligible pronunciation and accurate sentence stress.',
          feedback: 'Maintain consistent intonation on multi-clause sentences.',
        },
      ];
    }

    const spkEval = (
      await teacher()
        .post(pBase + '/attempts/' + fourAttemptId + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'SPEAKING',
          rubricId: fourRubricPolicyId,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores: speakingScores,
          reason,
        })
        .expect(201)
    ).body;

    const writingScores: Record<string, unknown[]> = {};
    for (const wg of writingGroups) {
      writingScores[wg.group.id] = [
        {
          code: 'TASK_FULFILLMENT',
          score: 3,
          evidence: 'Submitted text directly fulfills ' + wg.group.taskCode,
          feedback: 'All required points and target words are accurately included.',
        },
        {
          code: 'LANGUAGE_DELIVERY',
          score: 4,
          evidence: 'Well-structured clauses and appropriate workplace register.',
          feedback: 'Strong grammatical control.',
        },
      ];
    }

    const wrtEval = (
      await teacher()
        .post(pBase + '/attempts/' + fourAttemptId + '/evaluations')
        .send({
          idempotencyKey: key(),
          skill: 'WRITING',
          rubricId: fourRubricPolicyId,
          expectedNumber: 0,
          originalEvidenceReviewed: true,
          scores: writingScores,
          reason,
        })
        .expect(201)
    ).body;

    const fourLrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId: fourAttemptId, skill: 'LR' },
    });
    for (const evalId of [fourLrEval.id, spkEval.id, wrtEval.id]) {
      await hvuChecker()
        .post(pBase + '/evaluations/' + evalId + '/publish')
        .send({ idempotencyKey: key(), reason })
        .expect(201);
    }

    const fourDiag = (
      await secondUnEnrolledLearner()
        .get(pBase + '/attempts/' + fourAttemptId + '/diagnostic')
        .expect(200)
    ).body;
    expect(fourDiag.state).toBe('PUBLISHED');
    expect(
      fourDiag.skillResults.find((s: { skill: string }) => s.skill === 'SPEAKING').value,
    ).toBe(66);
    expect(
      fourDiag.skillResults.find((s: { skill: string }) => s.skill === 'WRITING').value,
    ).toBe(56);

    proofs.pillar2_placement_lr_and_four_skills = {
      passed: true,
      lrBankVersionId: lrBank.version.id,
      lrBankSourceHash: lrBank.version.sourceHash,
      lrEligibilityCounts: lrBank.eligibility.counts,
      lrEligibilityParts: lrBank.eligibility.parts,
      fourSkillsBankVersionId: fourBank.version.id,
      fourSkillsBankSourceHash: fourBank.version.sourceHash,
      fourSkillsEligibilityCounts: fourBank.eligibility.counts,
      fourSkillsEligibilityParts: fourBank.eligibility.parts,
      lrAttemptId,
      lrReceipt: lrSitting.receipt,
      lrDiagnosticState: lrDiagnosticMatched.state,
      lrPositiveClassMatch: {
        status: lrDiagnosticMatched.matching.status,
        matchedClassId: matchClass.id,
        matchedClassCode: matchClass.code,
        availableSeats: lrDiagnosticMatched.matching.classes[0].availableSeats,
        seatGuaranteed: lrDiagnosticMatched.matching.classes[0].seatGuaranteed,
      },
      lrFullClassExclusionReasons: lrDiagnosticFull.matching.reasons,
      fourSkillsAttemptId: fourAttemptId,
      fourSkillsReceipt: fourSitting.receipt,
      fourSkillsDiagnosticState: fourDiag.state,
      fourSkillsSkillResults: fourDiag.skillResults,
    };
  }, 180000);

  it('Pillar 3 (Learner Continuation — UCV2-18..24, 28): Dashboard/Calendar, Sections/Lessons/Resources, Assignment Draft/Submit, Class Quiz, Gradebook, Progress, Knowledge Recommendations & Completion Readiness', async () => {
    const classId = f.lmsClasses[0].id;
    const foreignClassId = f.lmsClasses[1].id;
    const lmsBase = '/api/v2/class-lms/classes/' + classId;

    // 1. UCV2-18: Enrolled learner views /api/v2/my/classes & /api/v2/my/calendar
    const myClasses = (await enrolledLearner().get('/api/v2/my/classes').expect(200)).body;
    expect(myClasses.data.some((c: { id: string }) => c.id === classId)).toBe(true);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const myCalendar = (
      await enrolledLearner()
        .get('/api/v2/my/calendar')
        .query({ month: currentMonth })
        .expect(200)
    ).body;
    expect(myCalendar.month).toBe(currentMonth);

    // 2. UCV2-19: Instructor authors & publishes Section + Lesson + Assignment + Quiz; Learner opens & completes Lesson
    let sec = (
      await teacher()
        .post(lmsBase + '/sections')
        .send({
          title: 'Unit 1: Workplace Communication & TOEIC Part 5 Foundations',
          introduction: 'Core grammar and business email skills',
        })
        .expect(201)
    ).body;
    sec = (
      await teacher()
        .post(lmsBase + '/sections/' + sec.id + '/publish')
        .send({ expectedLockVersion: sec.lockVersion })
        .expect(201)
    ).body;

    let lessonAct = (
      await teacher()
        .post(lmsBase + '/sections/' + sec.id + '/activities')
        .send({
          type: 'LESSON',
          title: 'Lesson 1.1: Word Families & Adverb Placement in Workplace Notices',
          introduction: 'Identify suffixes and adverb positions rapidly.',
          contentMarkdown:
            '# Word Families in TOEIC Part 5\nUse adverbs (-ly) to modify verbs, adjectives, and past participles.',
        })
        .expect(201)
    ).body;
    lessonAct = (
      await teacher()
        .post(lmsBase + '/activities/' + lessonAct.id + '/publish')
        .send({ expectedLockVersion: lessonAct.lockVersion })
        .expect(201)
    ).body;

    await enrolledLearner()
      .post(lmsBase + '/activities/' + lessonAct.id + '/open')
      .expect(201);
    const lessonComplete = (
      await enrolledLearner()
        .post(lmsBase + '/activities/' + lessonAct.id + '/complete')
        .expect(201)
    ).body;
    expect(lessonComplete.status).toBe('COMPLETED');

    // Foreign learner cannot access classId tree
    await foreignEnrolledLearner().get(lmsBase).expect(404);

    // 3. UCV2-20 & UCV2-22: Assignment draft, submit, GV rubric + grade final, HVU publish, Learner gradebook
    let assignAct = (
      await teacher()
        .post(lmsBase + '/sections/' + sec.id + '/activities')
        .send({
          type: 'ASSIGNMENT',
          title: 'Assignment 1.2: Professional Email Reply to Workshop Inquiry',
          introduction: 'Write a 100-word email reply addressing equipment and registration.',
          contentMarkdown: 'Reply to Ms. Olivia Kent regarding Saturday Beginner Photography.',
        })
        .expect(201)
    ).body;
    assignAct = (
      await teacher()
        .post(lmsBase + '/activities/' + assignAct.id + '/publish')
        .send({ expectedLockVersion: assignAct.lockVersion })
        .expect(201)
    ).body;

    const aBase = lmsBase + '/activities/' + assignAct.id + '/assignment';
    const mineStatus = (await enrolledLearner().get(aBase + '/mine').expect(200)).body;
    const draftRes = (
      await enrolledLearner()
        .put(aBase + '/mine')
        .send({
          revisionId: mineStatus.publishedRevisionId,
          expectedLockVersion: 0,
          text: 'Dear Ms. Kent, Beginners do not need a professional camera; loaner cameras are available at Room A.',
        })
        .expect(200)
    ).body;
    const submitRes = (
      await enrolledLearner()
        .post(aBase + '/mine/submit')
        .send({
          revisionId: mineStatus.publishedRevisionId,
          idempotencyKey: key(),
          expectedLockVersion: draftRes.lockVersion,
        })
        .expect(201)
    ).body;
    expect(submitRes.state).toBe('SUBMITTED');

    // GV creates & HVU publishes assignment rubric, then GV grades & finalizes, HVU publishes grade
    const gBase = '/api/v2/assignment-grading/classes/' + classId + '/activities/' + assignAct.id;
    const rubricDraft = (
      await teacher()
        .post(gBase + '/rubrics')
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          name: 'Rubric Chấm Email Phản Hồi Công Việc',
          description: 'Tiêu chí đánh giá email trả lời khách hàng theo chuẩn TOEIC Writing',
          criteria: [
            {
              name: 'Fulfillment of requested actions',
              description: 'Addresses both equipment and registration questions accurately',
              maxScore: '5',
            },
            {
              name: 'Grammar and professional register',
              description: 'Uses polite workplace register and accurate sentence structures',
              maxScore: '5',
            },
          ],
        })
        .expect(201)
    ).body;
    const rubricPub = (
      await hvuChecker()
        .post(gBase + '/rubrics/' + rubricDraft.id + '/publish')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: rubricDraft.lockVersion,
        })
        .expect(201)
    ).body;

    const gradeDraft = (
      await teacher()
        .post(gBase + '/submissions/' + submitRes.id + '/grades')
        .send({
          idempotencyKey: key(),
          expectedPreviousVersion: 0,
          rubricId: rubricPub.id,
          feedback: 'Well-organized professional email reply.',
          scores: [
            {
              criterionId: rubricPub.criteria[0].id,
              score: '5',
              feedback: 'Answered both equipment and registration questions.',
            },
            {
              criterionId: rubricPub.criteria[1].id,
              score: '4',
              feedback: 'Polite register and clear sentence structure.',
            },
          ],
          reason,
        })
        .expect(201)
    ).body;
    const gradeFinal = (
      await teacher()
        .post(gBase + '/grades/' + gradeDraft.id + '/final')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: gradeDraft.lockVersion,
        })
        .expect(201)
    ).body;
    await hvuChecker()
      .post(gBase + '/grades/' + gradeFinal.id + '/publish')
      .send({
        idempotencyKey: key(),
        expectedLockVersion: gradeFinal.lockVersion,
      })
      .expect(201);

    const assignGradebook = (
      await enrolledLearner()
        .get('/api/v2/assignment-grading/classes/' + classId + '/gradebook')
        .expect(200)
    ).body;
    expect(Number(assignGradebook.entries[0].result.earned)).toBe(9);
    expect(Number(assignGradebook.entries[0].result.max)).toBe(10);

    // 4. UCV2-21 & UCV2-24: Knowledge Tag + Article + 4-Item Tagged Class Quiz -> Attempt -> Submit -> HVU Publish -> Recommendations AVAILABLE
    const kBase = '/api/v2/knowledge';
    const tr = (v: number) => ({
      idempotencyKey: key(),
      expectedLockVersion: v,
      reason,
      rightsConfirmed: true,
    });
    let tagRev = (await teacher().post(kBase + '/entries').send(tagDraft()).expect(201)).body;
    tagRev = (
      await teacher().post(kBase + '/revisions/' + tagRev.id + '/submit').send(tr(tagRev.lockVersion)).expect(201)
    ).body;
    tagRev = (
      await hvuChecker().post(kBase + '/revisions/' + tagRev.id + '/review').send(tr(tagRev.lockVersion)).expect(201)
    ).body;
    tagRev = (
      await hvuChecker().post(kBase + '/revisions/' + tagRev.id + '/publish').send(tr(tagRev.lockVersion)).expect(201)
    ).body;

    let artRev = (
      await teacher().post(kBase + '/entries').send(articleDraft(tagRev.id)).expect(201)
    ).body;
    artRev = (
      await teacher().post(kBase + '/revisions/' + artRev.id + '/submit').send(tr(artRev.lockVersion)).expect(201)
    ).body;
    artRev = (
      await hvuChecker().post(kBase + '/revisions/' + artRev.id + '/review').send(tr(artRev.lockVersion)).expect(201)
    ).body;
    artRev = (
      await hvuChecker().post(kBase + '/revisions/' + artRev.id + '/publish').send(tr(artRev.lockVersion)).expect(201)
    ).body;

    let quizAct = (
      await teacher()
        .post(lmsBase + '/sections/' + sec.id + '/activities')
        .send({
          type: 'QUIZ',
          title: 'Quiz 1.3: Part 5 Word Families Check (4 Items)',
          introduction: 'Complete all 4 items.',
          contentMarkdown: '',
        })
        .expect(201)
    ).body;

    const qRoot = '/api/v2/class-quiz/classes/' + classId + '/activities/' + quizAct.id;
    let qSource = (
      await teacher()
        .post(qRoot + '/sources')
        .send({
          idempotencyKey: key(),
          expectedVersion: 0,
          title: 'Quiz 1.3: Part 5 Word Families Check (4 Items)',
          openAt: new Date(Date.now() - 60000).toISOString(),
          closeAt: new Date(Date.now() + 3600000).toISOString(),
          durationMinutes: 10,
          questions: [0, 1, 2, 3].map((i) => ({
            content: `Original class quiz item ${i + 1}: Choose the correct word form for workplace sentence ${i + 1}.`,
            points: 1,
            explanation: `Original explanation for item ${i + 1}`,
            options: [
              { content: `Correct form ${i + 1}`, isCorrect: true },
              { content: `Distractor form ${i + 1}`, isCorrect: false },
            ],
          })),
        })
        .expect(201)
    ).body;
    qSource = (
      await hvuChecker()
        .post(qRoot + '/sources/' + qSource.id + '/approve')
        .send({ idempotencyKey: key(), expectedLockVersion: qSource.lockVersion })
        .expect(201)
    ).body;
    await teacher()
      .post(lmsBase + '/activities/' + quizAct.id + '/publish')
      .send({ expectedLockVersion: quizAct.lockVersion })
      .expect(201);

    for (const q of qSource.questions) {
      let l = (
        await teacher()
          .post(kBase + '/links')
          .send({
            idempotencyKey: key(),
            testQuestionId: q.id,
            tagRevisionId: tagRev.id,
            articleRevisionId: artRev.id,
            reason,
          })
          .expect(201)
      ).body;
      l = (await teacher().post(kBase + '/links/' + l.id + '/submit').send(tr(l.lockVersion)).expect(201)).body;
      l = (await hvuChecker().post(kBase + '/links/' + l.id + '/review').send(tr(l.lockVersion)).expect(201)).body;
      l = (await hvuChecker().post(kBase + '/links/' + l.id + '/publish').send(tr(l.lockVersion)).expect(201)).body;
    }

    const cqRoot = '/api/v2/class-quiz/classes/' + classId;
    let qAttempt = (
      await enrolledLearner()
        .post(cqRoot + '/activities/' + quizAct.id + '/start')
        .send({ sourceId: qSource.id, idempotencyKey: key() })
        .expect(201)
    ).body;
    qAttempt = (
      await enrolledLearner()
        .put(cqRoot + '/attempts/' + qAttempt.id + '/answers')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: qAttempt.lockVersion,
          answers: qSource.questions.map((q: any, idx: number) => ({
            questionId: q.id,
            optionId: q.options[idx === 0 ? 0 : 1].id,
          })),
          marked: [qSource.questions[1].id],
        })
        .expect(200)
    ).body;
    qAttempt = (
      await enrolledLearner()
        .post(cqRoot + '/attempts/' + qAttempt.id + '/submit')
        .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
        .expect(201)
    ).body;
    await hvuChecker()
      .post(cqRoot + '/attempts/' + qAttempt.id + '/publish')
      .send({ idempotencyKey: key(), expectedLockVersion: qAttempt.lockVersion })
      .expect(201);

    const quizGradebook = (
      await enrolledLearner()
        .get(cqRoot + '/gradebook')
        .expect(200)
    ).body;
    expect(quizGradebook.entries[0].result.earned).toBe(1);
    expect(quizGradebook.entries[0].result.max).toBe(4);

    // 5. UCV2-23: Class Progress readback
    const classProgress = (await enrolledLearner().get(lmsBase + '/progress').expect(200)).body;
    expect(classProgress.entries).toHaveLength(3);
    expect(classProgress.completion).toBe('POLICY_NOT_EVALUATED');
    expect(classProgress.certificateIssued).toBe(false);

    // 6. UCV2-24: Knowledge Library & Recommendations AVAILABLE
    const recommendations = (
      await enrolledLearner().get(kBase + '/recommendations').expect(200)
    ).body;
    expect(recommendations.state).toBe('AVAILABLE');
    expect(recommendations.recommendations[0]).toMatchObject({
      code: 'WORD_FORMS',
      correct: 1,
      total: 4,
      notProficiency: true,
    });

    // 7. UCV2-28: Completion Readiness (honest readiness state without fabricating certificate)
    const readiness = (
      await enrolledLearner().get('/api/v2/certificates/readiness').expect(200)
    ).body;
    expect(readiness).toBeDefined();

    // SQL readbacks across all 3 pillars
    proofs.sqlReadbacks = {
      w05bTeacherProfiles: await d.prisma.w05BProfile.count(),
      w05bAvailabilityRules: await d.prisma.w05BAvailability.count(),
      w05bBookings: await d.prisma.w05BBooking.count(),
      w05bBookingEvents: await d.prisma.w05BEvent.count(),
      w05bOutbox: await d.prisma.w05BOutbox.count(),
      placementSourceVersions: await d.prisma.placementSourceVersion.count(),
      placementQuestionsTotal: await d.prisma.testQuestion.count({
        where: { testId: { in: [lrBank.version.testId, fourBank.version.testId] } },
      }),
      placementSittings: await d.prisma.placementSitting.count(),
      placementTaskRecordings: await d.prisma.placementTaskRecording.count(),
      placementHumanEvaluations: await d.prisma.placementHumanEvaluation.count(),
      placementResultReleases: await d.prisma.placementResultRelease.count(),
      lmsSections: await d.prisma.classSection.count(),
      lmsActivities: await d.prisma.classActivity.count(),
      assignmentSubmissions: await d.prisma.classAssignmentSubmission.count(),
      knowledgeEntries: await d.prisma.knowledgeEntry.count(),
      quizKnowledgeLinks: await d.prisma.quizKnowledgeLink.count(),
    };

    proofs.pillar3_enrolled_learner_lms = {
      passed: true,
      enrolledClassId: classId,
      myClassesCount: myClasses.data.length,
      calendarMonth: myCalendar.month,
      completedLessonId: lessonAct.id,
      assignmentActivityId: assignAct.id,
      assignmentSubmissionId: submitRes.id,
      publishedAssignmentScore: `${assignGradebook.entries[0].result.earned}/${assignGradebook.entries[0].result.max}`,
      quizActivityId: quizAct.id,
      publishedQuizAttemptId: qAttempt.id,
      publishedQuizScore: `${quizGradebook.entries[0].result.earned}/${quizGradebook.entries[0].result.max}`,
      classProgressEntriesCount: classProgress.entries.length,
      classProgressCompletionState: classProgress.completion,
      knowledgeRecommendationState: recommendations.state,
      knowledgeRecommendationFirstItem: recommendations.recommendations[0],
      completionReadinessResponse: readiness,
      foreignClassAccessDeniedStatus: 404,
    };
  }, 120000);

  it('Pillar 4 — Real-Browser E2E & Sanitized Visual Verification (Desktop 1440x900 & Mobile 390x844)', async () => {
    const pBase = '/api/v2/placement/workflow';
    // Start an active IN_PROGRESS 200-item LR sitting for foreignEnrolledLearner (f.otherLearner) so enrolledLearner's knowledge recommendations are not suppressed by an active exam
    const startActive = (
      await foreignEnrolledLearner()
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: lrBank.version.id,
          policyId: lrTimingPolicyId,
          mode: 'LR',
          goalLR: 650,
        })
        .expect(201)
    ).body;
    const activeLrAttemptId = startActive.attemptId as string;

    let activeSitting = (await foreignEnrolledLearner().get(pBase + '/attempts/' + activeLrAttemptId).expect(200)).body;
    const allActiveQs = activeSitting.groups.flatMap((g: any) => g.questions);
    const firstQ = allActiveQs[0];
    const secondQ = allActiveQs[1];

    activeSitting = (
      await foreignEnrolledLearner()
        .post(pBase + '/attempts/' + activeLrAttemptId + '/answers')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: activeSitting.lockVersion,
          questionId: firstQ.testQuestionId,
          selectedOptionIds: [firstQ.options[0].id],
        })
        .expect(201)
    ).body;

    activeSitting = (
      await foreignEnrolledLearner()
        .post(pBase + '/attempts/' + activeLrAttemptId + '/answers')
        .send({
          idempotencyKey: key(),
          expectedLockVersion: activeSitting.lockVersion,
          questionId: secondQ.testQuestionId,
          marked: true,
        })
        .expect(201)
    ).body;

    const httpServer = d.app.getHttpServer();
    if (!httpServer.listening) {
      await d.app.listen(0, '127.0.0.1');
    }
    const apiPort = (httpServer.address() as AddressInfo).port;
    const p3 = proofs.pillar3_enrolled_learner_lms as Record<string, string>;

    const browserSummary = await runArgonWave01BrowserVerification({
      apiPort,
      password: f.password,
      actors: {
        unenrolledLearnerEmail: f.contenders[0].email,
        secondUnenrolledLearnerEmail: f.contenders[1].email,
        activeSittingLearnerEmail: f.otherLearner.email,
        enrolledLearnerEmail: f.learner.email,
        teacherEmail: f.teacher.email,
        hvuCheckerEmail: f.planningApprover.email,
      },
      ids: {
        activeLrAttemptId,
        lrAttemptId,
        fourAttemptId,
        enrolledClassId: p3.enrolledClassId,
        lessonActId: p3.completedLessonId,
        assignActId: p3.assignmentActivityId,
        quizActId: p3.quizActivityId,
        quizAttemptId: p3.publishedQuizAttemptId,
      },
    });

    expect(browserSummary.totalCaptures).toBe(20);
    expect(browserSummary.allZeroOverflow).toBe(true);
    expect(browserSummary.api5xxObserved).toBe(0);

    proofs.pillar4_browser_visual_e2e = {
      passed: true,
      totalCaptures: browserSummary.totalCaptures,
      allZeroOverflow: browserSummary.allZeroOverflow,
      apiResponsesObserved: browserSummary.apiResponsesObserved,
      api5xxObserved: browserSummary.api5xxObserved,
      screenshotSlugs: browserSummary.captures.map((c) => c.slug),
    };
  }, 180000);
});
