import { createHash } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AnswerEvaluationSource,
  AnswerEvaluationStatus,
  AssessmentStimulusType,
  ClassOfferingStatus,
  EnrollmentStatus,
  LessonProgressStatus,
  Prisma,
  PrismaClient,
  QuestionDifficulty,
  QuestionResponseType,
  ResourceType,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import {
  M06_FINAL_ASSESSMENT_ID,
  M06_FINAL_ATTEMPT_ID,
  M06_MIDTERM_ASSESSMENT_ID,
  M06_MIDTERM_TEST_ID,
  M06_PENDING_ATTEMPT_ID,
  M06_PERIODIC_ASSESSMENT_ID,
  M06_PERIODIC_TEST_ID,
} from './m06-seed';

const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(`smart-english:m07:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

interface M07SeedContext {
  courseId: string;
  classOfferingId: string;
  passwordHash: string;
}

const additionalLearners = [
  ['ngoc.anh', 'Trần Ngọc Anh'],
  ['minh.khang', 'Nguyễn Minh Khang'],
  ['hoang.lan', 'Lê Hoàng Lan'],
  ['gia.huy', 'Phạm Gia Huy'],
  ['thu.trang', 'Võ Thu Trang'],
  ['bao.long', 'Đặng Bảo Long'],
  ['thanh.ha', 'Bùi Thanh Hà'],
  ['quoc.viet', 'Đỗ Quốc Việt'],
  ['mai.phuong', 'Hồ Mai Phương'],
  ['tuan.dung', 'Trương Tuấn Dũng'],
] as const;

const progressCompletedCounts = [4, 2, 6, 8, 5, 3, 7, 1, 5, 8, 0] as const;
const M07_DRAFT_TEST_ID = stableUuid('manual-gate:draft-test');
const M07_QUESTION_PREFIX = 'M07-VG';

type GradingState = 'FINAL' | 'PARTIAL' | 'WAITING';
type ScoreSet = Record<ToeicSkill, number>;

export async function seedM07(prisma: PrismaClient, context: M07SeedContext): Promise<void> {
  const [instructor, primaryLearner, lessons] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'instructor.demo@smart-elearning.local' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'student.demo@smart-elearning.local' } }),
    prisma.lesson.findMany({
      where: { module: { courseId: context.courseId } },
      orderBy: [{ module: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      select: { id: true, title: true },
    }),
  ]);
  if (lessons.length < 8) throw new Error('M07 seed requires at least eight lessons');

  await seedClassStatusVariety(prisma);
  const enrollments = await seedLearnersAndProgress(prisma, context, primaryLearner.id, lessons);
  await seedResources(prisma, lessons[0]);
  const questions = await seedQuestionBank(prisma, context.courseId);
  await seedSafeDraft(prisma, context.courseId, questions);
  await seedAssessmentPack(prisma, {
    classOfferingId: context.classOfferingId,
    instructorId: instructor.id,
    enrollments,
  });
}

async function seedClassStatusVariety(prisma: PrismaClient) {
  await Promise.all([
    prisma.classOffering.update({
      where: { id: '11000000-0000-4000-8000-000000000003' },
      data: { status: ClassOfferingStatus.OPEN },
    }),
    prisma.classOffering.update({
      where: { id: '11000000-0000-4000-8000-000000000004' },
      data: { status: ClassOfferingStatus.COMPLETED },
    }),
    prisma.classOffering.update({
      where: { id: '11000000-0000-4000-8000-000000000005' },
      data: { status: ClassOfferingStatus.IN_PROGRESS },
    }),
    prisma.classOffering.update({
      where: { id: '11000000-0000-4000-8000-000000000006' },
      data: { status: ClassOfferingStatus.CANCELLED },
    }),
  ]);
}

async function seedLearnersAndProgress(
  prisma: PrismaClient,
  context: M07SeedContext,
  primaryLearnerId: string,
  lessons: Array<{ id: string; title: string }>,
) {
  const learnerIds = [primaryLearnerId];
  for (const [emailPrefix, fullName] of additionalLearners) {
    const learnerId = stableUuid(`learner:${emailPrefix}`);
    learnerIds.push(learnerId);
    await prisma.user.upsert({
      where: { email: `${emailPrefix}@smart-elearning.local` },
      update: {
        fullName,
        passwordHash: context.passwordHash,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      },
      create: {
        id: learnerId,
        email: `${emailPrefix}@smart-elearning.local`,
        fullName,
        passwordHash: context.passwordHash,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });
  }

  const result: Array<{ id: string; learnerId: string; email: string; fullName: string }> = [];
  for (const [learnerIndex, learnerId] of learnerIds.entries()) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: learnerId } });
    const enrollment = await prisma.enrollment.upsert({
      where: {
        learnerId_classOfferingId: {
          learnerId,
          classOfferingId: context.classOfferingId,
        },
      },
      update: { status: EnrollmentStatus.ACTIVE, enrolledAt: new Date('2026-09-01T00:00:00Z') },
      create: {
        id:
          learnerIndex === 0
            ? '50000000-0000-4000-8000-000000000001'
            : stableUuid(`enrollment:${user.email}`),
        learnerId,
        classOfferingId: context.classOfferingId,
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00Z'),
      },
    });
    result.push({ id: enrollment.id, learnerId, email: user.email, fullName: user.fullName });

    const completedCount = progressCompletedCounts[learnerIndex];
    const activityAt =
      learnerIndex < 3
        ? new Date(`2026-09-${String(12 + learnerIndex).padStart(2, '0')}T02:00:00Z`)
        : new Date(`2026-10-${String(2 + (learnerIndex % 4)).padStart(2, '0')}T02:00:00Z`);
    for (const [lessonIndex, lesson] of lessons.entries()) {
      const status =
        lessonIndex < completedCount
          ? LessonProgressStatus.COMPLETED
          : lessonIndex === completedCount && completedCount < lessons.length
            ? LessonProgressStatus.IN_PROGRESS
            : LessonProgressStatus.NOT_STARTED;
      await prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
        update: {
          status,
          lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : activityAt,
          completedAt: status === LessonProgressStatus.COMPLETED ? activityAt : null,
        },
        create: {
          id: stableUuid(`progress:${user.email}:${lesson.id}`),
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
          status,
          lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : activityAt,
          completedAt: status === LessonProgressStatus.COMPLETED ? activityAt : null,
        },
      });
    }
  }
  await prisma.enrollment.updateMany({
    where: {
      classOfferingId: context.classOfferingId,
      status: EnrollmentStatus.ACTIVE,
      learnerId: { notIn: learnerIds },
    },
    data: { status: EnrollmentStatus.DROPPED },
  });
  return result;
}

async function seedResources(prisma: PrismaClient, lesson: { id: string; title: string }) {
  const storageKey = 'm07/instructor-class-handbook.txt';
  const storagePath = resolve(process.cwd(), '.local-storage', 'learning-resources', storageKey);
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(
    storagePath,
    'Smart English — Cẩm nang học tập của lớp\nTài liệu demo do dự án tự biên soạn.\n',
    'utf8',
  );
  const resources = [
    {
      key: 'stored-resource',
      title: 'Cẩm nang học tập của lớp',
      type: ResourceType.DOCUMENT,
      url: null,
      storageKey,
      originalFileName: 'cam-nang-hoc-tap.txt',
      mimeType: 'text/plain',
      isDownloadable: true,
      orderIndex: 10,
    },
    {
      key: 'youtube-resource',
      title: 'Trải nghiệm bài thi TOEIC Listening & Reading',
      type: ResourceType.VIDEO,
      url: 'https://www.youtube.com/watch?v=322j91OdHH0',
      storageKey: null,
      originalFileName: null,
      mimeType: null,
      isDownloadable: false,
      orderIndex: 11,
    },
    {
      key: 'external-resource',
      title: 'Tài nguyên TOEIC tham khảo',
      type: ResourceType.LINK,
      url: 'https://www.ets.org/toeic/test-takers/about.html',
      storageKey: null,
      originalFileName: null,
      mimeType: 'text/html',
      isDownloadable: false,
      orderIndex: 12,
    },
  ] as const;
  for (const resource of resources) {
    const { key, ...data } = resource;
    const id = stableUuid(key);
    await prisma.learningResource.upsert({
      where: { id },
      update: { lessonId: lesson.id, ...data },
      create: { id, lessonId: lesson.id, ...data },
    });
  }
}

async function seedQuestionBank(prisma: PrismaClient, courseId: string) {
  const rubricQuestions = await prisma.question.findMany({
    where: {
      toeicSkill: { in: [ToeicSkill.SPEAKING, ToeicSkill.WRITING] },
      rubric: { isActive: true },
    },
    orderBy: { id: 'asc' },
    select: { toeicSkill: true, rubricId: true },
  });
  const speakingRubricId = rubricQuestions.find((item) => item.toeicSkill === ToeicSkill.SPEAKING)?.rubricId;
  const writingRubricId = rubricQuestions.find((item) => item.toeicSkill === ToeicSkill.WRITING)?.rubricId;
  if (!speakingRubricId || !writingRubricId) throw new Error('M07 seed requires active M05 productive rubrics');

  const definitions = [
    { skill: ToeicSkill.LISTENING, count: 24, type: QuestionResponseType.SINGLE_CHOICE, rubricId: null },
    { skill: ToeicSkill.READING, count: 24, type: QuestionResponseType.SINGLE_CHOICE, rubricId: null },
    { skill: ToeicSkill.SPEAKING, count: 16, type: QuestionResponseType.AUDIO_RESPONSE, rubricId: speakingRubricId },
    { skill: ToeicSkill.WRITING, count: 16, type: QuestionResponseType.TEXT_RESPONSE, rubricId: writingRubricId },
  ] as const;
  const questionIds = new Map<ToeicSkill, string[]>();
  for (const definition of definitions) {
    for (let index = 1; index <= definition.count; index += 1) {
      const sequence = String(index).padStart(2, '0');
      const code = `${M07_QUESTION_PREFIX}-${definition.skill.slice(0, 1)}-${sequence}`;
      const id = stableUuid(`question:${definition.skill}:${index}`);
      const difficulty = [QuestionDifficulty.EASY, QuestionDifficulty.MEDIUM, QuestionDifficulty.HARD][
        (index - 1) % 3
      ];
      const content = productivePrompt(definition.skill, code, index);
      await prisma.question.upsert({
        where: { id },
        update: {
          courseId,
          responseType: definition.type,
          legacyType: definition.type === QuestionResponseType.SINGLE_CHOICE ? 'SINGLE_CHOICE' : null,
          difficulty,
          toeicSkill: definition.skill,
          content,
          explanation:
            definition.type === QuestionResponseType.SINGLE_CHOICE
              ? 'Nội dung và đáp án do dự án tự biên soạn cho dữ liệu demo M07.'
              : 'Chấm theo rubric đang hoạt động của kỹ năng.',
          rubricId: definition.rubricId,
        },
        create: {
          id,
          courseId,
          responseType: definition.type,
          legacyType: definition.type === QuestionResponseType.SINGLE_CHOICE ? 'SINGLE_CHOICE' : null,
          difficulty,
          toeicSkill: definition.skill,
          content,
          explanation:
            definition.type === QuestionResponseType.SINGLE_CHOICE
              ? 'Nội dung và đáp án do dự án tự biên soạn cho dữ liệu demo M07.'
              : 'Chấm theo rubric đang hoạt động của kỹ năng.',
          rubricId: definition.rubricId,
        },
      });
      if (definition.type === QuestionResponseType.SINGLE_CHOICE) {
        for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
          await prisma.questionOption.upsert({
            where: { questionId_orderIndex: { questionId: id, orderIndex: optionIndex } },
            update: {
              content: objectiveOption(definition.skill, index, optionIndex),
              isCorrect: optionIndex === index % 4,
            },
            create: {
              id: stableUuid(`question:${definition.skill}:${index}:option:${optionIndex}`),
              questionId: id,
              content: objectiveOption(definition.skill, index, optionIndex),
              isCorrect: optionIndex === index % 4,
              orderIndex: optionIndex,
            },
          });
        }
      }
      const ids = questionIds.get(definition.skill) ?? [];
      ids.push(id);
      questionIds.set(definition.skill, ids);
    }
  }
  return questionIds;
}

function productivePrompt(skill: ToeicSkill, code: string, index: number) {
  if (skill === ToeicSkill.LISTENING)
    return `${code} — Situation ${index}: You hear an office announcement confirming that the customer-service desk closes at 5:30 p.m. for a staff meeting. What closing time is confirmed?`;
  if (skill === ToeicSkill.READING)
    return `${code} — Situation ${index}: A colleague asks you to confirm attendance at Friday's 2:00 p.m. project meeting. Which response best completes the email?`;
  if (skill === ToeicSkill.SPEAKING)
    return `${code} — Situation ${index}: Record a 30–45 second response. Your team meeting was moved from Room 201 to Room 305. Inform a colleague of the new room and ask them to acknowledge the change.`;
  return `${code} — Situation ${index}: Write a 60–90 word professional email. A client requested delivery on Friday, but the earliest available date is Monday. Explain the delay, propose Monday delivery, and ask the client to confirm.`;
}

