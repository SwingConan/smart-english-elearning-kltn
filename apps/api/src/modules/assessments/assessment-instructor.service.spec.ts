import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
} from '../../infrastructure/prisma/prisma.service';
import {
  QuestionDifficulty,
  QuestionType,
  TestStatus,
  TestType,
} from '../../generated/prisma/client';
import { AssessmentInstructorService } from './assessment-instructor.service';

describe('AssessmentInstructorService', () => {
  const instructorId = 'instructor-id';
  const courseId = 'course-id';
  const questionId = 'question-id';
  const testId = 'test-id';
  const transaction = {
    classOffering: { findFirst: jest.fn() },
    lesson: { findFirst: jest.fn() },
    question: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    questionOption: { deleteMany: jest.fn() },
    test: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    testAttempt: { count: jest.fn() },
    testQuestion: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    classOffering: { findFirst: jest.fn() },
    question: { findMany: jest.fn(), findUnique: jest.fn() },
    test: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AssessmentInstructorService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    transaction.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    transaction.lesson.findFirst.mockResolvedValue({ id: 'lesson-id' });
    transaction.testAttempt.count.mockResolvedValue(0);
    transaction.testQuestion.findUnique.mockResolvedValue(null);
    transaction.testQuestion.findFirst.mockResolvedValue(null);
    transaction.testQuestion.count.mockResolvedValue(0);
    transaction.question.findFirst.mockResolvedValue({ id: questionId });
    transaction.question.create.mockImplementation(({ data }) => Promise.resolve({ id: questionId, ...data }));
    transaction.test.create.mockImplementation(({ data }) => Promise.resolve({ id: testId, ...data, testQuestions: [] }));
    transaction.testQuestion.create.mockImplementation(({ data }) => Promise.resolve({ id: 'test-question-id', ...data }));
    prisma.$transaction.mockImplementation((operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction));
  });

  it.each([
    [QuestionType.SINGLE_CHOICE, [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }]],
    [QuestionType.TRUE_FALSE, [{ content: 'Custom true', isCorrect: true }, { content: 'Custom false', isCorrect: false }]],
    [QuestionType.MULTIPLE_CHOICE, [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: true }, { content: 'C', isCorrect: false }]],
  ])('accepts valid %s questions and assigns contiguous option order', async (type, options) => {
    await service.createQuestion(instructorId, courseId, {
      type,
      difficulty: QuestionDifficulty.HARD,
      content: '  Valid question  ',
      explanation: '  Explanation  ',
      options,
    });

    expect(transaction.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId,
        type,
        difficulty: QuestionDifficulty.HARD,
        content: 'Valid question',
        explanation: 'Explanation',
        options: { create: options.map((option, orderIndex) => ({ ...option, orderIndex })) },
      }),
      select: expect.any(Object),
    });
  });

  it.each([
    ['SC zero correct', QuestionType.SINGLE_CHOICE, [false, false]],
    ['SC multiple correct', QuestionType.SINGLE_CHOICE, [true, true]],
    ['TF wrong count', QuestionType.TRUE_FALSE, [true, false, false]],
    ['TF zero correct', QuestionType.TRUE_FALSE, [false, false]],
    ['MC zero correct', QuestionType.MULTIPLE_CHOICE, [false, false]],
  ])('rejects invalid question structure: %s', async (_label, type, correct) => {
    await expect(service.createQuestion(instructorId, courseId, {
      type,
      difficulty: QuestionDifficulty.EASY,
      content: 'Question',
      options: correct.map((isCorrect, index) => ({ content: `Option ${index}`, isCorrect })),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['empty question', '', [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }]],
    ['empty option', 'Question', [{ content: ' ', isCorrect: true }, { content: 'B', isCorrect: false }]],
    ['normalized duplicate', 'Question', [{ content: ' Same ', isCorrect: true }, { content: 'same', isCorrect: false }]],
  ])('rejects %s', async (_label, content, options) => {
    await expect(service.createQuestion(instructorId, courseId, {
      type: QuestionType.SINGLE_CHOICE,
      difficulty: QuestionDifficulty.MEDIUM,
      content,
      options,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces assigned-course authorization', async () => {
    prisma.question.findMany.mockResolvedValue([]);
    await expect(service.listQuestions(instructorId, courseId)).resolves.toEqual([]);
    prisma.classOffering.findFirst.mockResolvedValueOnce(null);
    await expect(service.listQuestions('unassigned', courseId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies Test defaults and lesson rules', async () => {
    const draft = await service.createTest(instructorId, courseId, {
      type: TestType.PLACEMENT,
      title: ' Placement ',
    });
    expect(draft).toMatchObject({
      status: TestStatus.DRAFT,
      maxAttempts: 1,
      showResultAfterSubmit: true,
      lessonId: null,
    });

    await expect(service.createTest(instructorId, courseId, {
      type: TestType.PLACEMENT,
      title: 'Invalid',
      lessonId: 'lesson-id',
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.createTest(instructorId, courseId, {
      type: TestType.QUIZ,
      title: 'Draft without lesson',
      lessonId: null,
    })).resolves.toMatchObject({ lessonId: null, status: TestStatus.DRAFT });

    transaction.lesson.findFirst.mockResolvedValueOnce(null);
    await expect(service.createTest(instructorId, courseId, {
      type: TestType.QUIZ,
      title: 'Cross course',
      lessonId: 'foreign-lesson',
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(service.createTest(instructorId, courseId, {
      type: TestType.QUIZ,
      title: 'Bad attempts',
      maxAttempts: 0,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('appends same-course TestQuestions and rejects cross-course and duplicates', async () => {
    transaction.test.findUnique.mockResolvedValue({ courseId });
    transaction.testQuestion.findFirst.mockResolvedValue({ orderIndex: 2 });

    await service.addTestQuestion(instructorId, testId, { questionId, points: 3 });
    expect(transaction.testQuestion.create).toHaveBeenCalledWith({
      data: { testId, questionId, points: 3, orderIndex: 3 },
      select: expect.any(Object),
    });

    transaction.question.findFirst.mockResolvedValueOnce(null);
    await expect(service.addTestQuestion(instructorId, testId, {
      questionId: 'foreign-question',
      points: 1,
    })).rejects.toBeInstanceOf(NotFoundException);

    transaction.testQuestion.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.addTestQuestion(instructorId, testId, {
      questionId,
      points: 1,
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
