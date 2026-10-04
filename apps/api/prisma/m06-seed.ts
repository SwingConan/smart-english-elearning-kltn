import { createHash } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AnswerEvaluationSource,
  AnswerEvaluationStatus,
  AssessmentStage,
  Prisma,
  PrismaClient,
  QuestionResponseType,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../src/generated/prisma/client';
import { M05_FOUR_SKILLS_TEST_ID } from './m05-seed';

export const M06_PERIODIC_TEST_ID = '86000000-0000-4000-8000-000000000001';
export const M06_MIDTERM_TEST_ID = '86000000-0000-4000-8000-000000000002';
export const M06_FINAL_TEST_ID = '86000000-0000-4000-8000-000000000003';
export const M06_PERIODIC_ASSESSMENT_ID = 'f2600000-0000-4000-8000-000000000001';
export const M06_MIDTERM_ASSESSMENT_ID = 'f2600000-0000-4000-8000-000000000002';
export const M06_FINAL_ASSESSMENT_ID = 'f2600000-0000-4000-8000-000000000003';
export const M06_FINAL_ATTEMPT_ID = 'f3600000-0000-4000-8000-000000000001';
export const M06_PENDING_ATTEMPT_ID = 'f3600000-0000-4000-8000-000000000002';

const stableUuid = (key: string) => {
  const hex = createHash('sha256').update(`smart-english:m06:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};

interface M06SeedContext {
  courseId: string;
  classOfferingId: string;
  enrollmentId: string;
  learnerId: string;
  instructorId: string;
}

const forms = [
  {
    testId: M06_PERIODIC_TEST_ID,
    assessmentId: M06_PERIODIC_ASSESSMENT_ID,
    title: 'Kiểm tra thường kỳ 01',
    stage: AssessmentStage.PERIODIC,
    openAt: new Date('2026-08-01T00:00:00Z'),
    closeAt: new Date('2026-09-30T23:59:59Z'),
    maxAttempts: 1,
  },
  {
    testId: M06_MIDTERM_TEST_ID,
    assessmentId: M06_MIDTERM_ASSESSMENT_ID,
    title: 'Kiểm tra giữa kỳ',
    stage: AssessmentStage.MIDTERM,
    openAt: new Date('2026-10-01T00:00:00Z'),
    closeAt: new Date('2030-06-30T23:59:59Z'),
    maxAttempts: 2,
  },
  {
    testId: M06_FINAL_TEST_ID,
    assessmentId: M06_FINAL_ASSESSMENT_ID,
    title: 'Kiểm tra cuối kỳ',
    stage: AssessmentStage.FINAL,
    openAt: new Date('2031-07-01T00:00:00Z'),
    closeAt: new Date('2031-07-31T23:59:59Z'),
    maxAttempts: 1,
  },
] as const;

export async function seedM06(prisma: PrismaClient, context: M06SeedContext): Promise<void> {
  const sourceGroups = await prisma.testQuestionGroup.findMany({
    where: { testId: M05_FOUR_SKILLS_TEST_ID },
    orderBy: { orderIndex: 'asc' },
    include: {
      stimuli: { orderBy: { orderIndex: 'asc' } },
      testQuestions: { orderBy: { orderIndex: 'asc' } },
    },
  });
  if (sourceGroups.length === 0) throw new Error('M06 seed requires the canonical M05 content');

  const remaining = new Map<ToeicSkill, number>([
    [ToeicSkill.LISTENING, 4],
    [ToeicSkill.READING, 4],
    [ToeicSkill.SPEAKING, 2],
    [ToeicSkill.WRITING, 1],
  ]);
  const selectedGroups = sourceGroups.flatMap((group) => {
    const take = Math.min(remaining.get(group.skill) ?? 0, group.testQuestions.length);
    if (take <= 0) return [];
    remaining.set(group.skill, (remaining.get(group.skill) ?? 0) - take);
    return [{ ...group, testQuestions: group.testQuestions.slice(0, take) }];
  });
  if ([...remaining.values()].some((value) => value !== 0)) {
    throw new Error('M06 seed could not select the canonical 4L/4R/2S/1W task mix');
  }

  for (const form of forms) {
    await prisma.test.upsert({
      where: { id: form.testId },
      update: {
        courseId: context.courseId,
        lessonId: null,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: form.title,
        description: 'Bài kiểm tra nội bộ bốn kỹ năng với phần chấm Speaking/Writing của giảng viên.',
        status: TestStatus.PUBLISHED,
        maxAttempts: form.maxAttempts,
        timeLimitMinutes: 30,
        showResultAfterSubmit: true,
      },
      create: {
        id: form.testId,
        courseId: context.courseId,
        purpose: TestPurpose.IN_CLASS,
        title: form.title,
        description: 'Bài kiểm tra nội bộ bốn kỹ năng với phần chấm Speaking/Writing của giảng viên.',
        status: TestStatus.PUBLISHED,
        maxAttempts: form.maxAttempts,
        timeLimitMinutes: 30,
        showResultAfterSubmit: true,
      },
    });

    let questionOrder = 0;
    for (const [groupOrder, sourceGroup] of selectedGroups.entries()) {
      const groupId = stableUuid(`${form.testId}:group:${groupOrder}`);
      await prisma.testQuestionGroup.upsert({
        where: { id: groupId },
        update: {
          testId: form.testId,
          skill: sourceGroup.skill,
          orderIndex: groupOrder,
          title: sourceGroup.title,
          instructions: sourceGroup.instructions,
          stimulusText: sourceGroup.stimulusText,
          audioUrl: sourceGroup.audioUrl,
          taskCode: sourceGroup.taskCode,
          preparationSeconds: sourceGroup.preparationSeconds,
          responseSeconds: sourceGroup.responseSeconds,
          recommendedSeconds: sourceGroup.recommendedSeconds,
          maxRecordingSeconds: sourceGroup.maxRecordingSeconds,
        },
        create: {
          id: groupId,
          testId: form.testId,
          skill: sourceGroup.skill,
          orderIndex: groupOrder,
          title: sourceGroup.title,
          instructions: sourceGroup.instructions,
          stimulusText: sourceGroup.stimulusText,
          audioUrl: sourceGroup.audioUrl,
          taskCode: sourceGroup.taskCode,
          preparationSeconds: sourceGroup.preparationSeconds,
          responseSeconds: sourceGroup.responseSeconds,
          recommendedSeconds: sourceGroup.recommendedSeconds,
          maxRecordingSeconds: sourceGroup.maxRecordingSeconds,
        },
      });
      for (const stimulus of sourceGroup.stimuli) {
        const stimulusId = stableUuid(`${form.testId}:group:${groupOrder}:stimulus:${stimulus.orderIndex}`);
        await prisma.assessmentStimulus.upsert({
          where: { id: stimulusId },
          update: {
            groupId,
            type: stimulus.type,
            orderIndex: stimulus.orderIndex,
            textContent: stimulus.textContent,
            storageKey: stimulus.storageKey,
            mimeType: stimulus.mimeType,
            altText: stimulus.altText,
            isProtected: stimulus.isProtected,
          },
          create: {
            id: stimulusId,
            groupId,
            type: stimulus.type,
            orderIndex: stimulus.orderIndex,
            textContent: stimulus.textContent,
            storageKey: stimulus.storageKey,
            mimeType: stimulus.mimeType,
            altText: stimulus.altText,
            isProtected: stimulus.isProtected,
          },
        });
      }
      for (const sourceQuestion of sourceGroup.testQuestions) {
        const testQuestionId = stableUuid(`${form.testId}:question:${questionOrder}`);
        // M05 productive Placement prompts are intentionally unscored. Their
        // M06 in-class copies must carry positive points so instructor grading
        // can produce a finite skill normalization.
        const points =
          sourceGroup.skill === ToeicSkill.SPEAKING || sourceGroup.skill === ToeicSkill.WRITING
            ? 1
            : sourceQuestion.points;
        await prisma.testQuestion.upsert({
          where: { id: testQuestionId },
          update: {
            testId: form.testId,
            questionId: sourceQuestion.questionId,
            groupId,
            orderIndex: questionOrder,
            points,
          },
          create: {
            id: testQuestionId,
            testId: form.testId,
            questionId: sourceQuestion.questionId,
            groupId,
            orderIndex: questionOrder,
            points,
          },
        });
        questionOrder += 1;
      }
    }

    await prisma.classAssessment.upsert({
      where: { id: form.assessmentId },
      update: {
        classOfferingId: context.classOfferingId,
        testId: form.testId,
        stage: form.stage,
        openAt: form.openAt,
        closeAt: form.closeAt,
        maxAttemptsOverride: form.maxAttempts,
        isActive: true,
      },
      create: {
        id: form.assessmentId,
        classOfferingId: context.classOfferingId,
        testId: form.testId,
        stage: form.stage,
        openAt: form.openAt,
        closeAt: form.closeAt,
        maxAttemptsOverride: form.maxAttempts,
        isActive: true,
      },
    });
  }

  await seedAttempt(prisma, context, {
    attemptId: M06_FINAL_ATTEMPT_ID,
    testId: M06_PERIODIC_TEST_ID,
    classAssessmentId: M06_PERIODIC_ASSESSMENT_ID,
    finalReviewed: true,
    startedAt: new Date('2026-09-20T12:30:00Z'),
    submittedAt: new Date('2026-09-20T12:55:00Z'),
  });
  await seedAttempt(prisma, context, {
    attemptId: M06_PENDING_ATTEMPT_ID,
    testId: M06_MIDTERM_TEST_ID,
    classAssessmentId: M06_MIDTERM_ASSESSMENT_ID,
    finalReviewed: false,
    startedAt: new Date('2026-10-02T12:30:00Z'),
    submittedAt: new Date('2026-10-02T12:55:00Z'),
  });
}

async function seedAttempt(
  prisma: PrismaClient,
  context: M06SeedContext,
  input: {
    attemptId: string;
    testId: string;
    classAssessmentId: string;
    finalReviewed: boolean;
    startedAt: Date;
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
  const objective = testQuestions.filter(({ question }) =>
    isObjectiveResponse(question.responseType),
  );
  const existingEvaluations = await prisma.answerEvaluation.findMany({
    where: {
      source: AnswerEvaluationSource.INSTRUCTOR,
      testAnswer: { attemptId: input.attemptId },
    },
    select: { id: true },
  });
  const evaluationIds = existingEvaluations.map(({ id }) => id);
  if (evaluationIds.length > 0) {
    await prisma.rubricCriterionScore.deleteMany({
      where: { answerEvaluationId: { in: evaluationIds } },
    });
    await prisma.answerEvaluation.deleteMany({ where: { id: { in: evaluationIds } } });
  }
  await prisma.attemptSkillScore.deleteMany({
    where: {
      attemptId: input.attemptId,
      skill: { in: [ToeicSkill.SPEAKING, ToeicSkill.WRITING] },
    },
  });
  const objectiveScore = objective.reduce((sum, question) => sum + question.points, 0);
  await prisma.testAttempt.upsert({
    where: { id: input.attemptId },
    update: {
      testId: input.testId,
      learnerId: context.learnerId,
      enrollmentId: context.enrollmentId,
      classAssessmentId: input.classAssessmentId,
      attemptNumber: 1,
      status: TestAttemptStatus.SUBMITTED,
      score: objectiveScore,
      maxScore: objectiveScore,
      startedAt: input.startedAt,
      submittedAt: input.submittedAt,
    },
    create: {
      id: input.attemptId,
      testId: input.testId,
      learnerId: context.learnerId,
      enrollmentId: context.enrollmentId,
      classAssessmentId: input.classAssessmentId,
      attemptNumber: 1,
      status: TestAttemptStatus.SUBMITTED,
      score: objectiveScore,
      maxScore: objectiveScore,
      startedAt: input.startedAt,
      submittedAt: input.submittedAt,
    },
  });

  for (const testQuestion of testQuestions) {
    const answerId = stableUuid(`${input.attemptId}:answer:${testQuestion.id}`);
    const responseType = testQuestion.question.responseType;
    const objectiveType = isObjectiveResponse(responseType);
    const audioStorageKey =
      responseType === QuestionResponseType.AUDIO_RESPONSE
        ? `${context.learnerId}/${input.attemptId}/${testQuestion.id}/seed-response.mp3`
        : null;
    if (audioStorageKey) await seedAudioResponse(audioStorageKey);
    const answer = await prisma.testAnswer.upsert({
      where: {
        attemptId_testQuestionId: {
          attemptId: input.attemptId,
          testQuestionId: testQuestion.id,
        },
      },
      update: {
        selectedOptionIds: objectiveType
          ? testQuestion.question.options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id)
          : [],
        textResponse:
          responseType === QuestionResponseType.TEXT_RESPONSE
            ? 'Thank you for the update. I can join the revised meeting time and will prepare the requested summary before Friday.'
            : null,
        audioStorageKey,
        isCorrect: objectiveType ? true : null,
        pointsAwarded:
          objectiveType || input.finalReviewed
            ? new Prisma.Decimal(testQuestion.points).mul(objectiveType ? '1' : '0.8')
            : null,
      },
      create: {
        id: answerId,
        attemptId: input.attemptId,
        testQuestionId: testQuestion.id,
        selectedOptionIds: objectiveType
          ? testQuestion.question.options.filter(({ isCorrect }) => isCorrect).map(({ id }) => id)
          : [],
        textResponse:
          responseType === QuestionResponseType.TEXT_RESPONSE
            ? 'Thank you for the update. I can join the revised meeting time and will prepare the requested summary before Friday.'
            : null,
        audioStorageKey,
        isCorrect: objectiveType ? true : null,
        pointsAwarded:
          objectiveType || input.finalReviewed
            ? new Prisma.Decimal(testQuestion.points).mul(objectiveType ? '1' : '0.8')
            : null,
      },
    });
    if (!objectiveType && input.finalReviewed && testQuestion.question.rubric) {
      const evaluationId = stableUuid(`${answer.id}:evaluation:instructor`);
      await prisma.answerEvaluation.upsert({
        where: { id: evaluationId },
        update: {
          testAnswerId: answer.id,
          source: AnswerEvaluationSource.INSTRUCTOR,
          status: AnswerEvaluationStatus.REVIEWED_FINAL,
          evaluatorId: context.instructorId,
          totalScore: new Prisma.Decimal(80),
          feedback: 'Phần trả lời rõ ràng, đúng trọng tâm. Hãy đa dạng hóa thêm cấu trúc câu.',
        },
        create: {
          id: evaluationId,
          testAnswerId: answer.id,
          source: AnswerEvaluationSource.INSTRUCTOR,
          status: AnswerEvaluationStatus.REVIEWED_FINAL,
          evaluatorId: context.instructorId,
          totalScore: new Prisma.Decimal(80),
          feedback: 'Phần trả lời rõ ràng, đúng trọng tâm. Hãy đa dạng hóa thêm cấu trúc câu.',
        },
      });
      for (const criterion of testQuestion.question.rubric.criteria) {
        await prisma.rubricCriterionScore.upsert({
          where: {
            answerEvaluationId_rubricCriterionId: {
              answerEvaluationId: evaluationId,
              rubricCriterionId: criterion.id,
            },
          },
          update: {
            score: criterion.maxScore.mul('0.8').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            feedback: 'Đáp ứng yêu cầu của tiêu chí.',
          },
          create: {
            answerEvaluationId: evaluationId,
            rubricCriterionId: criterion.id,
            score: criterion.maxScore.mul('0.8').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            feedback: 'Đáp ứng yêu cầu của tiêu chí.',
          },
        });
      }
    }
  }

  for (const skill of [ToeicSkill.LISTENING, ToeicSkill.READING, ToeicSkill.SPEAKING, ToeicSkill.WRITING]) {
    const questions = testQuestions.filter(({ question }) => question.toeicSkill === skill);
    const productive = skill === ToeicSkill.SPEAKING || skill === ToeicSkill.WRITING;
    if (productive && !input.finalReviewed) continue;
    const max = questions.reduce((sum, question) => sum + question.points, 0);
    const raw = new Prisma.Decimal(max).mul(productive ? '0.8' : '1');
    await prisma.attemptSkillScore.upsert({
      where: { attemptId_skill: { attemptId: input.attemptId, skill } },
      update: {
        rawScore: raw,
        maxRawScore: new Prisma.Decimal(max),
        normalizedScore: new Prisma.Decimal(productive ? 80 : 100),
        estimatedToeicScore: null,
        status: SkillScoreStatus.FINAL,
        source: productive
          ? SkillScoreSource.INSTRUCTOR_CONFIRMED
          : SkillScoreSource.OBJECTIVE_AUTO,
      },
      create: {
        attemptId: input.attemptId,
        skill,
        rawScore: raw,
        maxRawScore: new Prisma.Decimal(max),
        normalizedScore: new Prisma.Decimal(productive ? 80 : 100),
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
  const source = resolve(
    apiRoot,
    'assets/assessment/m05/test1/audio/T1-L-P1-Q003.mp3',
  );
  const destination = resolve(apiRoot, '.local-storage/assessment-responses', ...storageKey.split('/'));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function isObjectiveResponse(responseType: QuestionResponseType): boolean {
  return (
    responseType === QuestionResponseType.SINGLE_CHOICE ||
    responseType === QuestionResponseType.TRUE_FALSE ||
    responseType === QuestionResponseType.MULTIPLE_CHOICE
  );
}