function objectiveOption(skill: ToeicSkill, questionIndex: number, optionIndex: number) {
  const labels = ['Schedule confirmed', 'Venue changed', 'Request declined', 'Follow-up required'];
  return `${labels[optionIndex]} — ${skill.toLowerCase()} demo ${questionIndex}`;
}

async function seedSafeDraft(
  prisma: PrismaClient,
  courseId: string,
  questionIds: Map<ToeicSkill, string[]>,
) {
  const attemptCount = await prisma.testAttempt.count({ where: { testId: M07_DRAFT_TEST_ID } });
  if (attemptCount > 0) throw new Error('M07 safe draft unexpectedly has historical attempts');
  await prisma.test.upsert({
    where: { id: M07_DRAFT_TEST_ID },
    update: {
      courseId,
      lessonId: null,
      purpose: TestPurpose.IN_CLASS,
      placementMode: null,
      title: 'VG-R3 — Đề demo hướng dẫn',
      description: 'Bản nháp an toàn để Product Owner kiểm tra quy trình biên soạn.',
      status: TestStatus.DRAFT,
      maxAttempts: 1,
      timeLimitMinutes: 30,
      showResultAfterSubmit: true,
    },
    create: {
      id: M07_DRAFT_TEST_ID,
      courseId,
      purpose: TestPurpose.IN_CLASS,
      title: 'VG-R3 — Đề demo hướng dẫn',
      description: 'Bản nháp an toàn để Product Owner kiểm tra quy trình biên soạn.',
      status: TestStatus.DRAFT,
      maxAttempts: 1,
      timeLimitMinutes: 30,
      showResultAfterSubmit: true,
    },
  });
  await prisma.testQuestion.deleteMany({ where: { testId: M07_DRAFT_TEST_ID } });
  await prisma.testQuestionGroup.deleteMany({ where: { testId: M07_DRAFT_TEST_ID } });
  const skills = [ToeicSkill.LISTENING, ToeicSkill.READING, ToeicSkill.SPEAKING, ToeicSkill.WRITING];
  for (const [index, skill] of skills.entries()) {
    const groupId = stableUuid(`manual-gate:draft-group:${skill}`);
    await prisma.testQuestionGroup.create({
      data: {
        id: groupId,
        testId: M07_DRAFT_TEST_ID,
        skill,
        orderIndex: index,
        title: `${index + 1}. Phần ${skill === ToeicSkill.LISTENING ? 'Nghe' : skill === ToeicSkill.READING ? 'Đọc' : skill === ToeicSkill.SPEAKING ? 'Nói' : 'Viết'}`,
        instructions: 'Nội dung hướng dẫn demo do dự án tự biên soạn.',
      },
    });
    if (index === 0) {
      await prisma.assessmentStimulus.create({
        data: {
          id: stableUuid('manual-gate:draft-stimulus'),
          groupId,
          type: AssessmentStimulusType.TEXT,
          orderIndex: 0,
          textContent: 'A project-authored workplace announcement for the M07 builder demonstration.',
          isProtected: false,
        },
      });
    }
    await prisma.testQuestion.create({
      data: {
        id: stableUuid(`manual-gate:draft-test-question:${skill}`),
        testId: M07_DRAFT_TEST_ID,
        questionId: questionIds.get(skill)![0],
        groupId,
        orderIndex: index,
        points: 1,
      },
    });
  }
}

