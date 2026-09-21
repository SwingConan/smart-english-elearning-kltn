import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuestionDifficulty,
  QuestionType,
  TestStatus,
  TestType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AddTestQuestionDto } from './dto/add-test-question.dto';
import { CreateQuestionDto, QuestionOptionInputDto } from './dto/create-question.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderTestQuestionsDto } from './dto/reorder-test-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateTestQuestionDto } from './dto/update-test-question.dto';
import { UpdateTestDto } from './dto/update-test.dto';

const MAX_ASSESSMENT_TRANSACTION_ATTEMPTS = 3;

const instructorQuestionSelect = {
  id: true,
  courseId: true,
  type: true,
  difficulty: true,
  content: true,
  explanation: true,
  createdAt: true,
  updatedAt: true,
  options: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      content: true,
      isCorrect: true,
      orderIndex: true,
    },
  },
} satisfies Prisma.QuestionSelect;

const instructorQuestionPreviewSelect = {
  id: true,
  type: true,
  difficulty: true,
  content: true,
  explanation: true,
  options: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      content: true,
      isCorrect: true,
      orderIndex: true,
    },
  },
} satisfies Prisma.QuestionSelect;

const instructorTestQuestionSelect = {
  id: true,
  testId: true,
  questionId: true,
  orderIndex: true,
  points: true,
  question: { select: instructorQuestionPreviewSelect },
} satisfies Prisma.TestQuestionSelect;

