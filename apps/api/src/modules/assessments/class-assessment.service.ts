import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerEvaluationSource,
  AnswerEvaluationStatus,
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
import { AssessmentResponseStorage } from '../placement/assessment-response.storage';
import {
  CreateClassAssessmentDto,
  UpdateClassAssessmentDto,
} from './dto/class-assessment.dto';
import { GradeProductiveAnswerDto } from './dto/grade-answer.dto';

const MAX_TRANSACTION_ATTEMPTS = 3;
const PRODUCTIVE_TYPES = [
  QuestionResponseType.AUDIO_RESPONSE,
  QuestionResponseType.TEXT_RESPONSE,
] as const;

@Injectable()
export class ClassAssessmentService {
  private readonly logger = new Logger(ClassAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly responseStorage: AssessmentResponseStorage,
  ) {}

  async list(instructorId: string, classOfferingId: string) {
    const offering = await this.requireOwnedClass(this.prisma, instructorId, classOfferingId);
    const [assignments, availableTests] = await Promise.all([
      this.prisma.classAssessment.findMany({
        where: { classOfferingId },
        orderBy: [{ openAt: 'asc' }, { createdAt: 'asc' }],
        include: {
          test: {
            select: {
              id: true,
              title: true,
              purpose: true,
              status: true,
              maxAttempts: true,
              timeLimitMinutes: true,
              _count: { select: { testQuestions: true } },
            },
          },
          attempts: {
            where: { status: TestAttemptStatus.SUBMITTED },
            select: {
              id: true,
              answers: {
                where: { testQuestion: { question: { responseType: { in: [...PRODUCTIVE_TYPES] } } } },
                select: {
                  evaluations: {
                    where: {
                      source: AnswerEvaluationSource.INSTRUCTOR,
                      status: AnswerEvaluationStatus.REVIEWED_FINAL,
                    },
                    select: { id: true },
                  },
                },
              },
            },
          },
          _count: { select: { attempts: true } },
        },
      }),
      this.prisma.test.findMany({
        where: {
          courseId: offering.courseId,
          purpose: TestPurpose.IN_CLASS,
          status: TestStatus.PUBLISHED,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, title: true, timeLimitMinutes: true, maxAttempts: true },
      }),
    ]);

    return {
      classOffering: offering,
      availableTests,
      assessments: assignments.map((assignment) => ({
        id: assignment.id,
        stage: assignment.stage,
        openAt: assignment.openAt,
        closeAt: assignment.closeAt,
        maxAttemptsOverride: assignment.maxAttemptsOverride,
        isActive: assignment.isActive,
        test: assignment.test,
        submissionCount: assignment.attempts.length,
        pendingGradingCount: assignment.attempts.filter((attempt) =>
          attempt.answers.some((answer) => answer.evaluations.length === 0),
        ).length,
        attemptCount: assignment._count.attempts,
      })),
    };
  }

  async create(instructorId: string, classOfferingId: string, dto: CreateClassAssessmentDto) {
    return this.runTransaction(async (transaction) => {
      const offering = await this.requireOwnedClass(transaction, instructorId, classOfferingId);
      const test = await transaction.test.findFirst({
        where: {
          id: dto.testId,
          courseId: offering.courseId,
          purpose: TestPurpose.IN_CLASS,
          status: TestStatus.PUBLISHED,
        },
        select: { id: true },
      });
      if (!test) {
        throw new BadRequestException({
          code: 'CLASS_ASSESSMENT_TEST_INVALID',
          message: 'Chỉ có thể giao bài kiểm tra trong lớp đã xuất bản cùng khóa học.',
        });
      }
      this.validateWindow(dto.openAt, dto.closeAt);
      if (dto.isActive !== false) {
        const duplicate = await transaction.classAssessment.findFirst({
          where: { classOfferingId, testId: dto.testId, isActive: true },
          select: { id: true },
        });
        if (duplicate) this.duplicateAssignment();
      }
      try {
        return await transaction.classAssessment.create({
          data: {
            classOfferingId,
            testId: dto.testId,
            stage: dto.stage,
            openAt: dto.openAt ?? null,
            closeAt: dto.closeAt ?? null,
            maxAttemptsOverride: dto.maxAttemptsOverride ?? null,
            isActive: dto.isActive ?? true,
          },
          include: { test: { select: { id: true, title: true } } },
        });
      } catch (error: unknown) {
        if (this.isPrismaError(error, 'P2002')) this.duplicateAssignment();
        throw error;
      }
    }, 'Lịch bài kiểm tra đang được cập nhật. Vui lòng thử lại.');
  }