async function seedAssessmentPack(
  prisma: PrismaClient,
  context: {
    classOfferingId: string;
    instructorId: string;
    enrollments: Array<{ id: string; learnerId: string; email: string; fullName: string }>;
  },
) {
  await Promise.all([
    prisma.classAssessment.update({
      where: { id: M06_PERIODIC_ASSESSMENT_ID },
      data: { openAt: new Date('2026-09-01T00:00:00Z'), closeAt: new Date('2026-09-30T23:59:59Z') },
    }),
    prisma.classAssessment.update({
      where: { id: M06_MIDTERM_ASSESSMENT_ID },
      data: { openAt: new Date('2026-10-01T00:00:00Z'), closeAt: new Date('2026-10-31T23:59:59Z') },
    }),
    prisma.classAssessment.update({
      where: { id: M06_FINAL_ASSESSMENT_ID },
      data: { openAt: new Date('2026-11-15T00:00:00Z'), closeAt: new Date('2026-11-30T23:59:59Z') },
    }),
  ]);
  await resetM06AssessmentAttempts(prisma);

  const periodic = [
    score(84, 78, 74, 70),
    score(92, 88, 86, 84),
    score(68, 64, 62, 58),
    score(48, 56, 52, 46),
    score(76, 72, 68, 66),
    score(88, 80, 76, 72),
    score(66, 62, 64, 60),
    score(58, 54, 56, 52),
  ];
  for (let index = 0; index < 8; index += 1) {
    await seedAttempt(prisma, context, {
      attemptId: index === 0 ? M06_FINAL_ATTEMPT_ID : stableUuid(`periodic:${context.enrollments[index].email}`),
      assessmentId: M06_PERIODIC_ASSESSMENT_ID,
      testId: M06_PERIODIC_TEST_ID,
      enrollment: context.enrollments[index],
      attemptNumber: 1,
      gradingState: index < 6 ? 'FINAL' : index === 6 ? 'PARTIAL' : 'WAITING',
      scores: periodic[index],
      submittedAt: new Date(`2026-09-${String(18 + index).padStart(2, '0')}T12:30:00Z`),
    });
  }

  const primary = context.enrollments[0];
  await seedAttempt(prisma, context, {
    attemptId: M06_PENDING_ATTEMPT_ID,
    assessmentId: M06_MIDTERM_ASSESSMENT_ID,
    testId: M06_MIDTERM_TEST_ID,
    enrollment: primary,
    attemptNumber: 1,
    gradingState: 'WAITING',
    scores: score(78, 72, 68, 64),
    submittedAt: new Date('2026-10-02T12:55:00Z'),
  });
  const midterm = [
    score(88, 82, 78, 76),
    score(94, 90, 88, 86),
    score(72, 68, 66, 62),
    score(54, 60, 58, 52),
    score(82, 76, 72, 70),
    score(85, 73, 70, 66),
    score(62, 58, 56, 54),
  ];
  for (let index = 0; index < 7; index += 1) {
    await seedAttempt(prisma, context, {
      attemptId: stableUuid(`midterm:${context.enrollments[index].email}:latest`),
      assessmentId: M06_MIDTERM_ASSESSMENT_ID,
      testId: M06_MIDTERM_TEST_ID,
      enrollment: context.enrollments[index],
      attemptNumber: index === 0 ? 2 : 1,
      gradingState: index < 5 ? 'FINAL' : index === 5 ? 'PARTIAL' : 'WAITING',
      scores: midterm[index],
      submittedAt: new Date(`2026-10-${String(4 + index).padStart(2, '0')}T12:30:00Z`),
    });
  }
}

