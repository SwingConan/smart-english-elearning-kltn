import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionDifficulty, QuestionType } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateQuestionDto, QuestionOptionInputDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

const MAX_QUESTION_TRANSACTION_ATTEMPTS = 3;

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
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_QUESTION_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!this.isPrismaError(error, 'P2034')) {
          throw error;
        }
        if (attempt === MAX_QUESTION_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Question changed concurrently; please try again');
        }
      }
    }

    throw new ConflictException('Question could not be changed');
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
}