  async get(instructorId: string, classOfferingId: string, classAssessmentId: string) {
    await this.requireOwnedClass(this.prisma, instructorId, classOfferingId);
    const assessment = await this.prisma.classAssessment.findFirst({
      where: { id: classAssessmentId, classOfferingId },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            description: true,
            purpose: true,
            status: true,
            maxAttempts: true,
            timeLimitMinutes: true,
            _count: { select: { testQuestions: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
    });
    if (!assessment) throw new NotFoundException('Class assessment not found');
    return assessment;
  }

  async update(
    instructorId: string,
    classOfferingId: string,
    classAssessmentId: string,
    dto: UpdateClassAssessmentDto,
  ) {
    return this.runTransaction(async (transaction) => {
      await this.requireOwnedClass(transaction, instructorId, classOfferingId);
      const assessment = await transaction.classAssessment.findFirst({
        where: { id: classAssessmentId, classOfferingId },
        select: {
          id: true,
          testId: true,
          openAt: true,
          closeAt: true,
          isActive: true,
          _count: { select: { attempts: true } },
        },
      });
      if (!assessment) throw new NotFoundException('Class assessment not found');

      const schedulingChanged =
        dto.stage !== undefined ||
        dto.openAt !== undefined ||
        dto.closeAt !== undefined ||
        dto.maxAttemptsOverride !== undefined;
      if (schedulingChanged && assessment._count.attempts > 0) {
        throw new ConflictException({
          code: 'CLASS_ASSESSMENT_ALREADY_STARTED',
          message: 'Không thể đổi lịch sau khi đã có lượt làm bài.',
        });
      }
      const openAt = dto.openAt === undefined ? assessment.openAt : dto.openAt;
      const closeAt = dto.closeAt === undefined ? assessment.closeAt : dto.closeAt;
      this.validateWindow(openAt, closeAt);
      if (dto.isActive === true && !assessment.isActive) {
        const duplicate = await transaction.classAssessment.findFirst({
          where: {
            classOfferingId,
            testId: assessment.testId,
            isActive: true,
            id: { not: assessment.id },
          },
          select: { id: true },
        });
        if (duplicate) this.duplicateAssignment();
      }
      try {
        return await transaction.classAssessment.update({
          where: { id: classAssessmentId },
          data: dto,
          include: { test: { select: { id: true, title: true } } },
        });
      } catch (error: unknown) {
        if (this.isPrismaError(error, 'P2002')) this.duplicateAssignment();
        throw error;
      }
    }, 'Lịch bài kiểm tra đang được cập nhật. Vui lòng thử lại.');
  }

  async gradingQueue(instructorId: string, classOfferingId: string, classAssessmentId: string) {
    const assessment = await this.requireOwnedAssessment(
      this.prisma,
      instructorId,
      classOfferingId,
      classAssessmentId,
    );
    const attempts = await this.prisma.testAttempt.findMany({
      where: { classAssessmentId, status: TestAttemptStatus.SUBMITTED },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        attemptNumber: true,
        submittedAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        skillScores: {
          select: { skill: true, normalizedScore: true, status: true, source: true },
        },
        answers: {
          where: { testQuestion: { question: { responseType: { in: [...PRODUCTIVE_TYPES] } } } },
          select: {
            id: true,
            evaluations: {
              where: { source: AnswerEvaluationSource.INSTRUCTOR },
              select: { status: true },
            },
          },
        },
      },
    });
    return {
      assessment: {
        id: assessment.id,
        stage: assessment.stage,
        test: assessment.test,
        classOffering: assessment.classOffering,
      },
      submissions: attempts.map((attempt) => {
        const finalCount = attempt.answers.filter((answer) =>
          answer.evaluations.some(({ status }) => status === AnswerEvaluationStatus.REVIEWED_FINAL),
        ).length;
        const gradingState =
          finalCount === attempt.answers.length && attempt.answers.length > 0
            ? 'REVIEWED_FINAL'
            : finalCount > 0
              ? 'PARTIALLY_REVIEWED'
              : 'SUBMITTED_PENDING_REVIEW';
        return { ...attempt, gradingState };
      }),
    };
  }

  async gradingDetail(
    instructorId: string,
    classOfferingId: string,
    classAssessmentId: string,
    attemptId: string,
  ) {
    await this.requireOwnedAssessment(
      this.prisma,
      instructorId,
      classOfferingId,
      classAssessmentId,
    );
    const attempt = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, classAssessmentId, status: TestAttemptStatus.SUBMITTED },
      select: {
        id: true,
        attemptNumber: true,
        submittedAt: true,
        learner: { select: { id: true, fullName: true, email: true } },
        test: { select: { id: true, title: true } },
        answers: {
          where: { testQuestion: { question: { responseType: { in: [...PRODUCTIVE_TYPES] } } } },
          orderBy: { testQuestion: { orderIndex: 'asc' } },
          select: {
            id: true,
            textResponse: true,
            audioStorageKey: true,
            pointsAwarded: true,
            testQuestion: {
              select: {
                id: true,
                points: true,
                orderIndex: true,
                question: {
                  select: {
                    content: true,
                    responseType: true,
                    toeicSkill: true,
                    rubric: {
                      select: {
                        id: true,
                        name: true,
                        criteria: { orderBy: { orderIndex: 'asc' } },
                      },
                    },
                  },
                },
              },
            },
            evaluations: {
              where: { source: AnswerEvaluationSource.INSTRUCTOR },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              include: { criterionScores: true },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Submitted attempt not found');
    return {
      ...attempt,
      answers: attempt.answers.map((answer) => ({
        ...answer,
        audioUrl: answer.audioStorageKey
          ? `/api/instructor/classes/${classOfferingId}/assessments/${classAssessmentId}/attempts/${attemptId}/answers/${answer.testQuestion.id}/audio`
          : null,
        audioStorageKey: undefined,
        evaluation: answer.evaluations[0] ?? null,
        evaluations: undefined,
      })),
    };
  }

  async gradeAnswer(
    instructorId: string,
    classOfferingId: string,
    classAssessmentId: string,
    attemptId: string,
    testQuestionId: string,
    dto: GradeProductiveAnswerDto,
  ) {
    await this.runTransaction(async (transaction) => {
      await this.requireOwnedAssessment(
        transaction,
        instructorId,
        classOfferingId,
        classAssessmentId,
      );
      const answer = await transaction.testAnswer.findFirst({
        where: {
          attempt: { id: attemptId, classAssessmentId, status: TestAttemptStatus.SUBMITTED },
          testQuestionId,
        },
        select: {
          id: true,
          textResponse: true,
          audioStorageKey: true,
          testQuestion: {
            select: {
              points: true,
              question: {
                select: {
                  responseType: true,
                  toeicSkill: true,
                  rubric: {
                    select: {
                      id: true,
                      criteria: { orderBy: { orderIndex: 'asc' } },
                    },
                  },
                },
              },
            },
          },
          evaluations: {
            where: { source: AnswerEvaluationSource.INSTRUCTOR },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { id: true, status: true },
          },
        },
      });
      if (!answer) throw new NotFoundException('Productive answer not found');
      if (!PRODUCTIVE_TYPES.includes(answer.testQuestion.question.responseType as (typeof PRODUCTIVE_TYPES)[number])) {
        throw new BadRequestException('Only Speaking or Writing responses use rubric grading');
      }
      const hasResponse =
        answer.testQuestion.question.responseType === QuestionResponseType.TEXT_RESPONSE
          ? Boolean(answer.textResponse?.trim())
          : Boolean(answer.audioStorageKey);
      if (!hasResponse) {
        throw new BadRequestException({
          code: 'PRODUCTIVE_RESPONSE_MISSING',
          message: 'Không thể chấm khi học viên chưa lưu câu trả lời.',
        });
      }
      const rubric = answer.testQuestion.question.rubric;
      if (!rubric || rubric.criteria.length === 0) {
        throw new BadRequestException({ code: 'RUBRIC_REQUIRED', message: 'Câu trả lời chưa có rubric hợp lệ.' });
      }

      const existing = answer.evaluations[0];
      if (existing?.status === AnswerEvaluationStatus.REVIEWED_FINAL && !dto.editFinal) {
        throw new ConflictException({
          code: 'FINAL_EVALUATION_EDIT_REQUIRED',
          message: 'Hãy chọn Chỉnh sửa đánh giá trước khi thay đổi kết quả đã xác nhận.',
        });
      }

      const criterionById = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
      const submittedIds = new Set<string>();
      for (const item of dto.criteria) {
        if (submittedIds.has(item.rubricCriterionId)) {
          throw new BadRequestException('Each rubric criterion may appear only once');
        }
        submittedIds.add(item.rubricCriterionId);
        const criterion = criterionById.get(item.rubricCriterionId);
        if (!criterion) {
          throw new BadRequestException({ code: 'INVALID_RUBRIC_CRITERION', message: 'Tiêu chí không thuộc rubric của câu hỏi.' });
        }
        const score = this.decimal(item.score, 'Điểm tiêu chí không hợp lệ.');
        if (criterion.maxScore.lessThanOrEqualTo(0) || criterion.weight.lessThanOrEqualTo(0)) {
          throw new BadRequestException({ code: 'INVALID_RUBRIC_CONFIGURATION', message: 'Rubric chưa được cấu hình hợp lệ.' });
        }
        if (score.lessThan(0) || score.greaterThan(criterion.maxScore)) {
          throw new BadRequestException({ code: 'RUBRIC_SCORE_OUT_OF_RANGE', message: 'Điểm tiêu chí nằm ngoài phạm vi cho phép.' });
        }
      }
      if (dto.finalize && submittedIds.size !== rubric.criteria.length) {
        throw new BadRequestException({ code: 'RUBRIC_INCOMPLETE', message: 'Cần chấm đủ tất cả tiêu chí trước khi xác nhận.' });
      }

      let totalScore: Prisma.Decimal | null = null;
      let pointsAwarded: Prisma.Decimal | null = null;
      if (submittedIds.size === rubric.criteria.length) {
        let weighted = new Prisma.Decimal(0);
        let totalWeight = new Prisma.Decimal(0);
        for (const item of dto.criteria) {
          const criterion = criterionById.get(item.rubricCriterionId)!;
          const score = new Prisma.Decimal(item.score);
          weighted = weighted.plus(score.div(criterion.maxScore).mul(criterion.weight));
          totalWeight = totalWeight.plus(criterion.weight);
        }
        const ratio = weighted.div(totalWeight);
        totalScore = ratio.mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        pointsAwarded = ratio
          .mul(answer.testQuestion.points)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      }

      const evaluation = existing
        ? await transaction.answerEvaluation.update({
            where: { id: existing.id },
            data: {
              evaluatorId: instructorId,
              status: dto.finalize
                ? AnswerEvaluationStatus.REVIEWED_FINAL
                : AnswerEvaluationStatus.PENDING_REVIEW,
              totalScore,
              feedback: dto.feedback?.trim() || null,
            },
            select: { id: true },
          })
        : await transaction.answerEvaluation.create({
            data: {
              testAnswerId: answer.id,
              source: AnswerEvaluationSource.INSTRUCTOR,
              evaluatorId: instructorId,
              status: dto.finalize
                ? AnswerEvaluationStatus.REVIEWED_FINAL
                : AnswerEvaluationStatus.PENDING_REVIEW,
              totalScore,
              feedback: dto.feedback?.trim() || null,
            },
            select: { id: true },
          });

      for (const item of dto.criteria) {
        await transaction.rubricCriterionScore.upsert({
          where: {
            answerEvaluationId_rubricCriterionId: {
              answerEvaluationId: evaluation.id,
              rubricCriterionId: item.rubricCriterionId,
            },
          },
          update: { score: new Prisma.Decimal(item.score), feedback: item.feedback?.trim() || null },
          create: {
            answerEvaluationId: evaluation.id,
            rubricCriterionId: item.rubricCriterionId,
            score: new Prisma.Decimal(item.score),
            feedback: item.feedback?.trim() || null,
          },
        });
      }
      await transaction.testAnswer.update({
        where: { id: answer.id },
        data: { pointsAwarded: dto.finalize ? pointsAwarded : null },
      });
      await this.recomputeProductiveSkill(
        transaction,
        attemptId,
        answer.testQuestion.question.toeicSkill,
      );
    }, 'Bài chấm đang được cập nhật ở phiên khác. Vui lòng thử lại.');

    return this.gradingDetail(instructorId, classOfferingId, classAssessmentId, attemptId);
  }

  async openLearnerAudio(
    instructorId: string,
    classOfferingId: string,
    classAssessmentId: string,
    attemptId: string,
    testQuestionId: string,
  ) {
    await this.requireOwnedAssessment(
      this.prisma,
      instructorId,
      classOfferingId,
      classAssessmentId,
    );
    const answer = await this.prisma.testAnswer.findFirst({
      where: {
        attempt: { id: attemptId, classAssessmentId },
        testQuestionId,
        testQuestion: { question: { responseType: QuestionResponseType.AUDIO_RESPONSE } },
      },
      select: { audioStorageKey: true },
    });
    if (!answer?.audioStorageKey) throw new NotFoundException('Audio response not found');
    return {
      stream: this.responseStorage.open(answer.audioStorageKey),
      mimeType: this.audioMimeForKey(answer.audioStorageKey),
    };
  }

  private async recomputeProductiveSkill(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    skill: ToeicSkill,
  ) {
    const questions = await transaction.testQuestion.findMany({
      where: {
        test: { attempts: { some: { id: attemptId } } },
        question: { toeicSkill: skill, responseType: { in: [...PRODUCTIVE_TYPES] } },
      },
      select: {
        id: true,
        points: true,
        answers: {
          where: { attemptId },
          select: {
            textResponse: true,
            audioStorageKey: true,
            pointsAwarded: true,
            testQuestion: {
              select: {
                question: { select: { responseType: true } },
              },
            },
            evaluations: {
              where: {
                source: AnswerEvaluationSource.INSTRUCTOR,
                status: AnswerEvaluationStatus.REVIEWED_FINAL,
              },
              select: { id: true },
            },
          },
        },
      },
    });
    const complete =
      questions.length > 0 &&
      questions.every(
        (question) =>
          question.answers.length === 1 &&
          (question.answers[0].testQuestion.question.responseType === QuestionResponseType.TEXT_RESPONSE
            ? Boolean(question.answers[0].textResponse?.trim())
            : Boolean(question.answers[0].audioStorageKey)) &&
          question.answers[0].pointsAwarded !== null &&
          question.answers[0].evaluations.length === 1,
      );
    if (!complete) {
      await transaction.attemptSkillScore.deleteMany({
        where: { attemptId, skill, source: SkillScoreSource.INSTRUCTOR_CONFIRMED },
      });
      return;
    }
    const raw = questions.reduce(
      (sum, question) => sum.plus(question.answers[0].pointsAwarded!),
      new Prisma.Decimal(0),
    );
    const max = questions.reduce(
      (sum, question) => sum.plus(question.points),
      new Prisma.Decimal(0),
    );
    if (max.lessThanOrEqualTo(0)) {
      this.logger.error(
        `Cannot finalize ${skill} for attempt ${attemptId}: productive maximum points must be positive`,
      );
      throw new BadRequestException({
        code: 'PRODUCTIVE_POINTS_CONFIGURATION_INVALID',
        message: 'Cấu hình điểm Speaking/Writing phải lớn hơn 0.',
      });
    }
    const normalized = raw.div(max).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await transaction.attemptSkillScore.upsert({
      where: { attemptId_skill: { attemptId, skill } },
      update: {
        rawScore: raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        maxRawScore: max.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        normalizedScore: normalized,
        estimatedToeicScore: null,
        source: SkillScoreSource.INSTRUCTOR_CONFIRMED,
        status: SkillScoreStatus.FINAL,
      },
      create: {
        attemptId,
        skill,
        rawScore: raw.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        maxRawScore: max.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        normalizedScore: normalized,
        estimatedToeicScore: null,
        source: SkillScoreSource.INSTRUCTOR_CONFIRMED,
        status: SkillScoreStatus.FINAL,
      },
    });
  }

  private async requireOwnedClass(
    database: PrismaService | Prisma.TransactionClient,
    instructorId: string,
    classOfferingId: string,
  ) {
    const offering = await database.classOffering.findFirst({
      where: { id: classOfferingId, instructorId },
      select: {
        id: true,
        code: true,
        name: true,
        courseId: true,
        course: { select: { id: true, title: true } },
      },
    });
    if (!offering) throw new ForbiddenException('You are not assigned to this class');
    return offering;
  }

  private async requireOwnedAssessment(
    database: PrismaService | Prisma.TransactionClient,
    instructorId: string,
    classOfferingId: string,
    classAssessmentId: string,
  ) {
    const assessment = await database.classAssessment.findFirst({
      where: {
        id: classAssessmentId,
        classOfferingId,
        classOffering: { instructorId },
      },
      select: {
        id: true,
        stage: true,
        test: { select: { id: true, title: true } },
        classOffering: {
          select: { id: true, code: true, name: true, course: { select: { id: true, title: true } } },
        },
      },
    });
    if (!assessment) throw new ForbiddenException('You cannot manage this assessment');
    return assessment;
  }

  private validateWindow(openAt?: Date | null, closeAt?: Date | null) {
    if (openAt && closeAt && closeAt.getTime() <= openAt.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_ASSESSMENT_WINDOW',
        message: 'Thời gian đóng phải sau thời gian mở.',
      });
    }
  }

  private duplicateAssignment(): never {
    throw new ConflictException({
      code: 'DUPLICATE_ACTIVE_CLASS_ASSESSMENT',
      message: 'Bài kiểm tra này đã được giao và đang hoạt động trong lớp.',
    });
  }

  private decimal(value: string, message: string): Prisma.Decimal {
    try {
      const decimal = new Prisma.Decimal(value);
      if (!decimal.isFinite()) throw new Error('not finite');
      return decimal;
    } catch {
      throw new BadRequestException(message);
    }
  }

  private audioMimeForKey(key: string): string {
    if (key.endsWith('.ogg')) return 'audio/ogg';
    if (key.endsWith('.m4a') || key.endsWith('.mp4')) return 'audio/mp4';
    if (key.endsWith('.mp3')) return 'audio/mpeg';
    return 'audio/webm';
  }

  private async runTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    message: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.isRetryable(error)) throw error;
        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({ code: 'ASSESSMENT_CONCURRENT_CHANGE', message });
        }
      }
    }
    throw new ConflictException({ code: 'ASSESSMENT_CONCURRENT_CHANGE', message });
  }

  private isRetryable(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    ) {
      return true;
    }
    if (!error || typeof error !== 'object' || !('name' in error) || !('cause' in error)) {
      return false;
    }
    const adapterError = error as {
      name?: unknown;
      cause?: { kind?: unknown; originalCode?: unknown };
    };
    return (
      adapterError.name === 'DriverAdapterError' &&
      adapterError.cause?.kind === 'TransactionWriteConflict' &&
      ['40001', '40P01'].includes(String(adapterError.cause.originalCode))
    );
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