function score(listening: number, reading: number, speaking: number, writing: number): ScoreSet {
  return {
    [ToeicSkill.LISTENING]: listening,
    [ToeicSkill.READING]: reading,
    [ToeicSkill.SPEAKING]: speaking,
    [ToeicSkill.WRITING]: writing,
  };
}

async function resetM06AssessmentAttempts(prisma: PrismaClient) {
  const assessmentIds = [M06_PERIODIC_ASSESSMENT_ID, M06_MIDTERM_ASSESSMENT_ID, M06_FINAL_ASSESSMENT_ID];
  const attempts = await prisma.testAttempt.findMany({
    where: { classAssessmentId: { in: assessmentIds } },
    select: { id: true, answers: { select: { id: true, evaluations: { select: { id: true } } } } },
  });
  const attemptIds = attempts.map((item) => item.id);
  const answerIds = attempts.flatMap((item) => item.answers.map((answer) => answer.id));
  const evaluationIds = attempts.flatMap((item) =>
    item.answers.flatMap((answer) => answer.evaluations.map((evaluation) => evaluation.id)),
  );
  if (evaluationIds.length) {
    await prisma.rubricCriterionScore.deleteMany({ where: { answerEvaluationId: { in: evaluationIds } } });
    await prisma.answerEvaluation.deleteMany({ where: { id: { in: evaluationIds } } });
  }
  if (attemptIds.length) {
    await prisma.attemptSkillScore.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.attemptEvaluation.deleteMany({ where: { attemptId: { in: attemptIds } } });
  }
  if (answerIds.length) await prisma.testAnswer.deleteMany({ where: { id: { in: answerIds } } });
  if (attemptIds.length) await prisma.testAttempt.deleteMany({ where: { id: { in: attemptIds } } });
}

