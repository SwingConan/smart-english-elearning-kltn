import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlacementMode,
  PlacementSelfLevel,
  Prisma,
  QuestionResponseType,
  SkillScoreSource,
  SkillScoreStatus,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
  ToeicSkill,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SavePlacementAnswerDto } from './dto/save-placement-answer.dto';
import { StartPlacementAttemptDto } from './dto/start-placement-attempt.dto';
import {
  PlacementSubmitReason,
  SubmitPlacementAttemptDto,
} from './dto/submit-placement-attempt.dto';
import {
  placementFormPolicyEntries,
  selectPlacementFormId,
} from './placement-form.policy';

const MAX_TRANSACTION_ATTEMPTS = 3;
const RESULT_DISCLAIMER =
  'Kết quả này là đánh giá nội bộ phục vụ xếp lớp, không phải điểm TOEIC chính thức.';

const placementAttemptInclude = {
  test: {
    include: {
      questionGroups: {
        orderBy: { orderIndex: 'asc' as const },
        include: {
          testQuestions: {
            orderBy: { orderIndex: 'asc' as const },
            include: {
              question: {
                include: { options: { orderBy: { orderIndex: 'asc' as const } } },
              },
            },
          },
        },
      },
      testQuestions: {
        orderBy: { orderIndex: 'asc' as const },
        include: {
          question: {
            include: { options: { orderBy: { orderIndex: 'asc' as const } } },
          },
        },
      },
    },
  },
  answers: true,
  skillScores: { orderBy: { skill: 'asc' as const } },
} satisfies Prisma.TestAttemptInclude;

type PlacementAttempt = Prisma.TestAttemptGetPayload<{
  include: typeof placementAttemptInclude;
}>;

