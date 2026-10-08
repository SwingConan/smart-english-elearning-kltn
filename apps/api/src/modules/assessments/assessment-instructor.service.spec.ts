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
import { readSheet } from 'read-excel-file/node';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';

const xlsxBuffer = (rows: SheetData) => writeXlsxFile(rows, { sheet: 'Questions' }).toBuffer();

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
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    testQuestionGroup: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    classOffering: { findFirst: jest.fn() },
    question: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    rubric: { findMany: jest.fn() },
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
    prisma.question.count.mockResolvedValue(0);
    prisma.question.findMany.mockResolvedValue([]);
    prisma.rubric.findMany.mockResolvedValue([]);
    transaction.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    transaction.lesson.findFirst.mockResolvedValue({ id: 'lesson-id' });
    transaction.testAttempt.count.mockResolvedValue(0);
    transaction.testQuestion.findUnique.mockResolvedValue(null);
    transaction.testQuestion.findFirst.mockResolvedValue(null);
    transaction.testQuestion.findMany.mockResolvedValue([]);
    transaction.testQuestion.count.mockResolvedValue(0);
    transaction.question.findFirst.mockResolvedValue({ id: questionId });
    transaction.rubric.findFirst.mockResolvedValue({ id: 'rubric-id' });
    transaction.testQuestionGroup.findFirst.mockResolvedValue({ skill: ToeicSkill.READING });
    transaction.testQuestionGroup.findMany.mockResolvedValue([]);
    transaction.testQuestionGroup.update.mockResolvedValue({});
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
    await expect(service.listQuestions(instructorId, courseId)).resolves.toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    prisma.classOffering.findFirst.mockResolvedValueOnce(null);
    await expect(service.listQuestions('unassigned', courseId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns complete ordered groups after reordering so the editor can render safely', async () => {
    const completeGroups = [
      { id: 'group-b', orderIndex: 0, stimuli: [{ id: 'stimulus-b' }], testQuestions: [] },
      { id: 'group-a', orderIndex: 1, stimuli: [], testQuestions: [{ id: 'question-a' }] },
    ];
    transaction.test.findUnique.mockResolvedValue({
      id: testId,
      courseId,
      status: TestStatus.DRAFT,
      course: { instructorId },
    });
    transaction.testQuestionGroup.findMany
      .mockResolvedValueOnce([{ id: 'group-a' }, { id: 'group-b' }])
      .mockResolvedValueOnce(completeGroups);

    await expect(
      service.reorderTestGroups(instructorId, testId, {
        orderedGroupIds: ['group-b', 'group-a'],
      }),
    ).resolves.toEqual(completeGroups);

    expect(transaction.testQuestionGroup.findMany).toHaveBeenLastCalledWith({
      where: { testId },
      orderBy: { orderIndex: 'asc' },
      include: {
        stimuli: { orderBy: { orderIndex: 'asc' } },
        testQuestions: { orderBy: { orderIndex: 'asc' } },
      },
    });
  });

  it('uses bounded server-side question pagination and usage filtering', async () => {
    prisma.question.findMany.mockResolvedValue([]);
    prisma.question.count.mockResolvedValue(142);
    const result = await service.listQuestions(instructorId, courseId, { page: 3, pageSize: 20, search: 'email', usage: 'UNUSED' });
    expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20, where: expect.objectContaining({ courseId, content: { contains: 'email', mode: 'insensitive' }, testQuestions: { none: {} } }) }));
    expect(result).toMatchObject({ page: 3, pageSize: 20, total: 142, totalPages: 8 });
  });

  it('generates a template readable by the maintained XLSX reader', async () => {
    const buffer = await service.questionImportTemplate(instructorId, courseId);
    const rows = await readSheet(buffer);
    expect(rows[0]).toEqual(['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id']);
    expect(rows[1]).toEqual(expect.arrayContaining(['READING', 'SINGLE_CHOICE', 'EASY']));
  });

  it('treats formula cells as inert values and never executes or writes them', async () => {
    const buffer = await xlsxBuffer([
      ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'],
      ['READING', 'SINGLE_CHOICE', 'EASY', { type: 'Formula', value: 'HYPERLINK("https://example.test")' }, '', 'A', 'B', '', '', 'A', ''],
    ]);
    const result = await service.previewQuestionImport(instructorId, courseId, { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'questions.xlsx', size: buffer.length });
    expect(result.canConfirm).toBe(false);
    expect(JSON.stringify(result)).not.toContain('unsafe');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces XLSX file and row caps before any import write', async () => {
    await expect(service.previewQuestionImport(instructorId, courseId, {
      buffer: Buffer.alloc(0), mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'too-large.xlsx', size: 5 * 1024 * 1024 + 1,
    })).rejects.toBeInstanceOf(BadRequestException);

    const rows: SheetData = [['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id']];
    for (let index = 0; index < 2001; index += 1) rows.push(['READING', 'SINGLE_CHOICE', 'EASY', `Question ${index}`, '', 'A', 'B', '', '', 'A', '']);
    const buffer = await xlsxBuffer(rows);
    await expect(service.previewQuestionImport(instructorId, courseId, {
      buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'too-many.xlsx', size: buffer.length,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed XLSX without writing data', async () => {
    await expect(service.previewQuestionImport(instructorId, courseId, {
      buffer: Buffer.from('not-an-xlsx'), mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'malformed.xlsx', size: 11,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates productive rubric activity during preview with one bounded query', async () => {
    const activeRubricId = '11111111-1111-4111-8111-111111111111';
    const inactiveRubricId = '22222222-2222-4222-8222-222222222222';
    prisma.rubric.findMany.mockResolvedValue([{ id: activeRubricId }]);
    const buffer = await xlsxBuffer([
      ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'],
      ['WRITING', 'TEXT_RESPONSE', 'MEDIUM', 'Write an email.', '', '', '', '', '', '', activeRubricId],
      ['SPEAKING', 'AUDIO_RESPONSE', 'MEDIUM', 'Respond to the prompt.', '', '', '', '', '', '', activeRubricId],
      ['SPEAKING', 'AUDIO_RESPONSE', 'MEDIUM', 'Describe the picture.', '', '', '', '', '', '', inactiveRubricId],
    ]);
    const result = await service.previewQuestionImport(instructorId, courseId, { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'productive.xlsx', size: buffer.length });
    expect(prisma.rubric.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.rubric.findMany).toHaveBeenCalledWith({ where: { id: { in: [activeRubricId, inactiveRubricId] }, isActive: true }, select: { id: true } });
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[1].errors).toEqual([]);
    expect(result.rows[2].errors.join(' ')).toContain('Rubric');
    expect(result).toMatchObject({ canConfirm: false, summary: { total: 3, valid: 2, invalid: 1 } });
  });

  it('reports a missing productive rubric as a row-level preview error', async () => {
    const buffer = await xlsxBuffer([
      ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'],
      ['WRITING', 'TEXT_RESPONSE', 'MEDIUM', 'Write a memo.', '', '', '', '', '', '', ''],
    ]);
    const result = await service.previewQuestionImport(instructorId, courseId, { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'missing-rubric.xlsx', size: buffer.length });
    expect(result.canConfirm).toBe(false);
    expect(result.rows[0].errors.join(' ')).toContain('rubric');
  });

  it('reports duplicate warnings separately without blocking a valid preview', async () => {
    prisma.question.findMany.mockResolvedValue([{ toeicSkill: ToeicSkill.READING, responseType: QuestionResponseType.SINGLE_CHOICE, content: 'Existing question' }]);
    const buffer = await xlsxBuffer([
      ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'],
      ['READING', 'SINGLE_CHOICE', 'EASY', 'Repeated question', '', 'A', 'B', '', '', 'A', ''],
      ['READING', 'SINGLE_CHOICE', 'EASY', 'Repeated question', '', 'A', 'B', '', '', 'A', ''],
      ['READING', 'SINGLE_CHOICE', 'EASY', 'Existing question', '', 'A', 'B', '', '', 'A', ''],
    ]);
    const result = await service.previewQuestionImport(instructorId, courseId, { buffer, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', originalname: 'duplicates.xlsx', size: buffer.length });
    expect(result.canConfirm).toBe(true);
    expect(result.summary).toEqual({ total: 3, valid: 3, invalid: 0, warnings: 3 });
    expect(result.rows[0].warnings[0]).toContain('trùng trong tệp');
    expect(result.rows[1].warnings[0]).toContain('trùng trong tệp');
    expect(result.rows[2].warnings[0]).toContain('ngân hàng');
  });

  it('confirms a validated import atomically and preserves objective option order', async () => {
    transaction.question.create
      .mockResolvedValueOnce({ id: 'imported-a' })
      .mockResolvedValueOnce({ id: 'imported-b' });
    const result = await service.confirmQuestionImport(instructorId, courseId, { rows: [
      { type: QuestionResponseType.SINGLE_CHOICE, toeicSkill: ToeicSkill.READING, difficulty: QuestionDifficulty.EASY, content: 'Imported A', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }] },
      { type: QuestionResponseType.TRUE_FALSE, toeicSkill: ToeicSkill.LISTENING, difficulty: QuestionDifficulty.MEDIUM, content: 'Imported B', options: [{ content: 'True', isCorrect: true }, { content: 'False', isCorrect: false }] },
    ] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.question.create).toHaveBeenCalledTimes(2);
    expect(transaction.question.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ options: { create: [{ content: 'A', isCorrect: true, orderIndex: 0 }, { content: 'B', isCorrect: false, orderIndex: 1 }] } }) }));
    expect(result).toEqual({ importedCount: 2, questionIds: ['imported-a', 'imported-b'] });
  });

  it('keeps confirm all-or-nothing and rechecks productive rubrics', async () => {
    transaction.rubric.findFirst.mockResolvedValueOnce(null);
    await expect(service.confirmQuestionImport(instructorId, courseId, { rows: [{
      type: QuestionResponseType.AUDIO_RESPONSE, toeicSkill: ToeicSkill.SPEAKING, difficulty: QuestionDifficulty.MEDIUM,
      content: 'Speak now', rubricId: 'inactive-rubric', options: [],
    }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.question.create).not.toHaveBeenCalled();

    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction));
    transaction.classOffering.findFirst.mockResolvedValue({ id: 'offering-id' });
    transaction.question.create.mockResolvedValueOnce({ id: 'first' }).mockRejectedValueOnce(new Error('write failure'));
    await expect(service.confirmQuestionImport(instructorId, courseId, { rows: [
      { type: QuestionResponseType.SINGLE_CHOICE, toeicSkill: ToeicSkill.READING, difficulty: QuestionDifficulty.EASY, content: 'First', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }] },
      { type: QuestionResponseType.SINGLE_CHOICE, toeicSkill: ToeicSkill.READING, difficulty: QuestionDifficulty.EASY, content: 'Second', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: false }] },
    ] })).rejects.toThrow('write failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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

  describe('published Question Bank mutation integrity', () => {
    const existingQuestion = {
      id: questionId,
      courseId,
      responseType: QuestionResponseType.SINGLE_CHOICE,
      toeicSkill: ToeicSkill.READING,
      difficulty: QuestionDifficulty.MEDIUM,
      content: 'Original wording',
      explanation: null,
      rubricId: null,
      options: [
        { id: 'option-a', content: 'A', isCorrect: true, orderIndex: 0 },
        { id: 'option-b', content: 'B', isCorrect: false, orderIndex: 1 },
      ],
    };

    beforeEach(() => {
      transaction.question.findUnique.mockResolvedValue(existingQuestion);
      transaction.question.update.mockResolvedValue({ ...existingQuestion, content: 'Updated wording' });
    });

    it('rejects a skill-changing update when a referenced published grouped test becomes invalid', async () => {
      transaction.testQuestion.findMany.mockResolvedValue([{ testId: 'published-test' }]);
      const validationError = new BadRequestException('Question skill no longer matches its group');
      const validate = jest.spyOn(service, 'validatePublishableTest').mockRejectedValue(validationError);

      await expect(service.updateQuestion(instructorId, questionId, {
        toeicSkill: ToeicSkill.SPEAKING,
        type: QuestionResponseType.AUDIO_RESPONSE,
        rubricId: 'rubric-id',
        options: [],
      })).rejects.toBe(validationError);

      expect(transaction.question.update).toHaveBeenCalled();
      expect(validate).toHaveBeenCalledWith(transaction, 'published-test');
      expect(prisma.$transaction).toHaveReturned();
      validate.mockRestore();
    });

    it('accepts a safe wording and difficulty update after the published test remains valid', async () => {
      transaction.testQuestion.findMany.mockResolvedValue([{ testId: 'published-test' }]);
      const validate = jest.spyOn(service, 'validatePublishableTest').mockResolvedValue({} as never);

      await expect(service.updateQuestion(instructorId, questionId, {
        content: 'Updated wording',
        difficulty: QuestionDifficulty.HARD,
      })).resolves.toEqual(expect.objectContaining({ content: 'Updated wording' }));

      expect(validate).toHaveBeenCalledWith(transaction, 'published-test');
      validate.mockRestore();
    });

    it('revalidates every published test that references the changed question', async () => {
      transaction.testQuestion.findMany.mockResolvedValue([
        { testId: 'published-test-a' },
        { testId: 'published-test-b' },
      ]);
      const validate = jest.spyOn(service, 'validatePublishableTest').mockResolvedValue({} as never);

      await service.updateQuestion(instructorId, questionId, { content: 'Updated wording' });

      expect(validate).toHaveBeenCalledTimes(2);
      expect(validate).toHaveBeenNthCalledWith(1, transaction, 'published-test-a');
      expect(validate).toHaveBeenNthCalledWith(2, transaction, 'published-test-b');
      validate.mockRestore();
    });

    it('keeps the historical-attempt lock ahead of any question mutation or revalidation', async () => {
      transaction.testAttempt.count.mockResolvedValueOnce(1);
      const validate = jest.spyOn(service, 'validatePublishableTest');

      await expect(service.updateQuestion(instructorId, questionId, {
        content: 'Blocked wording',
      })).rejects.toBeInstanceOf(ConflictException);

      expect(transaction.testQuestion.findMany).not.toHaveBeenCalled();
      expect(transaction.questionOption.deleteMany).not.toHaveBeenCalled();
      expect(transaction.question.update).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
      validate.mockRestore();
    });
  });
});