const instructorTestSelect = {
  id: true,
  courseId: true,
  lessonId: true,
  type: true,
  title: true,
  description: true,
  status: true,
  maxAttempts: true,
  showResultAfterSubmit: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TestSelect;

const instructorTestDetailSelect = {
  ...instructorTestSelect,
  testQuestions: {
    orderBy: { orderIndex: 'asc' as const },
    select: instructorTestQuestionSelect,
  },
} satisfies Prisma.TestSelect;

interface NormalizedQuestionInput {
  type: QuestionType;
  difficulty: QuestionDifficulty;
  content: string;
  explanation: string | null;
  options: Array<{
    content: string;
    isCorrect: boolean;
  }>;
}

interface NormalizedTestInput {
  type: TestType;
  title: string;
  description: string | null;
  lessonId: string | null;
  maxAttempts: number;
  showResultAfterSubmit: boolean;
}

@Injectable()
export class AssessmentInstructorService {
  constructor(private readonly prisma: PrismaService) {}

  async listQuestions(instructorId: string, courseId: string) {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);

    return this.prisma.question.findMany({
      where: { courseId },
      select: instructorQuestionSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async getQuestion(instructorId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: instructorQuestionSelect,
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.assertInstructorOwnsCourse(this.prisma, instructorId, question.courseId);
    return question;
  }

  async createQuestion(instructorId: string, courseId: string, dto: CreateQuestionDto) {
    const input = this.normalizeAndValidateQuestion(dto);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertInstructorOwnsCourse(transaction, instructorId, courseId);

        return transaction.question.create({
          data: {
            courseId,
            type: input.type,
            difficulty: input.difficulty,
            content: input.content,
            explanation: input.explanation,
            options: {
              create: input.options.map((option, orderIndex) => ({
                ...option,
                orderIndex,
              })),
            },
          },
          select: instructorQuestionSelect,
        });
      });
    } catch (error: unknown) {
      this.rethrowKnownMutationConflict(error, 'Question could not be created');
    }
  }

  async updateQuestion(instructorId: string, questionId: string, dto: UpdateQuestionDto) {
    return this.runSerializableMutation(async (transaction) => {
      const question = await transaction.question.findUnique({
        where: { id: questionId },
        select: instructorQuestionSelect,
      });
      if (!question) {
        throw new NotFoundException('Question not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, question.courseId);
      await this.assertQuestionHasNoHistoricalAttempts(transaction, questionId);

      const input = this.normalizeAndValidateQuestion({
        type: dto.type ?? question.type,
        difficulty: dto.difficulty ?? question.difficulty,
        content: dto.content ?? question.content,
        explanation: dto.explanation !== undefined ? dto.explanation : question.explanation,
        options:
          dto.options ??
          question.options.map((option) => ({
            content: option.content,
            isCorrect: option.isCorrect,
          })),
      });

      if (dto.options !== undefined) {
        await transaction.questionOption.deleteMany({
          where: { questionId },
        });
      }

      return transaction.question.update({
        where: { id: questionId },
        data: {
          type: input.type,
          difficulty: input.difficulty,
          content: input.content,
          explanation: input.explanation,
          ...(dto.options !== undefined
            ? {
                options: {
                  create: input.options.map((option, orderIndex) => ({
                    ...option,
                    orderIndex,
                  })),
                },
              }
            : {}),
        },
        select: instructorQuestionSelect,
      });
    });
  }

  async deleteQuestion(instructorId: string, questionId: string): Promise<{ message: string }> {
    try {
      await this.runSerializableMutation(async (transaction) => {
        const question = await transaction.question.findUnique({
          where: { id: questionId },
          select: { courseId: true },
        });
        if (!question) {
          throw new NotFoundException('Question not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, question.courseId);

        const referenceCount = await transaction.testQuestion.count({
          where: { questionId },
        });
        if (referenceCount > 0) {
          throw new ConflictException('Question must be removed from every test before deletion');
        }

        await transaction.questionOption.deleteMany({
          where: { questionId },
        });
        await transaction.question.delete({ where: { id: questionId } });
      });
    } catch (error: unknown) {
      this.rethrowKnownMutationConflict(
        error,
        'Question must be removed from every test before deletion',
      );
    }

    return { message: 'Question deleted successfully' };
  }

  async listTests(instructorId: string, courseId: string) {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);

    return this.prisma.test.findMany({
      where: { courseId },
      select: instructorTestSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async getTest(instructorId: string, testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: instructorTestDetailSelect,
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    await this.assertInstructorOwnsCourse(this.prisma, instructorId, test.courseId);
    return test;
  }

  async createTest(instructorId: string, courseId: string, dto: CreateTestDto) {
    const input = this.normalizeTestInput({
      type: dto.type,
      title: dto.title,
      description: dto.description ?? null,
      lessonId: dto.lessonId ?? null,
      maxAttempts: dto.maxAttempts ?? 1,
      showResultAfterSubmit: dto.showResultAfterSubmit ?? true,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertInstructorOwnsCourse(transaction, instructorId, courseId);
        await this.validateTestLessonRule(transaction, courseId, input.type, input.lessonId, false);

        return transaction.test.create({
          data: {
            courseId,
            ...input,
            status: TestStatus.DRAFT,
          },
          select: instructorTestDetailSelect,
        });
      });
    } catch (error: unknown) {
      this.rethrowKnownMutationConflict(error, 'Test could not be created');
    }
  }

  async updateTest(instructorId: string, testId: string, dto: UpdateTestDto) {
    return this.runSerializableMutation(
      async (transaction) => {
        const test = await transaction.test.findUnique({
          where: { id: testId },
          select: instructorTestSelect,
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);

        const input = this.normalizeTestInput({
          type: dto.type ?? test.type,
          title: dto.title ?? test.title,
          description: dto.description !== undefined ? dto.description : test.description,
          lessonId: dto.lessonId !== undefined ? dto.lessonId : test.lessonId,
          maxAttempts: dto.maxAttempts ?? test.maxAttempts,
          showResultAfterSubmit: dto.showResultAfterSubmit ?? test.showResultAfterSubmit,
        });
        const lockedFieldChanges =
          input.type !== test.type ||
          input.lessonId !== test.lessonId ||
          input.maxAttempts !== test.maxAttempts;
        if (lockedFieldChanges) {
          await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        }
        await this.validateTestLessonRule(
          transaction,
          test.courseId,
          input.type,
          input.lessonId,
          test.status === TestStatus.PUBLISHED,
        );

        return transaction.test.update({
          where: { id: testId },
          data: input,
          select: instructorTestDetailSelect,
        });
      },
      'Test changed concurrently; please try again',
      'Test references changed concurrently; please try again',
    );
  }

  async deleteTest(instructorId: string, testId: string): Promise<{ message: string }> {
    await this.runSerializableMutation(
      async (transaction) => {
        const test = await transaction.test.findUnique({
          where: { id: testId },
          select: { courseId: true },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        await transaction.testQuestion.deleteMany({ where: { testId } });
        await transaction.test.delete({ where: { id: testId } });
      },
      'Test changed concurrently; please try again',
      'Test cannot be deleted because attempt history exists',
    );

    return { message: 'Test deleted successfully' };
  }

  async publishTest(instructorId: string, testId: string) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await transaction.test.findUnique({
        where: { id: testId },
        select: {
          ...instructorTestSelect,
          testQuestions: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              orderIndex: true,
              points: true,
              question: {
                select: {
                  courseId: true,
                  type: true,
                  difficulty: true,
                  content: true,
                  explanation: true,
                  options: {
                    orderBy: { orderIndex: 'asc' },
                    select: { content: true, isCorrect: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.validateTestLessonRule(transaction, test.courseId, test.type, test.lessonId, true);
      if (test.maxAttempts < 1) {
        throw new BadRequestException('maxAttempts must be at least 1');
      }
      if (test.testQuestions.length === 0) {
        throw new BadRequestException('Test must contain at least one question before publishing');
      }

      for (const [orderIndex, testQuestion] of test.testQuestions.entries()) {
        if (testQuestion.orderIndex !== orderIndex) {
          throw new BadRequestException('TestQuestion order must be contiguous before publishing');
        }
        if (testQuestion.points < 1) {
          throw new BadRequestException('Every TestQuestion must have positive points');
        }
        if (testQuestion.question.courseId !== test.courseId) {
          throw new BadRequestException('Every Question must belong to the Test course');
        }
        this.normalizeAndValidateQuestion({
          type: testQuestion.question.type,
          difficulty: testQuestion.question.difficulty,
          content: testQuestion.question.content,
          explanation: testQuestion.question.explanation,
          options: testQuestion.question.options,
        });
      }

      if (test.status === TestStatus.PUBLISHED) {
        return transaction.test.findUniqueOrThrow({
          where: { id: testId },
          select: instructorTestDetailSelect,
        });
      }

      return transaction.test.update({
        where: { id: testId },
        data: { status: TestStatus.PUBLISHED },
        select: instructorTestDetailSelect,
      });
    }, 'Test publication changed concurrently; please try again');
  }

  async unpublishTest(instructorId: string, testId: string) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await transaction.test.findUnique({
        where: { id: testId },
        select: instructorTestSelect,
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.assertTestHasNoHistoricalAttempts(transaction, testId);

      if (test.status === TestStatus.DRAFT) {
        return transaction.test.findUniqueOrThrow({
          where: { id: testId },
          select: instructorTestDetailSelect,
        });
      }

      return transaction.test.update({
        where: { id: testId },
        data: { status: TestStatus.DRAFT },
        select: instructorTestDetailSelect,
      });
    }, 'Test publication changed concurrently; please try again');
  }

  async addTestQuestion(instructorId: string, testId: string, dto: AddTestQuestionDto) {
    return this.runSerializableMutation(
      async (transaction) => {
        const test = await transaction.test.findUnique({
          where: { id: testId },
          select: { courseId: true },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);

        const question = await transaction.question.findFirst({
          where: { id: dto.questionId, courseId: test.courseId },
          select: { id: true },
        });
        if (!question) {
          throw new NotFoundException('Question not found');
        }

        const duplicate = await transaction.testQuestion.findUnique({
          where: {
            testId_questionId: { testId, questionId: dto.questionId },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException('Question already exists in this Test');
        }

        const lastQuestion = await transaction.testQuestion.findFirst({
          where: { testId },
          orderBy: { orderIndex: 'desc' },
          select: { orderIndex: true },
        });

        return transaction.testQuestion.create({
          data: {
            testId,
            questionId: dto.questionId,
            points: dto.points ?? 1,
            orderIndex: lastQuestion ? lastQuestion.orderIndex + 1 : 0,
          },
          select: instructorTestQuestionSelect,
        });
      },
      'Test question order changed concurrently; please try again',
      'Question already exists in this Test',
    );
  }

  async updateTestQuestion(
    instructorId: string,
    testId: string,
    testQuestionId: string,
    dto: UpdateTestQuestionDto,
  ) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await transaction.test.findUnique({
        where: { id: testId },
        select: { courseId: true },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.assertTestHasNoHistoricalAttempts(transaction, testId);
      await this.requireNestedTestQuestion(transaction, testId, testQuestionId);

      return transaction.testQuestion.update({
        where: { id: testQuestionId },
        data: { points: dto.points },
        select: instructorTestQuestionSelect,
      });
    }, 'Test question changed concurrently; please try again');
  }

  async deleteTestQuestion(
    instructorId: string,
    testId: string,
    testQuestionId: string,
  ): Promise<{ message: string }> {
    await this.runSerializableMutation(
      async (transaction) => {
        const test = await transaction.test.findUnique({
          where: { id: testId },
          select: { courseId: true },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        await this.requireNestedTestQuestion(transaction, testId, testQuestionId);
        await transaction.testQuestion.delete({ where: { id: testQuestionId } });
        await this.reindexTestQuestions(transaction, testId);
      },
      'Test question order changed concurrently; please try again',
      'Test question cannot be deleted because attempt history exists',
    );

    return { message: 'Test question deleted successfully' };
  }

  async reorderTestQuestions(instructorId: string, testId: string, dto: ReorderTestQuestionsDto) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await transaction.test.findUnique({
        where: { id: testId },
        select: { courseId: true },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.assertTestHasNoHistoricalAttempts(transaction, testId);

      const existing = await transaction.testQuestion.findMany({
        where: { testId },
        select: { id: true },
      });
      this.validateCompleteTestQuestionOrder(
        existing.map(({ id }) => id),
        dto.orderedIds,
      );
      await this.writeTestQuestionOrder(transaction, dto.orderedIds);

      return transaction.testQuestion.findMany({
        where: { testId },
        orderBy: { orderIndex: 'asc' },
        select: instructorTestQuestionSelect,
      });
    }, 'Test question order changed concurrently; please try again');
  }

  private async assertInstructorOwnsCourse(
    database: PrismaService | Prisma.TransactionClient,
    instructorId: string,
    courseId: string,
  ): Promise<void> {
    const assignment = await database.classOffering.findFirst({
      where: { courseId, instructorId },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to any class offering of this course');
    }
  }

  private async assertQuestionHasNoHistoricalAttempts(
    transaction: Prisma.TransactionClient,
    questionId: string,
  ): Promise<void> {
    const attemptCount = await transaction.testAttempt.count({
      where: {
        test: {
          testQuestions: {
            some: { questionId },
          },
        },
      },
    });
    if (attemptCount > 0) {
      throw new ConflictException('Question cannot be changed after a test attempt exists');
    }
  }

  private async assertTestHasNoHistoricalAttempts(
    transaction: Prisma.TransactionClient,
    testId: string,
  ): Promise<void> {
    const attemptCount = await transaction.testAttempt.count({
      where: { testId },
    });
    if (attemptCount > 0) {
      throw new ConflictException('Test structure cannot be changed after a Test attempt exists');
    }
  }

  private async validateTestLessonRule(
    transaction: Prisma.TransactionClient,
    courseId: string,
    type: TestType,
    lessonId: string | null,
    publishing: boolean,
  ): Promise<void> {
    if (type === TestType.PLACEMENT) {
      if (lessonId !== null) {
        throw new BadRequestException('PLACEMENT must not reference a Lesson');
      }
      return;
    }

    if (publishing && lessonId === null) {
      throw new BadRequestException('A published QUIZ must reference a Lesson');
    }
    if (lessonId === null) {
      return;
    }

    const lesson = await transaction.lesson.findFirst({
      where: {
        id: lessonId,
        module: { courseId },
      },
      select: { id: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
  }

  private normalizeTestInput(input: NormalizedTestInput): NormalizedTestInput {
    const title = input.title.trim();
    if (!title) {
      throw new BadRequestException('Test title must not be empty');
    }
    if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
      throw new BadRequestException('maxAttempts must be a positive integer');
    }

    return {
      ...input,
      title,
      description: input.description?.trim() || null,
    };
  }

  private async requireNestedTestQuestion(
    transaction: Prisma.TransactionClient,
    testId: string,
    testQuestionId: string,
  ): Promise<void> {
    const testQuestion = await transaction.testQuestion.findFirst({
      where: { id: testQuestionId, testId },
      select: { id: true },
    });
    if (!testQuestion) {
      throw new NotFoundException('Test question not found');
    }
  }

  private validateCompleteTestQuestionOrder(existingIds: string[], orderedIds: string[]): void {
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }
    const existingIdSet = new Set(existingIds);
    if (
      orderedIds.length !== existingIds.length ||
      !orderedIds.every((id) => existingIdSet.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must contain exactly all TestQuestion IDs of this Test',
      );
    }
  }

  private async reindexTestQuestions(
    transaction: Prisma.TransactionClient,
    testId: string,
  ): Promise<void> {
    const remaining = await transaction.testQuestion.findMany({
      where: { testId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    await this.writeTestQuestionOrder(
      transaction,
      remaining.map(({ id }) => id),
    );
  }

  private async writeTestQuestionOrder(
    transaction: Prisma.TransactionClient,
    orderedIds: string[],
  ): Promise<void> {
    for (const [index, id] of orderedIds.entries()) {
      await transaction.testQuestion.update({
        where: { id },
        data: { orderIndex: -(index + 1) },
      });
    }
    for (const [index, id] of orderedIds.entries()) {
      await transaction.testQuestion.update({
        where: { id },
        data: { orderIndex: index },
      });
    }
  }

  private normalizeAndValidateQuestion(input: {
    type: QuestionType;
    difficulty: QuestionDifficulty;
    content: string;
    explanation?: string | null;
    options: QuestionOptionInputDto[];
  }): NormalizedQuestionInput {
    const content = input.content.trim();
    const explanation = input.explanation?.trim() || null;
    const options = input.options.map((option) => ({
      content: option.content.trim(),
      isCorrect: option.isCorrect,
    }));

    if (!content) {
      throw new BadRequestException('Question content must not be empty');
    }
    if (options.some((option) => !option.content)) {
      throw new BadRequestException('Option content must not be empty');
    }

    const normalizedOptionTexts = options.map((option) => option.content.toLowerCase());
    if (new Set(normalizedOptionTexts).size !== normalizedOptionTexts.length) {
      throw new BadRequestException('Option content must not contain duplicates');
    }

    const correctCount = options.filter((option) => option.isCorrect).length;
    switch (input.type) {
      case QuestionType.SINGLE_CHOICE:
        if (options.length < 2 || correctCount !== 1) {
          throw new BadRequestException(
            'SINGLE_CHOICE requires at least two options and exactly one correct option',
          );
        }
        break;
      case QuestionType.TRUE_FALSE:
        if (options.length !== 2 || correctCount !== 1) {
          throw new BadRequestException(
            'TRUE_FALSE requires exactly two options and exactly one correct option',
          );
        }
        break;
      case QuestionType.MULTIPLE_CHOICE:
        if (options.length < 2 || correctCount < 1) {
          throw new BadRequestException(
            'MULTIPLE_CHOICE requires at least two options and at least one correct option',
          );
        }
        break;
      default:
        throw new BadRequestException('Unsupported question type');
    }

    return {
      type: input.type,
      difficulty: input.difficulty,
      content,
      explanation,
      options,
    };
  }

  private async runSerializableMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    concurrencyMessage = 'Question changed concurrently; please try again',
    constraintMessage?: string,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ASSESSMENT_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') || this.isRelevantTestQuestionOrderConflict(error);
        if (retryable) {
          if (attempt === MAX_ASSESSMENT_TRANSACTION_ATTEMPTS) {
            throw new ConflictException(concurrencyMessage);
          }
          continue;
        }
        if (
          constraintMessage &&
          (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2003'))
        ) {
          throw new ConflictException(constraintMessage);
        }
        throw error;
      }
    }

    throw new ConflictException(concurrencyMessage);
  }

  private rethrowKnownMutationConflict(error: unknown, message: string): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }
    if (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2003')) {
      throw new ConflictException(message);
    }
    throw error;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private isRelevantTestQuestionOrderConflict(error: unknown): boolean {
    if (!this.isPrismaError(error, 'P2002')) {
      return false;
    }

    const metadata = (error as Prisma.PrismaClientKnownRequestError).meta as
      Record<string, unknown> | undefined;
    if (metadata?.modelName && metadata.modelName !== 'TestQuestion') {
      return false;
    }
    try {
      const serialized = JSON.stringify(metadata).toLowerCase();
      return serialized.includes('testid') && serialized.includes('orderindex');
    } catch {
      return false;
    }
  }
}