async function seedAttempt(
  prisma: PrismaClient,
  context: { instructorId: string },
  input: {
    attemptId: string;
    assessmentId: string;
    testId: string;
    enrollment: { id: string; learnerId: string; email: string; fullName: string };
    attemptNumber: number;
    gradingState: GradingState;
    scores: ScoreSet;
    submittedAt: Date;
  },
) {
  const testQuestions = await prisma.testQuestion.findMany({
    where: { testId: input.testId },
    orderBy: { orderIndex: 'asc' },
    include: {
      question: {
        include: {
          options: { orderBy: { orderIndex: 'asc' } },
          rubric: { include: { criteria: { orderBy: { orderIndex: 'asc' } } } },
        },
      },
    },
  });
  const objectiveQuestions = testQuestions.filter((item) => isObjective(item.question.responseType));
  const maxScore = testQuestions.reduce((sum, item) => sum + item.points, 0);
  await prisma.testAttempt.create({
    data: {
      id: input.attemptId,
      testId: input.testId,
      learnerId: input.enrollment.learnerId,
      enrollmentId: input.enrollment.id,
      classAssessmentId: input.assessmentId,
      attemptNumber: input.attemptNumber,
      status: TestAttemptStatus.SUBMITTED,
      score: objectiveQuestions.reduce((sum, item) => sum + item.points, 0),
      maxScore,
      startedAt: new Date(input.submittedAt.getTime() - 25 * 60_000),
      submittedAt: input.submittedAt,
    },
  });

  for (const testQuestion of testQuestions) {
    const question = testQuestion.question;
    const objective = isObjective(question.responseType);
    const audioStorageKey =
      question.responseType === QuestionResponseType.AUDIO_RESPONSE
        ? `${input.enrollment.learnerId}/${input.attemptId}/${testQuestion.id}/m07-manual-gate.mp3`
        : null;
    if (audioStorageKey) await seedAudioResponse(audioStorageKey);
    const answer = await prisma.testAnswer.create({
      data: {
        id: stableUuid(`${input.attemptId}:answer:${testQuestion.id}`),
        attemptId: input.attemptId,
        testQuestionId: testQuestion.id,
        selectedOptionIds: objective
          ? question.options.filter((option) => option.isCorrect).map((option) => option.id)
          : [],
        textResponse:
          question.responseType === QuestionResponseType.TEXT_RESPONSE
            ? 'Thank you for the update. I confirm the revised schedule and will send the requested summary before Friday.'
            : null,
        audioStorageKey,
        isCorrect: objective ? true : null,
        pointsAwarded: objective ? new Prisma.Decimal(testQuestion.points) : null,
      },
    });

    const productive = question.toeicSkill === ToeicSkill.SPEAKING || question.toeicSkill === ToeicSkill.WRITING;
    const shouldEvaluate =
      productive &&
      (input.gradingState === 'FINAL' ||
        (input.gradingState === 'PARTIAL' && question.toeicSkill === ToeicSkill.SPEAKING));
    if (shouldEvaluate && question.rubric) {
      const normalized = input.scores[question.toeicSkill];
      const evaluation = await prisma.answerEvaluation.create({
        data: {
          id: stableUuid(`${answer.id}:evaluation`),
          testAnswerId: answer.id,
          source: AnswerEvaluationSource.INSTRUCTOR,
          status: AnswerEvaluationStatus.REVIEWED_FINAL,
          evaluatorId: context.instructorId,
          totalScore: new Prisma.Decimal(normalized),
          feedback: `Nhận xét demo M07 cho ${input.enrollment.fullName}: đáp ứng đúng trọng tâm.`,
        },
      });
      for (const criterion of question.rubric.criteria) {
        await prisma.rubricCriterionScore.create({
          data: {
            id: stableUuid(`${evaluation.id}:criterion:${criterion.id}`),
            answerEvaluationId: evaluation.id,
            rubricCriterionId: criterion.id,
            score: criterion.maxScore
              .mul(normalized)
              .div(100)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            feedback: 'Dữ liệu minh họa cho Manual Visual Gate M07.',
          },
        });
      }
      await prisma.testAnswer.update({
        where: { id: answer.id },
        data: {
          pointsAwarded: new Prisma.Decimal(testQuestion.points)
            .mul(normalized)
            .div(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        },
      });
    }
  }

  for (const skill of [ToeicSkill.LISTENING, ToeicSkill.READING, ToeicSkill.SPEAKING, ToeicSkill.WRITING]) {
    const questions = testQuestions.filter((item) => item.question.toeicSkill === skill);
    const maxRawScore = questions.reduce((sum, item) => sum + item.points, 0);
    const productive = skill === ToeicSkill.SPEAKING || skill === ToeicSkill.WRITING;
    const isFinal =
      !productive ||
      input.gradingState === 'FINAL' ||
      (input.gradingState === 'PARTIAL' && skill === ToeicSkill.SPEAKING);
    if (productive && !isFinal) continue;
    await prisma.attemptSkillScore.create({
      data: {
        id: stableUuid(`${input.attemptId}:score:${skill}`),
        attemptId: input.attemptId,
        skill,
        rawScore: new Prisma.Decimal(maxRawScore).mul(input.scores[skill]).div(100),
        maxRawScore: new Prisma.Decimal(maxRawScore),
        normalizedScore: new Prisma.Decimal(input.scores[skill]),
        estimatedToeicScore: null,
        status: SkillScoreStatus.FINAL,
        source: productive
          ? SkillScoreSource.INSTRUCTOR_CONFIRMED
          : SkillScoreSource.OBJECTIVE_AUTO,
      },
    });
  }
}

async function seedAudioResponse(storageKey: string) {
  const apiRoot = resolve(__dirname, '..');
  const source = resolve(apiRoot, 'assets/assessment/m05/test1/audio/T1-L-P1-Q003.mp3');
  const destination = resolve(apiRoot, '.local-storage/assessment-responses', ...storageKey.split('/'));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function isObjective(responseType: QuestionResponseType) {
  return (
    responseType === QuestionResponseType.SINGLE_CHOICE ||
    responseType === QuestionResponseType.TRUE_FALSE ||
    responseType === QuestionResponseType.MULTIPLE_CHOICE
  );
}
