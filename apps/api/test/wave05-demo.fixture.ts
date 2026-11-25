/* eslint-disable @typescript-eslint/no-explicit-any */
import * as request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { startWave01App } from './wave01-postgres.fixture';
import { seedWave03A } from './wave03a.fixture';
import { grantAcademic } from './wave02b.fixture';
import { articleDraft, tagDraft } from './wave03bd.fixture';
import { seedOriginalPlacementBank } from './seed-original-placement-bank';
import { seedPlacementWorkflowSource } from './wave04b.fixture';
import { normalizeCanonicalPartCode } from '../src/modules/placement/placement-diagnosis-advisory';

const PO_PRICE_REF = 'PO-DEC071-WAVE05-DEMO-PRICE-APPROVAL';

function wavBuffer(): Buffer {
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

export async function seedArgonWave05Demo(d: Awaited<ReturnType<typeof startWave01App>>) {
  // 1. Allow unified disposable DB name v2_wave01_dev_test_w04b_* in w05_guard()
  const [fnRow] = await d.prisma.$queryRaw<{ def: string }[]>`
    SELECT pg_get_functiondef('w05_guard'::regproc) AS def
  `;
  const updatedDef = fnRow.def.replace(
    '^v2_wave01_dev_test_w05a_[a-z0-9_]+$',
    '^v2_wave01_dev_test_(w05a|w04b_w05a|w04b_wave05)_[a-z0-9_]+$',
  );
  await d.prisma.$executeRawUnsafe(updatedDef);

  const f = await seedWave03A(d);
  const reason =
    'Wave 05 disposable demo seed for Placement Diagnosis, Class Matching & AI Advisory';
  const key = () => randomUUID();

  // Rename base actors to realistic Vietnamese academic & staff names for demo presentation
  await d.prisma.user.update({
    where: { id: f.teacher.id },
    data: { fullName: 'ThS. Nguyễn Thu Hà (Giảng viên Chấm thi & Học thuật)' },
  });
  await d.prisma.user.update({
    where: { id: f.academic.id },
    data: { fullName: 'ThS. Trần Quốc Tuấn (Quản lý Học vụ)' },
  });
  await d.prisma.user.update({
    where: { id: f.planningApprover.id },
    data: { fullName: 'TS. Lê Minh Hạnh (Hội đồng Duyệt Học vụ Độc lập)' },
  });
  await d.prisma.user.update({
    where: { id: f.counselor.id },
    data: { fullName: 'Võ Hoàng Yến (Chuyên viên Tư vấn Tuyển sinh)' },
  });
  await d.prisma.user.update({
    where: { id: f.learner.id },
    data: { fullName: 'Bùi Thị Minh Châu' },
  });

  // Hide synthetic W03A test courses from public catalog so /catalog only shows 6 realistic Vietnamese TOEIC programs
  await d.prisma.course.updateMany({
    where: { isPublished: true },
    data: { isPublished: false },
  });

  // Create 7 distinct learner cohorts for Placement Diagnosis & Class Recommendation
  const createStudent = async (slug: string, fullName: string) =>
    d.prisma.user.create({
      data: {
        email: `hv.${slug}.${randomUUID().slice(0, 6)}@example.invalid`,
        fullName,
        passwordHash: f.learner.passwordHash,
        role: 'STUDENT',
      },
    });

  const hvCohortA = await createStudent('cohort.a', 'Nguyễn Minh Khoa');
  const hvCohortB = await createStudent('cohort.b', 'Trần Ngọc Bảo Trân');
  const hvCohortC = await createStudent('cohort.c', 'Lê Hoàng Gia Huy');
  const hvCohortD = await createStudent('cohort.d', 'Phạm Khánh Linh');
  const hvCohortE = await createStudent('cohort.e', 'Đặng Quốc Anh');
  const hvCohortF = await createStudent('cohort.f', 'Vũ Thảo Nguyên');
  const hvCohortG = await createStudent('cohort.g', 'Hoàng Minh Tuấn');

  async function login(u: { id: string; email: string }) {
    const a = request.agent(d.app.getHttpServer());
    await a.post('/api/auth/login').send({ email: u.email, password: f.password }).expect(200);
    f.agents.set(u.id, a);
    return a;
  }

  for (const u of [
    hvCohortA,
    hvCohortB,
    hvCohortC,
    hvCohortD,
    hvCohortE,
    hvCohortF,
    hvCohortG,
    ...f.contenders,
  ]) {
    await login(u);
  }

  for (const u of [f.approver, f.secondApprover]) {
    await d.prisma.permissionGrant.create({
      data: {
        userId: u.id,
        requestedBy: f.admin.id,
        approvedBy: u.id === f.approver.id ? f.secondApprover.id : f.approver.id,
        capability: 'authority.approve',
        scopeType: 'GLOBAL',
        reason,
        effectiveAt: new Date(Date.now() - 10000),
        approvedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  }

  async function grant(
    u: { id: string; email: string },
    capability: string,
    scopeType: 'GLOBAL' | 'COURSE' | 'CLASS' = 'GLOBAL',
    scopeId?: string,
  ) {
    const r = await f.agents
      .get(f.approver.id)!
      .post('/api/authority/grants')
      .send({
        userId: u.id,
        capability,
        scopeType,
        ...(scopeId ? { scopeId } : {}),
        reason,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await f.agents
      .get(f.secondApprover.id)!
      .post('/api/authority/grants/' + r.body.id + '/approve')
      .expect(201);
    await login(u);
    return r.body.id as string;
  }

  for (const cap of ['placement.source.author', 'placement.rubric.author', 'knowledge.author']) {
    await grant(f.teacher, cap, 'GLOBAL');
  }
  for (const u of [f.academic, f.planningApprover]) {
    for (const cap of [
      'placement.source.approve',
      'placement.rubric.approve',
      'placement.grader.assign',
      'placement.result.publish',
      'placement.criteria.author',
      'placement.criteria.approve',
      'knowledge.review',
      'knowledge.publish',
    ]) {
      await grant(u, cap, 'GLOBAL');
    }
  }

  const maker = f.agents.get(f.academic.id)!;
  const checker = f.agents.get(f.planningApprover.id)!;
  const gv = f.agents.get(f.teacher.id)!;
  const ap = '/api/v2/academic';

  // Create physical room for official class sessions
  const room = (
    await maker
      .post(ap + '/rooms')
      .send({
        code: 'SE-R301-' + key().slice(0, 5).toUpperCase(),
        name: 'Phòng Học Đa Phương Tiện B301',
        location: 'Cơ sở Nguyễn Văn Bảo, Gò Vấp, TP.HCM',
        capacity: 30,
        capabilities: ['WHITEBOARD'],
        status: 'ACTIVE',
        reason,
      })
      .expect(201)
  ).body;

  // Helper to create a published course + approved CourseVersion
  async function createApprovedCourseAndVersion(opts: {
    title: string;
    slugPrefix: string;
    description: string;
    level: string;
    skillScope: 'LR' | 'SPEAKING' | 'WRITING' | 'FOUR_SKILLS';
    tuitionFeeVnd: number;
  }) {
    const course = await d.prisma.course.create({
      data: {
        title: opts.title,
        slug: `${opts.slugPrefix}-${randomUUID().slice(0, 6)}`,
        description: opts.description,
        level: opts.level,
        skillScope: opts.skillScope,
        isPublished: true,
        createdById: f.academic.id,
      },
    });
    await grantAcademic(
      d.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.program.approve',
      'COURSE',
      course.id,
    );
    let version = (
      await maker
        .post(`${ap}/programs/${course.id}/versions`)
        .send({
          title: `${opts.title} (Phiên bản Chuẩn Học thuật 2026)`,
          description: opts.description,
          level: opts.level,
          skillScope: opts.skillScope,
          standardPricingType: 'PAID',
          standardTuitionFeeVnd: opts.tuitionFeeVnd,
          effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    version = (
      await maker
        .post(`${ap}/versions/${version.id}/submit`)
        .send({ expectedLockVersion: version.lockVersion, reason })
        .expect(201)
    ).body;
    version = (
      await checker
        .post(`${ap}/versions/${version.id}/approve`)
        .send({
          expectedLockVersion: version.lockVersion,
          poPriceConfirmed: true,
          poPriceReference: PO_PRICE_REF,
          reason,
        })
        .expect(201)
    ).body;
    return { course, version };
  }

  // Helper to create an OPEN class offering with official instructor assignment and published session
  let sessionDayOffset = 10;
  async function createOpenClassForVersion(opts: {
    versionId: string;
    code: string;
    name: string;
    modality: 'ONLINE' | 'OFFLINE' | 'HYBRID';
    maxStudents: number;
    scheduleSummary: string;
  }) {
    sessionDayOffset += 2;
    const futureStart = new Date(Date.now() + sessionDayOffset * 86400000);
    futureStart.setUTCHours(11, 30, 0, 0); // 18:30 ICT
    const futureEnd = new Date(futureStart.getTime() + 2 * 3600000);
    const classEnd = new Date(futureStart.getTime() + 45 * 86400000);

    let cl = (
      await maker
        .post(`${ap}/versions/${opts.versionId}/offers`)
        .send({
          code: opts.code,
          name: opts.name,
          modality: 'OFFLINE',
          maxStudents: opts.maxStudents,
          enrollmentStart: new Date(Date.now() - 86400000).toISOString(),
          enrollmentEnd: futureStart.toISOString(),
          classStart: futureStart.toISOString(),
          classEnd: classEnd.toISOString(),
          reason,
        })
        .expect(201)
    ).body;

    cl = await d.prisma.classOffering.update({
      where: { id: cl.id },
      data: {
        status: 'OPEN',
        totalSessions: 1,
      },
    });

    await grantAcademic(
      d.prisma,
      f.planningApprover.id,
      f.approver.id,
      f.secondApprover.id,
      'academic.schedule.approve',
      'CLASS',
      cl.id,
    );

    let assign = (
      await maker
        .post(`${ap}/classes/${cl.id}/assignments`)
        .send({
          instructorId: f.teacher.id,
          effectiveFrom: new Date(Date.now() + 1000).toISOString(),
          effectiveTo: new Date(classEnd.getTime() + 7 * 86400000).toISOString(),
          reason,
        })
        .expect(201)
    ).body;
    assign = (
      await maker
        .post(`${ap}/assignments/${assign.id}/submit`)
        .send({ expectedLockVersion: assign.lockVersion, reason })
        .expect(201)
    ).body;
    assign = (
      await checker
        .post(`${ap}/assignments/${assign.id}/approve`)
        .send({
          expectedLockVersion: assign.lockVersion,
          eligibilityConfirmed: true,
          reason,
        })
        .expect(201)
    ).body;

    const toLocalIso = (dt: Date) =>
      new Date(dt.getTime() + 7 * 3600000).toISOString().slice(0, 16);

    let sess = (
      await maker
        .post(`${ap}/classes/${cl.id}/sessions`)
        .send({
          startLocal: toLocalIso(futureStart),
          endLocal: toLocalIso(futureEnd),
          timezone: 'Asia/Ho_Chi_Minh',
          modality: 'OFFLINE',
          roomId: room.id,
          assignmentId: assign.id,
          requiredCapabilities: ['WHITEBOARD'],
          reason,
        })
        .expect(201)
    ).body;
    sess = (
      await maker
        .post(`${ap}/sessions/${sess.id}/submit`)
        .send({ expectedLockVersion: sess.lockVersion, reason })
        .expect(201)
    ).body;
    await checker
      .post(`${ap}/sessions/${sess.id}/approve`)
      .send({ expectedLockVersion: sess.lockVersion, reason })
      .expect(201);

    return cl;
  }

  // Create 5 courses with approved versions + 1 upcoming course (6 public courses total)
  const readingProg = await createApprovedCourseAndVersion({
    title: 'TOEIC Reading Strategies & Grammar 550+ — Ngữ pháp & Đọc hiểu Chuyên sâu',
    slugPrefix: 'toeic-reading-grammar-550',
    description:
      'Chuyên sâu ngữ pháp câu (từ loại, mệnh đề, thì động từ Part 5–6) và kỹ thuật đọc quét đa văn bản TOEIC Part 7.',
    level: 'B1',
    skillScope: 'LR',
    tuitionFeeVnd: 1850000,
  });
  const classReadingOpen = await createOpenClassForVersion({
    versionId: readingProg.version.id,
    code: 'SE-READ-550-246',
    name: 'TOEIC Reading & Grammar 550+ — Tối 2-4-6 (Ca 18:30)',
    modality: 'HYBRID',
    maxStudents: 20,
    scheduleSummary: 'Thứ 2 - Thứ 4 - Thứ 6 · 18:30–20:30',
  });

  const listeningProg = await createApprovedCourseAndVersion({
    title: 'TOEIC Listening Focus & Reflex 550+ — Phản xạ Nghe hiểu Công sở',
    slugPrefix: 'toeic-listening-focus-550',
    description:
      'Luyện phản xạ câu hỏi gián tiếp Part 2, nắm bắt ý chính hội thoại Part 3 và bài nói thông báo Part 4.',
    level: 'B1',
    skillScope: 'LR',
    tuitionFeeVnd: 1850000,
  });
  const classListeningOpen = await createOpenClassForVersion({
    versionId: listeningProg.version.id,
    code: 'SE-LIST-550-357',
    name: 'TOEIC Listening Focus 550+ — Tối 3-5-7 (Ca 18:30)',
    modality: 'OFFLINE',
    maxStudents: 20,
    scheduleSummary: 'Thứ 3 - Thứ 5 - Thứ 7 · 18:30–20:30',
  });

  const balancedProg = await createApprovedCourseAndVersion({
    title: 'TOEIC L&R Advancing 550+ — Toàn diện Nghe Đọc Trung cấp',
    slugPrefix: 'toeic-lr-advancing-550',
    description:
      'Lộ trình cân bằng hai kỹ năng Nghe hiểu và Đọc hiểu giúp học viên từ nền tảng trung cấp bứt phá mục tiêu 550–650+.',
    level: 'B1',
    skillScope: 'LR',
    tuitionFeeVnd: 2100000,
  });
  const classBalancedOpen = await createOpenClassForVersion({
    versionId: balancedProg.version.id,
    code: 'SE-LR-550-OPEN',
    name: 'TOEIC L&R Advancing 550+ — Tối 2-4-6 (Ca 19:30)',
    modality: 'HYBRID',
    maxStudents: 15,
    scheduleSummary: 'Thứ 2 - Thứ 4 - Thứ 6 · 19:30–21:30',
  });
  const classBalancedFull = await createOpenClassForVersion({
    versionId: balancedProg.version.id,
    code: 'SE-LR-550-FULL',
    name: 'TOEIC L&R Advancing 550+ — Cuối tuần Thứ 7-CN',
    modality: 'OFFLINE',
    maxStudents: 1,
    scheduleSummary: 'Thứ 7 - Chủ Nhật · 08:30–11:00',
  });
  // Fill the 1 seat in classBalancedFull so it appears as WAITLIST_OR_FULL
  await d.prisma.enrollment.create({
    data: {
      learnerId: f.contenders[0].id,
      classOfferingId: classBalancedFull.id,
      status: 'ACTIVE',
    },
  });

  const intensiveProg = await createApprovedCourseAndVersion({
    title: 'TOEIC Intensive 750+ — Luyện Đề & Đọc Hiểu Đa Văn Bản',
    slugPrefix: 'toeic-intensive-750',
    description:
      'Tăng tốc xử lý câu hỏi suy luận khó và liên kết thông tin 2–3 văn bản dành cho học viên nền tảng khá giỏi.',
    level: 'B2',
    skillScope: 'LR',
    tuitionFeeVnd: 2450000,
  });
  const classIntensiveFull = await createOpenClassForVersion({
    versionId: intensiveProg.version.id,
    code: 'SE-LR-750-FULL',
    name: 'TOEIC Intensive 750+ — Tối 3-5-7 (Đã đủ sĩ số)',
    modality: 'OFFLINE',
    maxStudents: 1,
    scheduleSummary: 'Thứ 3 - Thứ 5 - Thứ 7 · 19:30–21:30',
  });
  await d.prisma.enrollment.create({
    data: {
      learnerId: f.contenders[1].id,
      classOfferingId: classIntensiveFull.id,
      status: 'ACTIVE',
    },
  });

  const fourSkillsProg = await createApprovedCourseAndVersion({
    title: 'TOEIC 4 Kỹ Năng Toàn Diện 650+ — Nghe Đọc & Giao Tiếp Viết Email',
    slugPrefix: 'toeic-4skills-complete-650',
    description:
      'Làm chủ trọn vẹn 4 kỹ năng Listening, Reading, Speaking (S1–S11) và Writing (W1–W8) chuẩn môi trường doanh nghiệp quốc tế.',
    level: 'B2',
    skillScope: 'FOUR_SKILLS',
    tuitionFeeVnd: 3200000,
  });
  const classFourSkillsOpen = await createOpenClassForVersion({
    versionId: fourSkillsProg.version.id,
    code: 'SE-4SK-650-OPEN',
    name: 'TOEIC 4 Kỹ Năng 650+ — Tối 2-4-6 & Thứ 7',
    modality: 'HYBRID',
    maxStudents: 16,
    scheduleSummary: 'Thứ 2-4-6 & Sáng Thứ 7 · 18:30–20:30',
  });

  // 6th public course: upcoming schedule (0 classes -> demonstrates honest upcoming badge on /catalog)
  const upcomingCourse = await d.prisma.course.create({
    data: {
      title: 'TOEIC Speaking & Writing Workplace 150+ — Phản xạ Nói & Viết Email',
      slug: `toeic-sw-workplace-150-${randomUUID().slice(0, 6)}`,
      description:
        'Chuyên đề luyện phát âm, phản xạ giải quyết tình huống Speaking S10 và viết email/luận quan điểm TOEIC Writing.',
      level: 'B1',
      skillScope: 'SPEAKING',
      isPublished: true,
      createdById: f.academic.id,
    },
  });

  // Enroll primary student (Bùi Thị Minh Châu) into classReadingOpen and publish a realistic LMS section & lesson
  await d.prisma.enrollment.create({
    data: {
      learnerId: f.learner.id,
      classOfferingId: classReadingOpen.id,
      status: 'ACTIVE',
    },
  });
  const lmsBase = `/api/v2/class-lms/classes/${classReadingOpen.id}`;
  let demoSec = (
    await gv
      .post(`${lmsBase}/sections`)
      .send({
        title: 'Tuần 01 — Hệ thống Từ loại, Cấu trúc Mệnh đề & Chiến thuật Part 5–6',
        introduction:
          'Học liệu chính thức tuần 1 theo lộ trình cá nhân hóa từ bài đánh giá đầu vào.',
      })
      .expect(201)
  ).body;
  demoSec = (
    await gv
      .post(`${lmsBase}/sections/${demoSec.id}/publish`)
      .send({ expectedLockVersion: demoSec.lockVersion })
      .expect(201)
  ).body;
  const demoLesson = (
    await gv
      .post(`${lmsBase}/sections/${demoSec.id}/activities`)
      .send({
        type: 'LESSON',
        title: 'Bài 01: Nhận diện nhanh vị trí Danh – Động – Tính – Trạng trong 15 giây',
        introduction: 'Tài liệu trọng tâm khắc phục lỗ hổng Part 5 Ngữ pháp & Từ loại',
        contentMarkdown:
          '# Nhận diện nhanh vị trí Từ loại TOEIC Part 5\n\n1. Cụm danh từ (Noun Phrase)\n2. Vị trí trạng từ bổ nghĩa động từ và tính từ\n3. Liên từ phụ thuộc vs Giới từ.',
      })
      .expect(201)
  ).body;
  await gv
    .post(`${lmsBase}/activities/${demoLesson.id}/publish`)
    .send({ expectedLockVersion: demoLesson.lockVersion })
    .expect(201);

  // Publish curated Knowledge Library articles for self-study guidance allowlist verification
  const kBase = '/api/v2/knowledge';
  const tr = (v: number) => ({
    idempotencyKey: key(),
    expectedLockVersion: v,
    reason,
    rightsConfirmed: true,
  });

  async function publishKnowledgeTagAndArticle(opts: {
    tagCode: string;
    tagTitle: string;
    articleSlug: string;
    articleTitle: string;
    articleSummary: string;
    articleBody: string;
  }) {
    const baseTag = tagDraft(opts.tagCode);
    let tagRev = (
      await gv
        .post(`${kBase}/entries`)
        .send({
          ...baseTag,
          title: opts.tagTitle,
        })
        .expect(201)
    ).body;
    tagRev = (
      await gv
        .post(`${kBase}/revisions/${tagRev.id}/submit`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;
    tagRev = (
      await checker
        .post(`${kBase}/revisions/${tagRev.id}/review`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;
    tagRev = (
      await checker
        .post(`${kBase}/revisions/${tagRev.id}/publish`)
        .send(tr(tagRev.lockVersion))
        .expect(201)
    ).body;

    const baseArt = articleDraft(tagRev.id, opts.articleSlug);
    let artRev = (
      await gv
        .post(`${kBase}/entries`)
        .send({
          ...baseArt,
          slug: opts.articleSlug,
          title: opts.articleTitle,
          bodyMarkdown: `${opts.articleBody}\n\n${baseArt.bodyMarkdown}`,
        })
        .expect(201)
    ).body;
    artRev = (
      await gv
        .post(`${kBase}/revisions/${artRev.id}/submit`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;
    artRev = (
      await checker
        .post(`${kBase}/revisions/${artRev.id}/review`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;
    artRev = (
      await checker
        .post(`${kBase}/revisions/${artRev.id}/publish`)
        .send(tr(artRev.lockVersion))
        .expect(201)
    ).body;
    return { tagRev, artRev };
  }

  const artListeningP12 = await publishKnowledgeTagAndArticle({
    tagCode: 'LISTENING_QUESTION_RESPONSE_INDIRECT',
    tagTitle: 'Phản xạ Hỏi – Đáp gián tiếp TOEIC Part 1–2',
    articleSlug: 'toeic-part1-2-listening-reflex-and-indirect-answers',
    articleTitle: 'Chiến thuật Nghe hiểu TOEIC Part 1–2: Bẫy đồng âm & Câu trả lời gián tiếp',
    articleSummary:
      'Phương pháp nhận diện từ để hỏi (Who/When/Where/Why) và loại trừ phương án trả lời gián tiếp hoặc bẫy từ đồng âm.',
    articleBody:
      '# Chiến thuật Nghe hiểu TOEIC Part 1–2\n\n## 1. Bắt từ để hỏi ở 2 giây đầu\nTập trung cao độ vào từ đầu câu hỏi.\n\n## 2. Nhận diện câu trả lời gián tiếp\nCác mẫu như "Let me check the schedule" hoặc "Ask Ms. Tran in accounting" thường là đáp án đúng.',
  });

  const artListeningP34 = await publishKnowledgeTagAndArticle({
    tagCode: 'LISTENING_CONVERSATION_DETAIL_INFERENCE',
    tagTitle: 'Nghe hiểu Hội thoại & Bài nói TOEIC Part 3–4',
    articleSlug: 'toeic-part3-4-conversations-talks-key-information',
    articleTitle: 'Phương pháp bắt từ khóa & Suy luận ngữ cảnh TOEIC Part 3–4',
    articleSummary:
      'Kỹ thuật đọc trước 3 câu hỏi (previewing), nắm bắt từ đồng nghĩa (paraphrasing) và đối chiếu bảng biểu.',
    articleBody:
      '# Phương pháp bắt từ khóa TOEIC Part 3–4\n\n1. Đọc trước câu hỏi trước khi băng chạy\n2. Nghe ý định người nói và hành động tiếp theo.',
  });

  const artGrammarP56 = await publishKnowledgeTagAndArticle({
    tagCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
    tagTitle: 'Ngữ pháp Từ loại, Thì động từ & Mệnh đề TOEIC Part 5–6',
    articleSlug: 'toeic-part5-word-forms-and-clause-structure',
    articleTitle: 'Hệ thống Từ loại, Thì động từ & Cấu trúc Mệnh đề TOEIC Part 5–6',
    articleSummary:
      'Tổng hợp dấu hiệu nhận biết hậu tố từ loại, sự hòa hợp chủ ngữ – động từ và liên từ nối đoạn văn Part 6.',
    articleBody:
      '# Hệ thống Từ loại & Cấu trúc Mệnh đề TOEIC Part 5–6\n\n1. Vị trí danh từ, tính từ, trạng từ\n2. Chia thì động từ và thể bị động\n3. Điền câu hoàn chỉnh vào đoạn văn Part 6.',
  });

  const artSwRubric = await publishKnowledgeTagAndArticle({
    tagCode: 'SPEAKING_SOLUTION_AND_OPINION',
    tagTitle: 'Tiêu chí Rubric TOEIC Speaking & Writing Công sở',
    articleSlug: 'toeic-speaking-writing-workplace-rubric-guide',
    articleTitle: 'Cẩm nang Tiêu chí Chấm điểm TOEIC Speaking & Writing theo Rubric',
    articleSummary:
      'Hướng dẫn cấu trúc trả lời đề xuất giải pháp (S10), trình bày quan điểm (S11) và viết email phản hồi công việc (W6–W7).',
    articleBody:
      '# Cẩm nang Tiêu chí Chấm điểm TOEIC Speaking & Writing\n\n1. Phát âm và ngữ điệu\n2. Mức độ hoàn thành yêu cầu đề bài\n3. Cấu trúc đoạn văn và email thương mại.',
  });

  // Seed Original 200-item LR and 219-item FOUR_SKILLS Placement Banks + synthetic low-sample bank
  const pBase = '/api/v2/placement/workflow';
  const lrBank = await seedOriginalPlacementBank(d, 'LR', false);
  const fourBank = await seedOriginalPlacementBank(d, 'FOUR_SKILLS', true);
  const smallBank = await seedPlacementWorkflowSource(d, 'LR');

  // Approve SOURCE_TIMING for lrBank, fourBank, and smallBank
  async function approveTiming(source: {
    version: { id: string; mode: string; sourceHash: string };
    groups: any[];
  }) {
    const tasks = source.groups
      .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
      .map((g) => ({
        groupId: g.group.id,
        preparationSeconds: 0,
        playbackSeconds: 0,
        responseSeconds: 30,
        uploadSeconds: 120,
      }));
    const res = await gv
      .post(pBase + '/policies')
      .send({
        idempotencyKey: key(),
        kind: 'SOURCE_TIMING',
        mode: source.version.mode,
        sourceId: source.version.id,
        body: { sourceHash: source.version.sourceHash, evidence: reason, tasks },
        reason,
      })
      .expect(201);
    await checker
      .post(pBase + '/policies/' + res.body.id + '/approve')
      .send({ idempotencyKey: key(), reason })
      .expect(201);
    return res.body.id as string;
  }

  const lrTimingId = await approveTiming(lrBank);
  const fourTimingId = await approveTiming(fourBank);
  const smallTimingId = await approveTiming(smallBank);

  // Approve RUBRIC policy for fourBank
  const fourRubricTasks = fourBank.groups
    .filter((g) => ['SPEAKING', 'WRITING'].includes(g.group.skill))
    .map((g) => ({
      groupId: g.group.id,
      criteria: [
        {
          code: 'TASK_FULFILLMENT',
          descriptor: 'Hoàn thành đúng yêu cầu giao tiếp công sở, đầy đủ thông tin trọng tâm (0-4)',
          max: 4,
        },
        {
          code: 'LANGUAGE_DELIVERY',
          descriptor: 'Ngữ pháp, từ vựng thương mại và độ trôi chảy/mạch lạc (0-4)',
          max: 4,
        },
      ],
    }));
  const fourRubricRes = await gv
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
  await checker
    .post(pBase + '/policies/' + fourRubricRes.body.id + '/approve')
    .send({ idempotencyKey: key(), reason })
    .expect(201);
  const fourRubricId = fourRubricRes.body.id as string;

  // Approve LR CRITERIA policy v1 (distinguishing Cohort A, Cohort B, Cohort C, and Cohort G)
  const lrCriteriaBodyV1 = {
    evidence:
      'Chính sách gợi ý khóa/lớp dựa trên năng lực thành phần, Part 1–7 và chủ điểm kiến thức (Wave 05 v1)',
    rules: [
      // Cohort A: Strong Listening (65..100), Weak Reading (0..45) & Weak Part 5 / Grammar Word Forms
      {
        skill: 'LISTENING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 65,
        max: 100,
        courseVersionIds: [readingProg.version.id],
      },
      {
        skill: 'READING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 0,
        max: 45,
        courseVersionIds: [readingProg.version.id],
      },
      {
        skill: 'READING',
        part: 'P5',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 15,
        min: 0,
        max: 12,
        courseVersionIds: [readingProg.version.id],
      },
      {
        skill: 'READING',
        domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 5,
        min: 0,
        max: 5,
        courseVersionIds: [readingProg.version.id],
      },
      // Cohort B: Weak Listening (0..45) & Weak Part 2 / Indirect Question-Response, Strong Reading (65..100)
      {
        skill: 'LISTENING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 0,
        max: 45,
        courseVersionIds: [listeningProg.version.id],
      },
      {
        skill: 'READING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 65,
        max: 100,
        courseVersionIds: [listeningProg.version.id],
      },
      {
        skill: 'LISTENING',
        part: 'P2',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 15,
        min: 0,
        max: 12,
        courseVersionIds: [listeningProg.version.id],
      },
      {
        skill: 'LISTENING',
        domainCode: 'LISTENING_INDIRECT_RESPONSE',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 5,
        min: 0,
        max: 8,
        courseVersionIds: [listeningProg.version.id],
      },
      // Cohort C: Balanced Intermediate Listening (46..64) & Reading (46..64)
      {
        skill: 'LISTENING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 46,
        max: 64,
        courseVersionIds: [balancedProg.version.id],
      },
      {
        skill: 'READING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 46,
        max: 64,
        courseVersionIds: [balancedProg.version.id],
      },
      // Cohort G: Advanced Intensive 750+ (80..100 Listening & Reading -> only full class exists)
      {
        skill: 'LISTENING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 80,
        max: 100,
        courseVersionIds: [intensiveProg.version.id],
      },
      {
        skill: 'READING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 80,
        max: 100,
        courseVersionIds: [intensiveProg.version.id],
      },
    ],
  };

  const lrCriteriaRes = await maker
    .post(pBase + '/policies')
    .send({
      idempotencyKey: key(),
      kind: 'CRITERIA',
      mode: 'LR',
      body: lrCriteriaBodyV1,
      reason,
    })
    .expect(201);
  await checker
    .post(pBase + '/policies/' + lrCriteriaRes.body.id + '/approve')
    .send({ idempotencyKey: key(), reason })
    .expect(201);
  const lrCriteriaPolicyId = lrCriteriaRes.body.id as string;

  // Approve FOUR_SKILLS CRITERIA policy
  const fourCriteriaBody = {
    evidence: 'Chính sách gợi ý lớp 4 kỹ năng yêu cầu đủ điểm L/R và điểm Rubric S/W đã công bố',
    rules: [
      {
        skill: 'LISTENING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 50,
        max: 100,
        courseVersionIds: [fourSkillsProg.version.id],
      },
      {
        skill: 'READING',
        scale: 'INTERNAL_RAW_COUNT',
        minSamples: 50,
        min: 50,
        max: 100,
        courseVersionIds: [fourSkillsProg.version.id],
      },
      {
        skill: 'SPEAKING',
        scale: 'INTERNAL_0_100_DRAFT_RUBRIC',
        minSamples: 5,
        min: 40,
        max: 88,
        courseVersionIds: [fourSkillsProg.version.id],
      },
      {
        skill: 'WRITING',
        scale: 'INTERNAL_0_100_DRAFT_RUBRIC',
        minSamples: 5,
        min: 30,
        max: 64,
        courseVersionIds: [fourSkillsProg.version.id],
      },
    ],
  };
  const fourCriteriaRes = await maker
    .post(pBase + '/policies')
    .send({
      idempotencyKey: key(),
      kind: 'CRITERIA',
      mode: 'FOUR_SKILLS',
      body: fourCriteriaBody,
      reason,
    })
    .expect(201);
  await checker
    .post(pBase + '/policies/' + fourCriteriaRes.body.id + '/approve')
    .send({ idempotencyKey: key(), reason })
    .expect(201);
  const fourCriteriaPolicyId = fourCriteriaRes.body.id as string;

  // Preload all options for lrBank and fourBank so we can deterministically score each part
  const allLrQuestions = lrBank.snapshot.groups
    .filter((g) => ['LISTENING', 'READING'].includes(g.skill))
    .flatMap((g) =>
      g.questions.map((q) => ({
        part: normalizeCanonicalPartCode(g.taskCode as string, g.skill),
        skill: g.skill,
        testQuestionId: q.id,
        correctOptionId: q.options.find((o) => o.isCorrect)!.id,
        wrongOptionId: q.options.find((o) => !o.isCorrect)!.id,
      })),
    );

  async function completeLrAttemptWithPartTargets(
    student: { id: string; email: string },
    goalLR: number,
    partTargets: Record<string, number>,
  ) {
    const ag = f.agents.get(student.id)!;
    const start = (
      await ag
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: lrBank.version.id,
          policyId: lrTimingId,
          mode: 'LR',
          goalLR,
        })
        .expect(201)
    ).body;
    const attemptId = start.attemptId as string;
    let sit = (await ag.get(pBase + '/attempts/' + attemptId).expect(200)).body;
    const [{ sid }] = await d.prisma.$queryRaw<{ sid: string }[]>`
      SELECT sid FROM user_sessions WHERE sess->>'userId' = ${student.id} ORDER BY expire DESC LIMIT 1
    `;

    const partCounters: Record<string, number> = {};
    const listeningQuestions = allLrQuestions.filter((q) => q.skill === 'LISTENING');
    const readingQuestions = allLrQuestions.filter((q) => q.skill === 'READING');

    // Populate 100 LISTENING answers while sitting is in LISTENING phase
    await d.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.class_lms_actor', ${student.id}, true), set_config('app.class_lms_session', ${sid}, true)`;
      await tx.testAnswer.createMany({
        data: listeningQuestions.map((q) => {
          const idx = partCounters[q.part] ?? 0;
          partCounters[q.part] = idx + 1;
          const targetCorrect = partTargets[q.part] ?? 0;
          const isRight = idx < targetCorrect;
          return {
            attemptId,
            testQuestionId: q.testQuestionId,
            selectedOptionIds: [isRight ? q.correctOptionId : q.wrongOptionId],
          };
        }),
      });
    });

    // Transition LISTENING -> READING
    sit = (
      await ag
        .post(pBase + '/attempts/' + attemptId + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action: 'NEXT' })
        .expect(201)
    ).body;

    // Populate 100 READING answers while sitting is in READING phase
    await d.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.class_lms_actor', ${student.id}, true), set_config('app.class_lms_session', ${sid}, true)`;
      await tx.testAnswer.createMany({
        data: readingQuestions.map((q) => {
          const idx = partCounters[q.part] ?? 0;
          partCounters[q.part] = idx + 1;
          const targetCorrect = partTargets[q.part] ?? 0;
          const isRight = idx < targetCorrect;
          return {
            attemptId,
            testQuestionId: q.testQuestionId,
            selectedOptionIds: [isRight ? q.correctOptionId : q.wrongOptionId],
          };
        }),
      });
    });

    // Transition READING -> SUBMITTED (triggers finish() -> rawParts() -> PlacementHumanEvaluation)
    await ag
      .post(pBase + '/attempts/' + attemptId + '/commands')
      .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action: 'NEXT' })
      .expect(201);

    const lrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId, skill: 'LR' },
    });
    await checker
      .post(pBase + '/evaluations/' + lrEval.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    return attemptId;
  }

  // Cohort A: 110/200 total (78/100 Listening: P1=6, P2=20, P3=30, P4=22; 32/100 Reading: P5=6, P6=4, P7=22)
  const cohortAAttemptId = await completeLrAttemptWithPartTargets(hvCohortA, 600, {
    P1: 6,
    P2: 20,
    P3: 30,
    P4: 22,
    P5: 6,
    P6: 4,
    P7: 22,
  });

  // Cohort B: 110/200 total (32/100 Listening: P1=2, P2=7, P3=13, P4=10; 78/100 Reading: P5=24, P6=13, P7=41)
  const cohortBAttemptId = await completeLrAttemptWithPartTargets(hvCohortB, 600, {
    P1: 2,
    P2: 7,
    P3: 13,
    P4: 10,
    P5: 24,
    P6: 13,
    P7: 41,
  });

  // Cohort C: 110/200 total (55/100 Listening: P1=4, P2=14, P3=21, P4=16; 55/100 Reading: P5=17, P6=9, P7=29)
  const cohortCAttemptId = await completeLrAttemptWithPartTargets(hvCohortC, 600, {
    P1: 4,
    P2: 14,
    P3: 21,
    P4: 16,
    P5: 17,
    P6: 9,
    P7: 29,
  });

  // Also give primary enrolled student (Bùi Thị Minh Châu) a completed LR attempt so her dashboard has a result
  const primaryLearnerAttemptId = await completeLrAttemptWithPartTargets(f.learner, 600, {
    P1: 6,
    P2: 19,
    P3: 29,
    P4: 21,
    P5: 8,
    P6: 5,
    P7: 22,
  });

  // Cohort G: 178/200 total (90/100 Listening + 88/100 Reading -> matches Intensive 750+ which has only FULL class)
  const cohortGAttemptId = await completeLrAttemptWithPartTargets(hvCohortG, 800, {
    P1: 6,
    P2: 23,
    P3: 35,
    P4: 26,
    P5: 27,
    P6: 14,
    P7: 47,
  });

  // Helper to complete a FOUR_SKILLS sitting
  const allFourLrQuestions = fourBank.snapshot.groups
    .filter((g) => ['LISTENING', 'READING'].includes(g.skill))
    .flatMap((g) =>
      g.questions.map((q) => ({
        part: normalizeCanonicalPartCode(g.taskCode as string, g.skill),
        skill: g.skill,
        testQuestionId: q.id,
        correctOptionId: q.options.find((o) => o.isCorrect)!.id,
        wrongOptionId: q.options.find((o) => !o.isCorrect)!.id,
      })),
    );

  async function completeFourSkillsSitting(
    student: { id: string; email: string },
    partTargets: Record<string, number>,
    finalizeAndPublishSw: boolean,
  ) {
    const ag = f.agents.get(student.id)!;
    const start = (
      await ag
        .post(pBase + '/attempts')
        .send({
          idempotencyKey: key(),
          sourceVersionId: fourBank.version.id,
          policyId: fourTimingId,
          mode: 'FOUR_SKILLS',
          goalLR: 650,
          goalSpeaking: 150,
          goalWriting: 160,
        })
        .expect(201)
    ).body;
    const attemptId = start.attemptId as string;
    let sit = (await ag.get(pBase + '/attempts/' + attemptId).expect(200)).body;
    const [{ sid }] = await d.prisma.$queryRaw<{ sid: string }[]>`
      SELECT sid FROM user_sessions WHERE sess->>'userId' = ${student.id} ORDER BY expire DESC LIMIT 1
    `;

    const partCounters: Record<string, number> = {};
    const fourListeningQs = allFourLrQuestions.filter((q) => q.skill === 'LISTENING');
    const fourReadingQs = allFourLrQuestions.filter((q) => q.skill === 'READING');

    // Populate 100 LISTENING answers while sitting is in LISTENING phase
    await d.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.class_lms_actor', ${student.id}, true), set_config('app.class_lms_session', ${sid}, true)`;
      await tx.testAnswer.createMany({
        data: fourListeningQs.map((q) => {
          const idx = partCounters[q.part] ?? 0;
          partCounters[q.part] = idx + 1;
          const isRight = idx < (partTargets[q.part] ?? 0);
          return {
            attemptId,
            testQuestionId: q.testQuestionId,
            selectedOptionIds: [isRight ? q.correctOptionId : q.wrongOptionId],
          };
        }),
      });
    });

    // Transition LISTENING -> READING
    sit = (
      await ag
        .post(pBase + '/attempts/' + attemptId + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action: 'NEXT' })
        .expect(201)
    ).body;

    // Populate 100 READING answers while sitting is in READING phase
    await d.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.class_lms_actor', ${student.id}, true), set_config('app.class_lms_session', ${sid}, true)`;
      await tx.testAnswer.createMany({
        data: fourReadingQs.map((q) => {
          const idx = partCounters[q.part] ?? 0;
          partCounters[q.part] = idx + 1;
          const isRight = idx < (partTargets[q.part] ?? 0);
          return {
            attemptId,
            testQuestionId: q.testQuestionId,
            selectedOptionIds: [isRight ? q.correctOptionId : q.wrongOptionId],
          };
        }),
      });
    });

    // Transition READING -> BREAK -> SPEAKING
    for (const action of ['BREAK', 'NEXT']) {
      sit = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/commands')
          .send({ idempotencyKey: key(), expectedLockVersion: sit.lockVersion, action })
          .expect(201)
      ).body;
    }

    // Complete 11 Speaking tasks
    const speakingGroups = fourBank.groups.filter((g) => g.group.skill === 'SPEAKING');
    for (const sg of speakingGroups) {
      const qId = sg.questions[0].tq.id;
      const tabId = key();
      const token = key();
      const ticket = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/recordings/' + qId + '/begin')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: sit.lockVersion,
            tabId,
            token,
          })
          .expect(201)
      ).body;
      const up = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/recordings/' + qId)
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
      sit = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: up.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }

    // Complete 8 Writing tasks
    const writingGroups = fourBank.groups.filter((g) => g.group.skill === 'WRITING');
    for (const wg of writingGroups) {
      const qId = wg.questions[0].tq.id;
      sit = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/answers')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: sit.lockVersion,
            questionId: qId,
            textResponse: `Dear Project Team, regarding task ${wg.group.taskCode}, I propose scheduling a 30-minute coordination call tomorrow morning to finalize our client deliverable.`,
          })
          .expect(201)
      ).body;
      sit = (
        await ag
          .post(pBase + '/attempts/' + attemptId + '/commands')
          .send({
            idempotencyKey: key(),
            expectedLockVersion: sit.lockVersion,
            action: 'NEXT',
          })
          .expect(201)
      ).body;
    }

    // Publish LR objective evaluation
    const lrEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
      where: { attemptId, skill: 'LR' },
    });
    await checker
      .post(pBase + '/evaluations/' + lrEval.id + '/publish')
      .send({ idempotencyKey: key(), reason })
      .expect(201);

    // Assign instructor grader
    await maker
      .post(pBase + '/attempts/' + attemptId + '/assignments')
      .send({
        idempotencyKey: key(),
        graderId: f.teacher.id,
        eligibilityConfirmed: true,
        reason,
      })
      .expect(201);

    if (finalizeAndPublishSw) {
      // GV inspects review & recordings
      await gv.get(pBase + '/attempts/' + attemptId + '/review').expect(200);
      for (const sg of speakingGroups) {
        const qId = sg.questions[0].tq.id;
        await gv.get(pBase + '/attempts/' + attemptId + '/recordings/' + qId).expect(200);
      }

      const speakingScores: Record<string, any[]> = {};
      for (const sg of speakingGroups) {
        speakingScores[sg.group.id] = [
          {
            code: 'TASK_FULFILLMENT',
            score: 3,
            evidence: 'Trả lời đúng trọng tâm câu hỏi và đưa ra giải pháp rõ ràng.',
            feedback: 'Phát âm rõ, tốc độ nói ổn định, nên mở rộng thêm ví dụ thực tế.',
          },
          {
            code: 'LANGUAGE_DELIVERY',
            score: 3,
            evidence: 'Cấu trúc câu mạch lạc, sử dụng từ nối hợp lý.',
            feedback: 'Cần chú ý trọng âm từ đa âm tiết và ngữ điệu cuối câu.',
          },
        ];
      }
      const spkEval = (
        await gv
          .post(pBase + '/attempts/' + attemptId + '/evaluations')
          .send({
            idempotencyKey: key(),
            skill: 'SPEAKING',
            rubricId: fourRubricId,
            expectedNumber: 0,
            scores: speakingScores,
            originalEvidenceReviewed: true,
            reason,
          })
          .expect(201)
      ).body;

      const writingScores: Record<string, any[]> = {};
      for (const wg of writingGroups) {
        writingScores[wg.group.id] = [
          {
            code: 'TASK_FULFILLMENT',
            score: 3.5,
            evidence: 'Email phản hồi đầy đủ 3 yêu cầu trong đề bài với bố cục chuẩn.',
            feedback: 'Văn phong lịch sự, rõ ràng, phù hợp giao tiếp công sở.',
          },
          {
            code: 'LANGUAGE_DELIVERY',
            score: 3,
            evidence: 'Sử dụng đa dạng mệnh đề phụ thuộc và từ vựng thương mại.',
            feedback: 'Kiểm tra kỹ giới từ đi kèm danh từ chỉ thời gian.',
          },
        ];
      }
      const wrtEval = (
        await gv
          .post(pBase + '/attempts/' + attemptId + '/evaluations')
          .send({
            idempotencyKey: key(),
            skill: 'WRITING',
            rubricId: fourRubricId,
            expectedNumber: 0,
            scores: writingScores,
            originalEvidenceReviewed: true,
            reason,
          })
          .expect(201)
      ).body;

      await checker
        .post(pBase + '/evaluations/' + spkEval.id + '/publish')
        .send({ idempotencyKey: key(), reason })
        .expect(201);
      await checker
        .post(pBase + '/evaluations/' + wrtEval.id + '/publish')
        .send({ idempotencyKey: key(), reason })
        .expect(201);
    }

    return attemptId;
  }

  // Cohort D: FOUR_SKILLS with LR published (64 L + 62 R = 126/200) and S/W PENDING_REVIEW
  const cohortDAttemptId = await completeFourSkillsSitting(
    hvCohortD,
    { P1: 5, P2: 16, P3: 24, P4: 19, P5: 19, P6: 10, P7: 33 },
    false,
  );

  // Cohort E: FOUR_SKILLS with LR published (68 L + 66 R = 134/200) AND S/W graded & published (Speaking 66/88, Writing 52/64)
  const cohortEAttemptId = await completeFourSkillsSitting(
    hvCohortE,
    { P1: 5, P2: 17, P3: 26, P4: 20, P5: 20, P6: 11, P7: 35 },
    true,
  );

  // Cohort F: Low-Sample & Missing-Tag synthetic LR attempt (only 1 P1 question + 1 P7 question, untagged)
  const agF = f.agents.get(hvCohortF.id)!;
  const fStart = (
    await agF
      .post(pBase + '/attempts')
      .send({
        idempotencyKey: key(),
        sourceVersionId: smallBank.version.id,
        policyId: smallTimingId,
        mode: 'LR',
        goalLR: 550,
      })
      .expect(201)
  ).body;
  const cohortFAttemptId = fStart.attemptId as string;
  let fSit = (await agF.get(pBase + '/attempts/' + cohortFAttemptId).expect(200)).body;
  for (const action of ['NEXT', 'NEXT']) {
    fSit = (
      await agF
        .post(pBase + '/attempts/' + cohortFAttemptId + '/commands')
        .send({ idempotencyKey: key(), expectedLockVersion: fSit.lockVersion, action })
        .expect(201)
    ).body;
  }
  const fEval = await d.prisma.placementHumanEvaluation.findFirstOrThrow({
    where: { attemptId: cohortFAttemptId, skill: 'LR' },
  });
  await checker
    .post(pBase + '/evaluations/' + fEval.id + '/publish')
    .send({ idempotencyKey: key(), reason })
    .expect(201);

  return {
    ...f,
    cohorts: {
      hvCohortA,
      hvCohortB,
      hvCohortC,
      hvCohortD,
      hvCohortE,
      hvCohortF,
      hvCohortG,
    },
    attempts: {
      cohortAAttemptId,
      cohortBAttemptId,
      cohortCAttemptId,
      cohortDAttemptId,
      cohortEAttemptId,
      cohortFAttemptId,
      cohortGAttemptId,
      primaryLearnerAttemptId,
    },
    programs: {
      readingProg,
      listeningProg,
      balancedProg,
      intensiveProg,
      fourSkillsProg,
      upcomingCourse,
    },
    classes: {
      classReadingOpen,
      classListeningOpen,
      classBalancedOpen,
      classBalancedFull,
      classIntensiveFull,
      classFourSkillsOpen,
    },
    articles: {
      artListeningP12,
      artListeningP34,
      artGrammarP56,
      artSwRubric,
    },
    policies: {
      lrTimingId,
      fourTimingId,
      smallTimingId,
      fourRubricId,
      lrCriteriaPolicyId,
      fourCriteriaPolicyId,
    },
    banks: {
      lrBank,
      fourBank,
      smallBank,
    },
  };
}
