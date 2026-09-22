import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  Prisma,
  QuestionType,
  TestAttemptStatus,
  TestStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeBktUpdate } from '../knowledge-model/bkt';
import { AnswerSelectionDto, SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

const MAX_STUDENT_TRANSACTION_ATTEMPTS = 3;

const answerableTestQuestionSelect = {
  id: true,
  orderIndex: true,
  points: true,
  question: {
    select: {
      id: true,
      type: true,
      difficulty: true,
      content: true,
      explanation: true,
      skills: {
        orderBy: { skillId: 'asc' as const },
        select: {
          skill: {
            select: {
              id: true,
              pInit: true,
              pLearn: true,
              pGuess: true,
              pSlip: true,
            },
          },
        },
      },
      options: {
        orderBy: { orderIndex: 'asc' as const },
        select: {
          id: true,
          content: true,
          orderIndex: true,
          isCorrect: true,
        },
      },
    },
  },
} satisfies Prisma.TestQuestionSelect;

type AnswerableTestQuestion = Prisma.TestQuestionGetPayload<{
  select: typeof answerableTestQuestionSelect;
}>;

interface GradedBktObservation {
  testAnswerId: string;
  isCorrect: boolean;
  skills: Array<{
    id: string;
    pInit: number;
    pLearn: number;
    pGuess: number;
    pSlip: number;
  }>;
}

@Injectable()
export class AssessmentStudentService {
  constructor(private readonly prisma: PrismaService) {}

  async listTests(learnerId: string, enrollmentId: string) {
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);

    const tests = await this.prisma.test.findMany({
      where: {
        courseId: enrollment.classOffering.courseId,
        status: TestStatus.PUBLISHED,
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        lessonId: true,
        maxAttempts: true,
        showResultAfterSubmit: true,
        _count: { select: { testQuestions: true } },
        attempts: {
          where: { enrollmentId },
          orderBy: { attemptNumber: 'asc' },
          select: {
            id: true,
            attemptNumber: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return tests.map((test) => {
      const inProgress = test.attempts.find(
        ({ status }) => status === TestAttemptStatus.IN_PROGRESS,
      );
      const submitted = [...test.attempts]
        .reverse()
        .find(({ status }) => status === TestAttemptStatus.SUBMITTED);

      return {
        id: test.id,
        type: test.type,
        title: test.title,
        description: test.description,
        lessonId: test.lessonId,
        maxAttempts: test.maxAttempts,
        showResultAfterSubmit: test.showResultAfterSubmit,
        questionCount: test._count.testQuestions,
        attemptsUsed: test.attempts.length,
        hasInProgressAttempt: Boolean(inProgress),
        inProgressAttemptId: inProgress?.id ?? null,
        latestSubmittedAttemptId: submitted?.id ?? null,
      };
    });
  }

  async startOrResumeAttempt(learnerId: string, enrollmentId: string, testId: string) {
    return this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      const test = await transaction.test.findFirst({
        where: {
          id: testId,
          courseId: enrollment.classOffering.courseId,
          status: TestStatus.PUBLISHED,
        },
        select: {
          id: true,
          maxAttempts: true,
          testQuestions: {
            select: {
              id: true,
              orderIndex: true,
              points: true,
              question: {
                select: {
                  id: true,
                  updatedAt: true,
                  options: { select: { id: true, updatedAt: true } },
                },
              },
            },
          },
        },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      const inProgress = await transaction.testAttempt.findFirst({
        where: {
          testId,
          enrollmentId,
          status: TestAttemptStatus.IN_PROGRESS,
        },
        orderBy: { attemptNumber: 'desc' },
        select: this.attemptStartSelect(),
      });
      if (inProgress) {
        return inProgress;
      }

      const attemptsUsed = await transaction.testAttempt.count({
        where: { testId, enrollmentId },
      });
      if (attemptsUsed >= test.maxAttempts) {
        throw new ConflictException('Maximum number of attempts has been reached');
      }

      return transaction.testAttempt.create({
        data: {
          testId,
          enrollmentId,
          attemptNumber: attemptsUsed + 1,
          status: TestAttemptStatus.IN_PROGRESS,
        },
        select: this.attemptStartSelect(),
      });
    }, 'Attempt start changed concurrently; please try again');
  }

  async getAttempt(learnerId: string, enrollmentId: string, attemptId: string) {
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);
    const attempt = await this.prisma.testAttempt.findFirst({
      where: {
        id: attemptId,
        enrollmentId,
        test: { courseId: enrollment.classOffering.courseId },
      },
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        test: {
          select: {
            id: true,
            title: true,
            type: true,
            testQuestions: {
              orderBy: { orderIndex: 'asc' },
              select: answerableTestQuestionSelect,
            },
          },
        },
        answers: {
          select: { testQuestionId: true, selectedOptionIds: true },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    const attemptMetadata = {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
    };
    const testMetadata = {
      id: attempt.test.id,
      title: attempt.test.title,
      type: attempt.test.type,
    };

    if (attempt.status === TestAttemptStatus.SUBMITTED) {
      return { attempt: attemptMetadata, test: testMetadata };
    }

    const savedSelections = new Map(
      attempt.answers.map((answer) => [answer.testQuestionId, answer.selectedOptionIds]),
    );
    return {
      attempt: attemptMetadata,
      test: testMetadata,
      questions: attempt.test.testQuestions.map((testQuestion) => ({
        testQuestionId: testQuestion.id,
        points: testQuestion.points,
        question: {
          id: testQuestion.question.id,
          type: testQuestion.question.type,
          difficulty: testQuestion.question.difficulty,
          content: testQuestion.question.content,
          options: testQuestion.question.options.map((option) => ({
            id: option.id,
            content: option.content,
            orderIndex: option.orderIndex,
          })),
        },
        selectedOptionIds: savedSelections.get(testQuestion.id) ?? [],
      })),
    };
  }

  async saveAnswers(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    dto: SaveAttemptAnswersDto,
  ) {
    return this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      const attempt = await this.loadAnswerableAttempt(
        transaction,
        enrollment.classOffering.courseId,
        enrollmentId,
        attemptId,
      );
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        throw new ConflictException('Submitted attempts cannot be changed');
      }

      const selections = this.validateAnswerSelections(dto.answers, attempt.test.testQuestions);
      for (const [testQuestionId, selectedOptionIds] of selections) {
        await transaction.testAnswer.upsert({
          where: {
            attemptId_testQuestionId: { attemptId, testQuestionId },
          },
          update: {
            selectedOptionIds,
            isCorrect: null,
            pointsAwarded: null,
          },
          create: {
            attemptId,
            testQuestionId,
            selectedOptionIds,
            isCorrect: null,
            pointsAwarded: null,
          },
        });
      }

      return {
        attemptId,
        answers: [...selections].map(([testQuestionId, selectedOptionIds]) => ({
          testQuestionId,
          selectedOptionIds,
        })),
      };
    }, 'Answer save changed concurrently; please try again');
  }

  async submitAttempt(
    learnerId: string,
    enrollmentId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
  ) {
    return this.runStudentTransaction(async (transaction) => {
      const enrollment = await this.requireActiveEnrollment(transaction, learnerId, enrollmentId);
      const attempt = await transaction.testAttempt.findFirst({
        where: {
          id: attemptId,
          enrollmentId,
          test: { courseId: enrollment.classOffering.courseId },
        },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          test: {
            select: {
              id: true,
              title: true,
              type: true,
              showResultAfterSubmit: true,
              testQuestions: {
                orderBy: { orderIndex: 'asc' },
                select: answerableTestQuestionSelect,
              },
            },
          },
        },
      });
      if (!attempt) {
        throw new NotFoundException('Attempt not found');
      }
      if (attempt.status === TestAttemptStatus.SUBMITTED) {
        return this.buildSubmissionResponse(attempt);
      }

      const selections = this.validateAnswerSelections(dto.answers, attempt.test.testQuestions);
      let score = 0;
      let maxScore = 0;
      const bktObservations: GradedBktObservation[] = [];

      for (const testQuestion of attempt.test.testQuestions) {
        const selectedOptionIds = selections.get(testQuestion.id) ?? [];
        const correctOptionIds = testQuestion.question.options
          .filter(({ isCorrect }) => isCorrect)
          .map(({ id }) => id.toLowerCase())
          .sort();
        const isCorrect = this.sameSet(selectedOptionIds, correctOptionIds);
        const pointsAwarded = isCorrect ? testQuestion.points : 0;
        score += pointsAwarded;
        maxScore += testQuestion.points;

        const testAnswer = await transaction.testAnswer.upsert({
          where: {
            attemptId_testQuestionId: {
              attemptId,
              testQuestionId: testQuestion.id,
            },
          },
          update: { selectedOptionIds, isCorrect, pointsAwarded },
          create: {
            attemptId,
            testQuestionId: testQuestion.id,
            selectedOptionIds,
            isCorrect,
            pointsAwarded,
          },
          select: { id: true },
        });
        bktObservations.push({
          testAnswerId: testAnswer.id,
          isCorrect,
          skills: testQuestion.question.skills.map(({ skill }) => skill),
        });
      }

      await this.applyBktObservations(
        transaction,
        enrollmentId,
        attemptId,
        bktObservations,
      );

      const submitted = await transaction.testAttempt.update({
        where: { id: attemptId },
        data: {
          status: TestAttemptStatus.SUBMITTED,
          score,
          maxScore,
          submittedAt: new Date(),
        },
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
        },
      });

      return this.buildSubmissionResponse({
        ...submitted,
        test: {
          id: attempt.test.id,
          title: attempt.test.title,
          type: attempt.test.type,
          showResultAfterSubmit: attempt.test.showResultAfterSubmit,
        },
      });
    }, 'Attempt submission changed concurrently; please try again');
  }

  async getResult(learnerId: string, enrollmentId: string, attemptId: string) {
    const enrollment = await this.requireActiveEnrollment(this.prisma, learnerId, enrollmentId);
    const attempt = await this.prisma.testAttempt.findFirst({
      where: {
        id: attemptId,
        enrollmentId,
        test: { courseId: enrollment.classOffering.courseId },
      },
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        test: {
          select: {
            id: true,
            title: true,
            type: true,
            showResultAfterSubmit: true,
            testQuestions: {
              orderBy: { orderIndex: 'asc' },
              select: answerableTestQuestionSelect,
            },
          },
        },
        answers: {
          select: {
            testQuestionId: true,
            selectedOptionIds: true,
            isCorrect: true,
            pointsAwarded: true,
          },
        },
      },
    });
    if (!attempt || attempt.status !== TestAttemptStatus.SUBMITTED) {
      throw new NotFoundException('Result not found');
    }
    if (!attempt.test.showResultAfterSubmit) {
      throw new ForbiddenException('This result is not currently available');
    }

    const answerMap = new Map(attempt.answers.map((answer) => [answer.testQuestionId, answer]));
    const score = attempt.score ?? 0;
    const maxScore = attempt.maxScore ?? 0;

    return {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score,
        maxScore,
        percentage: this.percentage(score, maxScore),
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        type: attempt.test.type,
      },
      questions: attempt.test.testQuestions.map((testQuestion) => {
        const answer = answerMap.get(testQuestion.id);
        const selectedOptionIds = answer?.selectedOptionIds ?? [];
        const selectedSet = new Set(selectedOptionIds.map((id) => id.toLowerCase()));

        return {
          testQuestionId: testQuestion.id,
          points: testQuestion.points,
          question: {
            id: testQuestion.question.id,
            type: testQuestion.question.type,
            difficulty: testQuestion.question.difficulty,
            content: testQuestion.question.content,
            explanation: testQuestion.question.explanation,
            options: testQuestion.question.options.map((option) => ({
              id: option.id,
              content: option.content,
              orderIndex: option.orderIndex,
              isCorrect: option.isCorrect,
              wasSelected: selectedSet.has(option.id.toLowerCase()),
            })),
          },
          answer: {
            selectedOptionIds,
            isCorrect: answer?.isCorrect ?? false,
            pointsAwarded: answer?.pointsAwarded ?? 0,
          },
        };
      }),
    };
  }

  private async requireActiveEnrollment(
    database: PrismaService | Prisma.TransactionClient,
    learnerId: string,
    enrollmentId: string,
  ) {
    const enrollment = await database.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        classOffering: { select: { courseId: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }

  private async loadAnswerableAttempt(
    transaction: Prisma.TransactionClient,
    courseId: string,
    enrollmentId: string,
    attemptId: string,
  ) {
    const attempt = await transaction.testAttempt.findFirst({
      where: {
        id: attemptId,
        enrollmentId,
        test: { courseId },
      },
      select: {
        id: true,
        status: true,
        test: {
          select: {
            testQuestions: {
              orderBy: { orderIndex: 'asc' },
              select: answerableTestQuestionSelect,
            },
          },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    return attempt;
  }

  private validateAnswerSelections(
    answers: AnswerSelectionDto[],
    testQuestions: AnswerableTestQuestion[],
  ): Map<string, string[]> {
    const testQuestionMap = new Map(
      testQuestions.map((testQuestion) => [testQuestion.id.toLowerCase(), testQuestion]),
    );
    const selections = new Map<string, string[]>();

    for (const answer of answers) {
      const testQuestionId = answer.testQuestionId.toLowerCase();
      if (selections.has(testQuestionId)) {
        throw new BadRequestException('Each TestQuestion may appear only once in an answer batch');
      }
      const testQuestion = testQuestionMap.get(testQuestionId);
      if (!testQuestion) {
        throw new BadRequestException('TestQuestion does not belong to this Test');
      }

      const selectedOptionIds = answer.selectedOptionIds.map((id) => id.toLowerCase()).sort();
      if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
        throw new BadRequestException('selectedOptionIds must not contain duplicates');
      }
      if (
        (testQuestion.question.type === QuestionType.SINGLE_CHOICE ||
          testQuestion.question.type === QuestionType.TRUE_FALSE) &&
        selectedOptionIds.length > 1
      ) {
        throw new BadRequestException(
          `${testQuestion.question.type} accepts at most one selected option`,
        );
      }

      const validOptionIds = new Set(
        testQuestion.question.options.map(({ id }) => id.toLowerCase()),
      );
      if (!selectedOptionIds.every((id) => validOptionIds.has(id))) {
        throw new BadRequestException('Every selected option must belong to the answered Question');
      }
      selections.set(testQuestion.id, selectedOptionIds);
    }

    return selections;
  }

  private buildSubmissionResponse(attempt: {
    id: string;
    attemptNumber: number;
    status: TestAttemptStatus;
    score: number | null;
    maxScore: number | null;
    startedAt: Date;
    submittedAt: Date | null;
    test: {
      id: string;
      title: string;
      type: string;
      showResultAfterSubmit: boolean;
    };
  }) {
    const response = {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        type: attempt.test.type,
      },
      resultAvailable: attempt.test.showResultAfterSubmit,
    };

    if (!attempt.test.showResultAfterSubmit) {
      return response;
    }
    const score = attempt.score ?? 0;
    const maxScore = attempt.maxScore ?? 0;
    return {
      ...response,
      attempt: {
        ...response.attempt,
        score,
        maxScore,
        percentage: this.percentage(score, maxScore),
      },
    };
  }

  private attemptStartSelect() {
    return {
      id: true,
      testId: true,
      enrollmentId: true,
      attemptNumber: true,
      status: true,
      startedAt: true,
    } as const;
  }

  private sameSet(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private async applyBktObservations(
    transaction: Prisma.TransactionClient,
    enrollmentId: string,
    testAttemptId: string,
    observations: GradedBktObservation[],
  ): Promise<void> {
    const observedAt = new Date();

    for (const observation of observations) {
      for (const skill of observation.skills) {
        const currentState = await transaction.learnerSkillState.findUnique({
          where: {
            enrollmentId_skillId: { enrollmentId, skillId: skill.id },
          },
          select: { masteryProbability: true, observationCount: true },
        });
        const priorMastery = currentState?.masteryProbability ?? skill.pInit;
        const { evidencePosterior, posteriorMastery } = computeBktUpdate(
          priorMastery,
          skill.pLearn,
          skill.pGuess,
          skill.pSlip,
          observation.isCorrect,
        );

        if (currentState) {
          await transaction.learnerSkillState.update({
            where: {
              enrollmentId_skillId: { enrollmentId, skillId: skill.id },
            },
            data: {
              masteryProbability: posteriorMastery,
              observationCount: { increment: 1 },
              lastObservedAt: observedAt,
            },
          });
        } else {
          await transaction.learnerSkillState.create({
            data: {
              enrollmentId,
              skillId: skill.id,
              masteryProbability: posteriorMastery,
              observationCount: 1,
              lastObservedAt: observedAt,
            },
          });
        }

        await transaction.masteryHistory.create({
          data: {
            enrollmentId,
            skillId: skill.id,
            testAttemptId,
            testAnswerId: observation.testAnswerId,
            isCorrect: observation.isCorrect,
            priorMastery,
            evidencePosterior,
            posteriorMastery,
          },
        });
      }
    }
  }

  private percentage(score: number, maxScore: number): number {
    return maxScore === 0 ? 0 : Math.round((score / maxScore) * 10_000) / 100;
  }

  private async runStudentTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    conflictMessage: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_STUDENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.isRetryableConflict(error)) {
          throw error;
        }
        if (attempt === MAX_STUDENT_TRANSACTION_ATTEMPTS) {
          throw new ConflictException(conflictMessage);
        }
      }
    }

    throw new ConflictException(conflictMessage);
  }

  private isRetryableConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2034'].includes(error.code)
    );
  }
}
