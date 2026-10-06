import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  QuestionDifficulty,
  QuestionResponseType,
  TestStatus,
  TestPurpose,
  ToeicSkill,
} from '../../generated/prisma/client';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { AssessmentStimulusMediaStorage } from '../placement/assessment-stimulus-media.storage';

describe('AssessmentInstructorService', () => {
  const instructorId = 'instructor-id';
  const courseId = 'course-id';
  const questionId = 'question-id';
  const testId = 'test-id';
  const transaction = {
    classOffering: { findFirst: jest.fn() },
    lesson: { findFirst: jest.fn() },
    question: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    questionOption: { deleteMany: jest.fn() },
    rubric: { findFirst: jest.fn() },
    test: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    testAttempt: { count: jest.fn() },
    testQuestion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    testQuestionGroup: { findFirst: jest.fn() },
  };
  const prisma = {
    classOffering: { findFirst: jest.fn() },
    question: { findMany: jest.fn(), findUnique: jest.fn() },
    test: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const stimulusStorage = { read: jest.fn(), put: jest.fn(), delete: jest.fn(), exists: jest.fn() };
  const service = new AssessmentInstructorService(
    prisma as unknown as PrismaService,
    stimulusStorage as unknown as AssessmentStimulusMediaStorage,
  );

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
    transaction.rubric.findFirst.mockResolvedValue({ id: 'rubric-id' });
    transaction.testQuestionGroup.findFirst.mockResolvedValue({ skill: ToeicSkill.READING });
    transaction.question.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: questionId, ...data }),
    );
    transaction.test.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: testId, ...data, testQuestions: [] }),
    );
    transaction.testQuestion.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'test-question-id', ...data }),
    );
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction),
    );
  });

  it.each([
    [
      QuestionResponseType.SINGLE_CHOICE,
      [
        { content: 'A', isCorrect: true },
        { content: 'B', isCorrect: false },
      ],
    ],
    [
      QuestionResponseType.TRUE_FALSE,
      [
        { content: 'Custom true', isCorrect: true },
        { content: 'Custom false', isCorrect: false },
      ],
    ],
    [
      QuestionResponseType.MULTIPLE_CHOICE,
      [
        { content: 'A', isCorrect: true },
        { content: 'B', isCorrect: true },
        { content: 'C', isCorrect: false },
      ],
    ],
  ])('accepts valid %s questions and assigns contiguous option order', async (type, options) => {
    await service.createQuestion(instructorId, courseId, {
      type,
      toeicSkill: 'READING',
      difficulty: QuestionDifficulty.HARD,
      content: '  Valid question  ',
      explanation: '  Explanation  ',
      options,
    });

    expect(transaction.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courseId,
        responseType: type,
        toeicSkill: 'READING',
        difficulty: QuestionDifficulty.HARD,
        content: 'Valid question',
        explanation: 'Explanation',
        options: { create: options.map((option, orderIndex) => ({ ...option, orderIndex })) },
      }),
      select: expect.any(Object),
    });
  });

  it.each([
    ['SC zero correct', QuestionResponseType.SINGLE_CHOICE, [false, false]],
    ['SC multiple correct', QuestionResponseType.SINGLE_CHOICE, [true, true]],
    ['TF wrong count', QuestionResponseType.TRUE_FALSE, [true, false, false]],
    ['TF zero correct', QuestionResponseType.TRUE_FALSE, [false, false]],
    ['MC zero correct', QuestionResponseType.MULTIPLE_CHOICE, [false, false]],
  ])('rejects invalid question structure: %s', async (_label, type, correct) => {
    await expect(
      service.createQuestion(instructorId, courseId, {
        type,
        toeicSkill: 'READING',
        difficulty: QuestionDifficulty.EASY,
        content: 'Question',
        options: correct.map((isCorrect, index) => ({ content: `Option ${index}`, isCorrect })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'empty question',
      '',
      [
        { content: 'A', isCorrect: true },
        { content: 'B', isCorrect: false },
      ],
    ],
    [
      'empty option',
      'Question',
      [
        { content: ' ', isCorrect: true },
        { content: 'B', isCorrect: false },
      ],
    ],
    [
      'normalized duplicate',
      'Question',
      [
        { content: ' Same ', isCorrect: true },
        { content: 'same', isCorrect: false },
      ],
    ],
  ])('rejects %s', async (_label, content, options) => {
    await expect(
      service.createQuestion(instructorId, courseId, {
        type: QuestionResponseType.SINGLE_CHOICE,
        toeicSkill: 'READING',
        difficulty: QuestionDifficulty.MEDIUM,
        content,
        options,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces assigned-course authorization', async () => {
    prisma.question.findMany.mockResolvedValue([]);
    await expect(service.listQuestions(instructorId, courseId)).resolves.toEqual([]);
    prisma.classOffering.findFirst.mockResolvedValueOnce(null);
    await expect(service.listQuestions('unassigned', courseId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    [ToeicSkill.LISTENING, QuestionResponseType.TEXT_RESPONSE],
    [ToeicSkill.READING, QuestionResponseType.AUDIO_RESPONSE],
    [ToeicSkill.SPEAKING, QuestionResponseType.SINGLE_CHOICE],
    [ToeicSkill.WRITING, QuestionResponseType.MULTIPLE_CHOICE],
  ])('rejects the invalid %s/%s authoring matrix', async (toeicSkill, type) => {
    await expect(service.createQuestion(instructorId, courseId, {
      toeicSkill, type, difficulty: QuestionDifficulty.MEDIUM, content: 'Invalid matrix',
      rubricId: toeicSkill === ToeicSkill.SPEAKING || toeicSkill === ToeicSkill.WRITING ? 'rubric-id' : undefined,
      options: toeicSkill === ToeicSkill.SPEAKING || toeicSkill === ToeicSkill.WRITING ? [] : [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an active rubric and no options for productive authoring', async () => {
    await service.createQuestion(instructorId, courseId, {
      toeicSkill: ToeicSkill.WRITING, type: QuestionResponseType.TEXT_RESPONSE,
      difficulty: QuestionDifficulty.MEDIUM, content: 'Write an email', rubricId: 'rubric-id', options: [],
    });
    expect(transaction.question.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rubricId: 'rubric-id', options: { create: [] } }) }));
    transaction.rubric.findFirst.mockResolvedValueOnce(null);
    await expect(service.createQuestion(instructorId, courseId, {
      toeicSkill: ToeicSkill.SPEAKING, type: QuestionResponseType.AUDIO_RESPONSE,
      difficulty: QuestionDifficulty.MEDIUM, content: 'Respond aloud', rubricId: 'inactive-rubric', options: [],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies Test defaults and lesson rules', async () => {
    const draft = await service.createTest(instructorId, courseId, {
      type: TestPurpose.PLACEMENT,
      title: ' Placement ',
    });
    expect(draft).toMatchObject({
      status: TestStatus.DRAFT,
      maxAttempts: 1,
      showResultAfterSubmit: true,
      lessonId: null,
    });

    await expect(
      service.createTest(instructorId, courseId, {
        type: TestPurpose.PLACEMENT,
        title: 'Invalid',
        lessonId: 'lesson-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createTest(instructorId, courseId, {
        type: TestPurpose.IN_CLASS,
        title: 'Draft without lesson',
        lessonId: null,
      }),
    ).resolves.toMatchObject({ lessonId: null, status: TestStatus.DRAFT });

    transaction.lesson.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createTest(instructorId, courseId, {
        type: TestPurpose.IN_CLASS,
        title: 'Cross course',
        lessonId: 'foreign-lesson',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.createTest(instructorId, courseId, {
        type: TestPurpose.IN_CLASS,
        title: 'Bad attempts',
        maxAttempts: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    await expect(
      service.addTestQuestion(instructorId, testId, {
        questionId: 'foreign-question',
        points: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    transaction.testQuestion.findUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      service.addTestQuestion(instructorId, testId, {
        questionId,
        points: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces group skill compatibility and historical-attempt structure locks', async () => {
    transaction.test.findUnique.mockResolvedValue({ courseId });
    transaction.question.findFirst.mockResolvedValue({ id: questionId, toeicSkill: ToeicSkill.READING });
    transaction.testQuestionGroup.findFirst.mockResolvedValueOnce({ skill: ToeicSkill.LISTENING });
    await expect(service.addTestQuestion(instructorId, testId, { questionId, groupId: 'group-id', points: 1 })).rejects.toBeInstanceOf(BadRequestException);
    transaction.testAttempt.count.mockResolvedValueOnce(1);
    await expect(service.addTestQuestion(instructorId, testId, { questionId, points: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.testQuestion.create).not.toHaveBeenCalled();
  });

  it('moves a question only to a compatible nested group', async () => {
    transaction.test.findUnique.mockResolvedValue({ courseId });
    transaction.testQuestion.findFirst.mockResolvedValue({ id: 'test-question-id', question: { toeicSkill: ToeicSkill.READING } });
    transaction.testQuestion.update.mockResolvedValue({ id: 'test-question-id', groupId: 'group-id' });
    transaction.testQuestionGroup.findFirst.mockResolvedValueOnce({ skill: ToeicSkill.READING });
    await expect(service.moveTestQuestionGroup(instructorId, testId, 'test-question-id', 'group-id')).resolves.toMatchObject({ groupId: 'group-id' });
    transaction.testQuestionGroup.findFirst.mockResolvedValueOnce({ skill: ToeicSkill.LISTENING });
    await expect(service.moveTestQuestionGroup(instructorId, testId, 'test-question-id', 'group-id')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revalidates the complete invariant inside a published-test mutation', async () => {
    transaction.test.findUnique.mockResolvedValue({ courseId, status: TestStatus.PUBLISHED });
    transaction.question.findFirst.mockResolvedValue({ id: questionId, toeicSkill: ToeicSkill.READING });
    const validate = jest.spyOn(service, 'validatePublishableTest').mockResolvedValue({} as never);
    await service.addTestQuestion(instructorId, testId, { questionId, points: 1 });
    expect(validate).toHaveBeenCalledWith(transaction, testId);
    validate.mockRestore();
  });
});