@Injectable()
export class PlacementService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const policy = placementFormPolicyEntries();
    const tests = await this.prisma.test.findMany({
      where: {
        id: { in: [...new Set(policy.map(({ testId }) => testId))] },
        purpose: TestPurpose.PLACEMENT,
        placementMode: PlacementMode.LR,
        status: TestStatus.PUBLISHED,
      },
      select: { id: true, timeLimitMinutes: true },
    });
    const durations = new Map(tests.map((test) => [test.id, test.timeLimitMinutes]));

    return {
      modes: [
        { code: PlacementMode.LR, label: 'Listening & Reading', enabled: true },
        { code: PlacementMode.FOUR_SKILLS, label: '4 kỹ năng', enabled: false, note: 'Sắp có' },
      ],
      goalPresets: [450, 550, 650, 750],
      customGoalRange: { min: 10, max: 990 },
      selfLevels: [
        { code: PlacementSelfLevel.UNKNOWN, label: 'Tôi chưa biết trình độ' },
        { code: PlacementSelfLevel.BEGINNER, label: 'Mới bắt đầu' },
        { code: PlacementSelfLevel.BASIC, label: 'Cơ bản' },
        { code: PlacementSelfLevel.INTERMEDIATE, label: 'Trung bình' },
        { code: PlacementSelfLevel.GOOD, label: 'Khá' },
      ].map((option) => ({
        ...option,
        durationMinutes:
          durations.get(selectPlacementFormId(PlacementMode.LR, option.code) ?? '') ?? null,
      })),
      instructions: [
        'Chuẩn bị tai nghe và chọn không gian yên tĩnh.',
        'Câu trả lời được lưu tự động ngay khi bạn chọn.',
        'Đồng hồ do máy chủ kiểm soát và bài sẽ tự nộp khi hết giờ.',
      ],
      disclaimer: RESULT_DISCLAIMER,
    };
  }

  async startOrResume(learnerId: string, dto: StartPlacementAttemptDto) {
    if (dto.mode !== PlacementMode.LR) {
      throw new ConflictException({
        code: 'PLACEMENT_MODE_NOT_AVAILABLE',
        message: 'Bài kiểm tra 4 kỹ năng chưa khả dụng.',
      });
    }

    return this.runTransaction(async (transaction) => {
      const existing = await transaction.testAttempt.findFirst({
        where: {
          learnerId,
          enrollmentId: null,
          classAssessmentId: null,
          status: TestAttemptStatus.IN_PROGRESS,
          test: { purpose: TestPurpose.PLACEMENT, placementMode: PlacementMode.LR },
        },
        orderBy: { startedAt: 'asc' },
        include: { test: { select: { id: true, title: true, timeLimitMinutes: true } } },
      });

      if (existing) {
        if (this.isExpired(existing.startedAt, existing.test.timeLimitMinutes)) {
          await this.finalizeAttempt(transaction, learnerId, existing.id);
        } else {
          return this.startResponse(existing, true);
        }
      }

      const testId = selectPlacementFormId(dto.mode, dto.selfLevel);
      const test = testId
        ? await transaction.test.findFirst({
            where: {
              id: testId,
              purpose: TestPurpose.PLACEMENT,
              placementMode: PlacementMode.LR,
              status: TestStatus.PUBLISHED,
            },
            select: {
              id: true,
              title: true,
              timeLimitMinutes: true,
              maxAttempts: true,
              _count: { select: { testQuestions: true } },
            },
          })
        : null;
      if (!test || !test.timeLimitMinutes || test._count.testQuestions === 0) {
        throw new ConflictException({
          code: 'PLACEMENT_FORM_NOT_AVAILABLE',
          message: 'Chưa có bài kiểm tra phù hợp với lựa chọn hiện tại.',
        });
      }

      const attemptsUsed = await transaction.testAttempt.count({
        where: {
          learnerId,
          testId: test.id,
          enrollmentId: null,
          classAssessmentId: null,
        },
      });
      if (attemptsUsed >= test.maxAttempts) {
        throw new ConflictException({
          code: 'PLACEMENT_ATTEMPT_LIMIT_REACHED',
          message: 'Bạn đã dùng hết số lượt làm bài cho biểu mẫu này.',
        });
      }

      const created = await transaction.testAttempt.create({
        data: {
          learnerId,
          testId: test.id,
          enrollmentId: null,
          classAssessmentId: null,
          attemptNumber: attemptsUsed + 1,
          status: TestAttemptStatus.IN_PROGRESS,
          placementSelfLevel: dto.selfLevel,
          placementGoalScore: dto.goalScore,
        },
        include: { test: { select: { id: true, title: true, timeLimitMinutes: true } } },
      });
      return this.startResponse(created, false);
    }, 'Bài kiểm tra đang được khởi tạo ở một phiên khác. Vui lòng thử lại.');
  }

  async getExam(learnerId: string, attemptId: string) {
    return this.runTransaction(async (transaction) => {
      let attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      if (
        attempt.status === TestAttemptStatus.IN_PROGRESS &&
        this.isExpired(attempt.startedAt, attempt.test.timeLimitMinutes)
      ) {
        await this.finalizeAttempt(transaction, learnerId, attemptId);
        attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      }
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        return {
          state: 'SUBMITTED',
          attemptId,
          submittedAt: attempt.submittedAt,
          resultPath: `/placement/attempts/${attemptId}/result`,
        };
      }

      const saved = new Map(
        attempt.answers.map((answer) => [answer.testQuestionId, answer.selectedOptionIds]),
      );
      return {
        state: 'IN_PROGRESS',
        attempt: {
          id: attempt.id,
          startedAt: attempt.startedAt,
          expiresAt: this.expiresAt(attempt.startedAt, attempt.test.timeLimitMinutes),
          goalScore: attempt.placementGoalScore,
          selfLevel: attempt.placementSelfLevel,
        },
        test: {
          title: attempt.test.title,
          description: attempt.test.description,
          mode: attempt.test.placementMode,
          durationMinutes: attempt.test.timeLimitMinutes,
        },
        groups: attempt.test.questionGroups.map((group) => ({
          id: group.id,
          skill: group.skill,
          orderIndex: group.orderIndex,
          title: group.title,
          instructions: group.instructions,
          stimulusText: group.skill === ToeicSkill.READING ? group.stimulusText : null,
          audioUrl: group.audioUrl,
          questions: group.testQuestions.map((testQuestion) => ({
            testQuestionId: testQuestion.id,
            orderIndex: testQuestion.orderIndex,
            content: testQuestion.question.content,
            responseType: testQuestion.question.responseType,
            toeicSkill: testQuestion.question.toeicSkill,
            options: testQuestion.question.options.map((option) => ({
              id: option.id,
              content: option.content,
              orderIndex: option.orderIndex,
            })),
            selectedOptionIds: saved.get(testQuestion.id) ?? [],
          })),
        })),
      };
    }, 'Bài kiểm tra đang được cập nhật ở một phiên khác. Vui lòng thử lại.');
  }

  async saveAnswer(
    learnerId: string,
    attemptId: string,
    testQuestionId: string,
    dto: SavePlacementAnswerDto,
  ) {
    return this.runTransaction(async (transaction) => {
      const attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        throw new ConflictException({
          code: 'ATTEMPT_ALREADY_SUBMITTED',
          message: 'Bài kiểm tra đã được nộp.',
        });
      }
      if (this.isExpired(attempt.startedAt, attempt.test.timeLimitMinutes)) {
        await this.finalizeAttempt(transaction, learnerId, attemptId);
        throw new ConflictException({
          code: 'ATTEMPT_EXPIRED',
          message: 'Bài kiểm tra đã hết giờ và được tự động nộp.',
        });
      }

      const testQuestion = attempt.test.testQuestions.find(({ id }) => id === testQuestionId);
      if (!testQuestion) this.invalidAnswer();
      this.validateSelection(
        dto.selectedOptionIds,
        testQuestion.question.responseType,
        testQuestion.question.options.map(({ id }) => id),
      );
      const saved = await transaction.testAnswer.upsert({
        where: { attemptId_testQuestionId: { attemptId, testQuestionId } },
        update: { selectedOptionIds: dto.selectedOptionIds, isCorrect: null, pointsAwarded: null },
        create: { attemptId, testQuestionId, selectedOptionIds: dto.selectedOptionIds },
        select: { updatedAt: true },
      });
      return { attemptId, testQuestionId, savedAt: saved.updatedAt, state: 'SAVED' };
    }, 'Câu trả lời đang được lưu ở một phiên khác. Vui lòng thử lại.');
  }

  async submit(learnerId: string, attemptId: string, dto: SubmitPlacementAttemptDto) {
    return this.runTransaction(async (transaction) => {
      const attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        return this.buildResult(attempt);
      }
      const expired = this.isExpired(attempt.startedAt, attempt.test.timeLimitMinutes);
      if (dto.reason === PlacementSubmitReason.TIMEOUT && !expired) {
        throw new BadRequestException({
          code: 'ATTEMPT_NOT_EXPIRED',
          message: 'Không thể nộp theo lý do hết giờ khi đồng hồ vẫn còn thời gian.',
        });
      }
      return this.finalizeAttempt(transaction, learnerId, attemptId);
    }, 'Bài kiểm tra đang được nộp ở một phiên khác. Vui lòng thử lại.');
  }

  async getResult(learnerId: string, attemptId: string) {
    return this.runTransaction(async (transaction) => {
      let attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      if (
        attempt.status === TestAttemptStatus.IN_PROGRESS &&
        this.isExpired(attempt.startedAt, attempt.test.timeLimitMinutes)
      ) {
        await this.finalizeAttempt(transaction, learnerId, attemptId);
        attempt = await this.requireAttempt(transaction, learnerId, attemptId);
      }
      if (attempt.status !== TestAttemptStatus.SUBMITTED) {
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          message: 'Bài kiểm tra chưa được nộp.',
        });
      }
      return this.buildResult(attempt);
    }, 'Kết quả đang được cập nhật ở một phiên khác. Vui lòng thử lại.');
  }

  async getHistory(learnerId: string) {
    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        learnerId,
        status: TestAttemptStatus.SUBMITTED,
        enrollmentId: null,
        classAssessmentId: null,
        test: { purpose: TestPurpose.PLACEMENT },
      },
      orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }],
      select: {
        id: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        placementGoalScore: true,
        test: { select: { title: true, placementMode: true } },
        skillScores: {
          orderBy: { skill: 'asc' },
          select: {
            skill: true,
            rawScore: true,
            maxRawScore: true,
            normalizedScore: true,
          },
        },
      },
    });
    return attempts.map((attempt) => ({
      attemptId: attempt.id,
      title: attempt.test.title,
      mode: attempt.test.placementMode,
      goalScore: attempt.placementGoalScore,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      skillScores: attempt.skillScores,
      resultPath: `/placement/attempts/${attempt.id}/result`,
    }));
  }

  private async requireAttempt(
    transaction: Prisma.TransactionClient,
    learnerId: string,
    attemptId: string,
  ): Promise<PlacementAttempt> {
    const attempt = await transaction.testAttempt.findFirst({
      where: {
        id: attemptId,
        learnerId,
        enrollmentId: null,
        classAssessmentId: null,
        test: { purpose: TestPurpose.PLACEMENT, placementMode: PlacementMode.LR },
      },
      include: placementAttemptInclude,
    });
    if (!attempt) {
      throw new NotFoundException({ code: 'ATTEMPT_NOT_FOUND', message: 'Không tìm thấy bài làm.' });
    }
    return attempt;
  }

  private async finalizeAttempt(
    transaction: Prisma.TransactionClient,
    learnerId: string,
    attemptId: string,
  ) {
    const attempt = await this.requireAttempt(transaction, learnerId, attemptId);
    if (attempt.status === TestAttemptStatus.SUBMITTED) return this.buildResult(attempt);

    const answers = new Map(
      attempt.answers.map((answer) => [answer.testQuestionId, answer.selectedOptionIds]),
    );
    const totals = new Map<ToeicSkill, { raw: number; max: number }>([
      [ToeicSkill.LISTENING, { raw: 0, max: 0 }],
      [ToeicSkill.READING, { raw: 0, max: 0 }],
    ]);
    let score = 0;
    let maxScore = 0;

    for (const testQuestion of attempt.test.testQuestions) {
      if (
        testQuestion.question.toeicSkill !== ToeicSkill.LISTENING &&
        testQuestion.question.toeicSkill !== ToeicSkill.READING
      ) {
        continue;
      }
      const selectedOptionIds = answers.get(testQuestion.id) ?? [];
      const correctOptionIds = testQuestion.question.options
        .filter(({ isCorrect }) => isCorrect)
        .map(({ id }) => id);
      const isCorrect = this.sameSet(selectedOptionIds, correctOptionIds);
      const awarded = isCorrect ? testQuestion.points : 0;
      score += awarded;
      maxScore += testQuestion.points;
      const total = totals.get(testQuestion.question.toeicSkill)!;
      total.raw += awarded;
      total.max += testQuestion.points;

      await transaction.testAnswer.upsert({
        where: { attemptId_testQuestionId: { attemptId, testQuestionId: testQuestion.id } },
        update: { selectedOptionIds, isCorrect, pointsAwarded: awarded },
        create: {
          attemptId,
          testQuestionId: testQuestion.id,
          selectedOptionIds,
          isCorrect,
          pointsAwarded: awarded,
        },
      });
    }

    for (const skill of [ToeicSkill.LISTENING, ToeicSkill.READING]) {
      const total = totals.get(skill)!;
      const normalizedScore = this.percentage(total.raw, total.max);
      await transaction.attemptSkillScore.upsert({
        where: { attemptId_skill: { attemptId, skill } },
        update: {
          rawScore: total.raw,
          maxRawScore: total.max,
          normalizedScore,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
        create: {
          attemptId,
          skill,
          rawScore: total.raw,
          maxRawScore: total.max,
          normalizedScore,
          estimatedToeicScore: null,
          status: SkillScoreStatus.FINAL,
          source: SkillScoreSource.OBJECTIVE_AUTO,
        },
      });
    }

    await transaction.testAttempt.update({
      where: { id: attemptId },
      data: {
        status: TestAttemptStatus.SUBMITTED,
        score,
        maxScore,
        submittedAt: new Date(),
      },
    });
    const submitted = await this.requireAttempt(transaction, learnerId, attemptId);
    return this.buildResult(submitted);
  }

  private buildResult(attempt: PlacementAttempt) {
    return {
      attemptId: attempt.id,
      status: attempt.status,
      title: attempt.test.title,
      mode: attempt.test.placementMode,
      goalScore: attempt.placementGoalScore,
      selfLevel: attempt.placementSelfLevel,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      skillScores: attempt.skillScores
        .filter(
          ({ skill }) => skill === ToeicSkill.LISTENING || skill === ToeicSkill.READING,
        )
        .map((skillScore) => ({
          skill: skillScore.skill,
          rawScore: skillScore.rawScore,
          maxRawScore: skillScore.maxRawScore,
          normalizedScore: skillScore.normalizedScore,
          estimatedToeicScore: skillScore.estimatedToeicScore,
          status: skillScore.status,
          source: skillScore.source,
        })),
      disclaimer: RESULT_DISCLAIMER,
    };
  }

  private startResponse(
    attempt: {
      id: string;
      startedAt: Date;
      placementGoalScore: number | null;
      placementSelfLevel: PlacementSelfLevel | null;
      test: { id: string; title: string; timeLimitMinutes: number | null };
    },
    resumed: boolean,
  ) {
    return {
      attemptId: attempt.id,
      resumed,
      test: {
        title: attempt.test.title,
        mode: PlacementMode.LR,
        durationMinutes: attempt.test.timeLimitMinutes,
      },
      goalScore: attempt.placementGoalScore,
      selfLevel: attempt.placementSelfLevel,
      startedAt: attempt.startedAt,
      expiresAt: this.expiresAt(attempt.startedAt, attempt.test.timeLimitMinutes),
    };
  }

  private expiresAt(startedAt: Date, timeLimitMinutes: number | null): Date {
    if (!timeLimitMinutes) {
      throw new ConflictException({
        code: 'PLACEMENT_FORM_NOT_AVAILABLE',
        message: 'Bài kiểm tra chưa được cấu hình thời lượng.',
      });
    }
    return new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
  }

  private isExpired(startedAt: Date, timeLimitMinutes: number | null): boolean {
    return this.expiresAt(startedAt, timeLimitMinutes).getTime() <= Date.now();
  }

  private validateSelection(
    selectedOptionIds: string[],
    responseType: QuestionResponseType,
    validOptionIds: string[],
  ) {
    const valid = new Set(validOptionIds);
    if (selectedOptionIds.some((id) => !valid.has(id))) this.invalidAnswer();
    if (
      (responseType === QuestionResponseType.SINGLE_CHOICE ||
        responseType === QuestionResponseType.TRUE_FALSE) &&
      selectedOptionIds.length > 1
    ) {
      this.invalidAnswer();
    }
    if (
      responseType !== QuestionResponseType.SINGLE_CHOICE &&
      responseType !== QuestionResponseType.TRUE_FALSE &&
      responseType !== QuestionResponseType.MULTIPLE_CHOICE
    ) {
      this.invalidAnswer();
    }
  }

  private invalidAnswer(): never {
    throw new BadRequestException({
      code: 'INVALID_ANSWER',
      message: 'Câu trả lời không hợp lệ cho bài kiểm tra này.',
    });
  }

  private sameSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const expected = new Set(right);
    return left.every((value) => expected.has(value));
  }

  private percentage(score: number, maxScore: number): number {
    return maxScore === 0 ? 0 : Math.round((score / maxScore) * 10_000) / 100;
  }

  private async runTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    conflictMessage: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.isRetryableConflict(error)) throw error;
        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({ code: 'PLACEMENT_CONCURRENT_CHANGE', message: conflictMessage });
        }
      }
    }
    throw new ConflictException({ code: 'PLACEMENT_CONCURRENT_CHANGE', message: conflictMessage });
  }

  private isRetryableConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    );
  }
}
