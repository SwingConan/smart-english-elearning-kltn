import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readSheet, type CellValue, type SheetData as ReadSheetData } from 'read-excel-file/node';
import writeXlsxFile, { type SheetData as WriteSheetData } from 'write-excel-file/node';
import {
  Prisma,
  AssessmentStimulusType,
  QuestionDifficulty,
  QuestionResponseType,
  PlacementMode,
  ToeicSkill,
  TestStatus,
  TestPurpose,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AddTestQuestionDto } from './dto/add-test-question.dto';
import { CreateQuestionDto, QuestionOptionInputDto } from './dto/create-question.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderTestQuestionsDto } from './dto/reorder-test-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateTestQuestionDto } from './dto/update-test-question.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { AssessmentStimulusMediaStorage } from '../placement/assessment-stimulus-media.storage';
import {
  CreateTestGroupDto,
  CreateTextStimulusDto,
  ReorderStimuliDto,
  ReorderTestGroupsDto,
  UpdateTestGroupDto,
} from './dto/test-group.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { ConfirmQuestionImportDto } from './dto/confirm-question-import.dto';

const MAX_ASSESSMENT_TRANSACTION_ATTEMPTS = 3;

const instructorQuestionSelect = {
  id: true,
  courseId: true,
  responseType: true,
  toeicSkill: true,
  difficulty: true,
  content: true,
  explanation: true,
  rubricId: true,
  rubric: { select: { id: true, name: true, description: true, isActive: true, criteria: { orderBy: { orderIndex: 'asc' as const } } } },
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
  _count: { select: { testQuestions: true } },
} satisfies Prisma.QuestionSelect;

const instructorQuestionPreviewSelect = {
  id: true,
  responseType: true,
  toeicSkill: true,
  difficulty: true,
  content: true,
  explanation: true,
  rubricId: true,
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
  groupId: true,
  orderIndex: true,
  points: true,
  question: { select: instructorQuestionPreviewSelect },
} satisfies Prisma.TestQuestionSelect;

const instructorTestSelect = {
  id: true,
  courseId: true,
  lessonId: true,
  purpose: true,
  placementMode: true,
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
  questionGroups: {
    orderBy: { orderIndex: 'asc' as const },
    select: {
      id: true,
      skill: true,
      orderIndex: true,
      title: true,
      instructions: true,
      preparationSeconds: true,
      responseSeconds: true,
      recommendedSeconds: true,
      maxRecordingSeconds: true,
      updatedAt: true,
      stimuli: { orderBy: { orderIndex: 'asc' as const } },
      testQuestions: {
        orderBy: { orderIndex: 'asc' as const },
        select: instructorTestQuestionSelect,
      },
    },
  },
} satisfies Prisma.TestSelect;

interface NormalizedQuestionInput {
  responseType: QuestionResponseType;
  toeicSkill: ToeicSkill;
  difficulty: QuestionDifficulty;
  content: string;
  explanation: string | null;
  rubricId: string | null;
  options: Array<{
    content: string;
    isCorrect: boolean;
  }>;
}

function safeSpreadsheetText(value: CellValue | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function questionImportKey(input: Pick<CreateQuestionDto, 'toeicSkill' | 'type' | 'content'>): string {
  return `${input.toeicSkill}\u0000${input.type}\u0000${input.content.trim().normalize('NFKC').toLocaleLowerCase('en-US')}`;
}

interface NormalizedTestInput {
  purpose: TestPurpose;
  placementMode: PlacementMode | null;
  title: string;
  description: string | null;
  lessonId: string | null;
  maxAttempts: number;
  showResultAfterSubmit: boolean;
}

@Injectable()
export class AssessmentInstructorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stimulusStorage: AssessmentStimulusMediaStorage,
  ) {}

  listActiveRubrics() {
    return this.prisma.rubric.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
        criteria: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            weight: true,
            maxScore: true,
            orderIndex: true,
          },
        },
      },
    });
  }

  async getActiveRubric(rubricId: string) {
    const rubric = await this.prisma.rubric.findFirst({
      where: { id: rubricId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        updatedAt: true,
        criteria: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            weight: true,
            maxScore: true,
            orderIndex: true,
          },
        },
      },
    });
    if (!rubric) throw new NotFoundException('Active rubric not found');
    return rubric;
  }

  async listQuestions(instructorId: string, courseId: string, query: QuestionQueryDto = new QuestionQueryDto()) {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);
    const where: Prisma.QuestionWhereInput = {
      courseId,
      ...(query.search ? { content: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.skill ? { toeicSkill: query.skill } : {}),
      ...(query.responseType ? { responseType: query.responseType } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.usage === 'USED' ? { testQuestions: { some: {} } } : {}),
      ...(query.usage === 'UNUSED' ? { testQuestions: { none: {} } } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        select: instructorQuestionSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.question.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, usageCount: item._count.testQuestions, _count: undefined })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async questionImportTemplate(instructorId: string, courseId: string): Promise<Buffer> {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);
    const headers = ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'];
    const data: WriteSheetData = [
      headers.map((value) => ({ value, fontWeight: 'bold' })),
      ['READING', 'SINGLE_CHOICE', 'EASY', 'Choose the correct answer.', 'Project-authored explanation.', 'Option A', 'Option B', 'Option C', 'Option D', 'A', ''],
    ];
    return writeXlsxFile(data, { sheet: 'Questions', stickyRowsCount: 1 }).toBuffer();
  }

  async previewQuestionImport(instructorId: string, courseId: string, file?: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);
    if (!file) throw new BadRequestException('Vui lòng chọn tệp XLSX để kiểm tra.');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Tệp XLSX không được vượt quá 5 MB.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Chỉ hỗ trợ định dạng XLSX.');
    let sheet: ReadSheetData;
    try {
      sheet = await readSheet(file.buffer);
    } catch {
      throw new BadRequestException('Không thể đọc tệp XLSX.');
    }
    if (sheet.length === 0) throw new BadRequestException('Tệp XLSX không có trang dữ liệu.');
    const headers = sheet[0] ?? [];
    const expected = ['skill', 'type', 'difficulty', 'content', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'rubric_id'];
    if (expected.some((header, index) => String(headers[index] ?? '').trim().toLowerCase() !== header)) {
      throw new BadRequestException('Tiêu đề cột không đúng mẫu nhập câu hỏi.');
    }
    const logicalRows = sheet.slice(1)
      .map((values, index) => ({ rowNumber: index + 2, values }))
      .filter((row) => !row.values.every((value) => value === null || value === undefined || String(value).trim() === ''));
    if (logicalRows.length > 2000) throw new BadRequestException('Mỗi lần chỉ được nhập tối đa 2.000 câu hỏi.');
    const rows: Array<{ rowNumber: number; input: CreateQuestionDto | null; errors: string[]; warnings: string[] }> = [];
    for (const { rowNumber, values: sourceRow } of logicalRows) {
      const errors: string[] = [];
      const values = Array.from({ length: expected.length }, (_, columnIndex) => safeSpreadsheetText(sourceRow[columnIndex] ?? null));
      const [skill, type, difficulty, content, explanation, optionA, optionB, optionC, optionD, correctText, rubricId] = values;
      const correct = new Set(correctText.toUpperCase().split(/[;,\s]+/).filter(Boolean));
      const options = [optionA, optionB, optionC, optionD]
        .map((option, index) => ({ content: option.trim(), isCorrect: correct.has(String.fromCharCode(65 + index)) }))
        .filter((option) => option.content.length > 0);
      const input = {
        type: type.toUpperCase() as QuestionResponseType,
        toeicSkill: skill.toUpperCase() as ToeicSkill,
        difficulty: difficulty.toUpperCase() as QuestionDifficulty,
        content: content.trim(),
        explanation: explanation.trim() || null,
        rubricId: rubricId.trim() || null,
        options,
      } as CreateQuestionDto;
      try {
        this.normalizeAndValidateQuestion(input);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Dữ liệu câu hỏi không hợp lệ.');
      }
      rows.push({ rowNumber, input: errors.length === 0 ? input : null, errors, warnings: [] });
    }
    if (rows.length === 0) throw new BadRequestException('Tệp XLSX không có câu hỏi để nhập.');

    const rubricIds = [...new Set(rows.flatMap((row) => row.input?.rubricId ? [row.input.rubricId] : []))];
    const activeRubrics = rubricIds.length === 0 ? [] : await this.prisma.rubric.findMany({
      where: { id: { in: rubricIds }, isActive: true },
      select: { id: true },
    });
    const activeRubricIds = new Set(activeRubrics.map((rubric) => rubric.id));
    for (const row of rows) {
      if (row.input?.rubricId && !activeRubricIds.has(row.input.rubricId)) {
        row.errors.push('Rubric không tồn tại hoặc không còn hoạt động.');
        row.input = null;
      }
    }

    const importRowsByKey = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.input) continue;
      const key = questionImportKey(row.input);
      const matchingRows = importRowsByKey.get(key) ?? [];
      matchingRows.push(row);
      importRowsByKey.set(key, matchingRows);
    }
    for (const matchingRows of importRowsByKey.values()) {
      if (matchingRows.length < 2) continue;
      const rowNumbers = matchingRows.map((row) => row.rowNumber).join(', ');
      for (const row of matchingRows) row.warnings.push(`Nội dung trùng trong tệp tại các dòng ${rowNumbers}.`);
    }

    const validInputs = rows.flatMap((row) => row.input ? [row.input] : []);
    const existingQuestions = validInputs.length === 0 ? [] : await this.prisma.question.findMany({
      where: {
        courseId,
        toeicSkill: { in: [...new Set(validInputs.map((input) => input.toeicSkill))] },
        responseType: { in: [...new Set(validInputs.map((input) => input.type))] },
        content: { in: [...new Set(validInputs.map((input) => input.content))], mode: 'insensitive' },
      },
      select: { toeicSkill: true, responseType: true, content: true },
      distinct: ['toeicSkill', 'responseType', 'content'],
      take: 2000,
    });
    const existingKeys = new Set(existingQuestions.map((question) => questionImportKey({
      toeicSkill: question.toeicSkill,
      type: question.responseType,
      content: question.content,
    })));
    for (const row of rows) {
      if (row.input && existingKeys.has(questionImportKey(row.input))) {
        row.warnings.push('Nội dung trùng với câu hỏi hiện có trong ngân hàng.');
      }
    }

    const warningCount = rows.reduce((count, row) => count + row.warnings.length, 0);
    return {
      rows,
      summary: { total: rows.length, valid: rows.filter((row) => row.errors.length === 0).length, invalid: rows.filter((row) => row.errors.length > 0).length, warnings: warningCount },
      canConfirm: rows.every((row) => row.errors.length === 0),
    };
  }

  async confirmQuestionImport(instructorId: string, courseId: string, dto: ConfirmQuestionImportDto) {
    const normalized = dto.rows.map((row) => this.normalizeAndValidateQuestion(row));
    return this.prisma.$transaction(async (transaction) => {
      await this.assertInstructorOwnsCourse(transaction, instructorId, courseId);
      for (const row of normalized) await this.assertRubricRule(transaction, row.toeicSkill, row.rubricId);
      const questionIds: string[] = [];
      for (const row of normalized) {
        const created = await transaction.question.create({
          data: {
            courseId,
            responseType: row.responseType,
            toeicSkill: row.toeicSkill,
            difficulty: row.difficulty,
            content: row.content,
            explanation: row.explanation,
            rubricId: row.rubricId,
            options: { create: row.options.map((option, orderIndex) => ({ ...option, orderIndex })) },
          },
          select: { id: true },
        });
        questionIds.push(created.id);
      }
      return { importedCount: questionIds.length, questionIds };
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
        await this.assertRubricRule(transaction, input.toeicSkill, input.rubricId);

        return transaction.question.create({
          data: {
            courseId,
            responseType: input.responseType,
            toeicSkill: input.toeicSkill,
            difficulty: input.difficulty,
            content: input.content,
            explanation: input.explanation,
            rubricId: input.rubricId,
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
      const publishedTestReferences = await transaction.testQuestion.findMany({
        where: {
          questionId,
          test: { status: TestStatus.PUBLISHED },
        },
        select: { testId: true },
      });

      const input = this.normalizeAndValidateQuestion({
        type: dto.type ?? question.responseType,
        toeicSkill: dto.toeicSkill ?? question.toeicSkill,
        difficulty: dto.difficulty ?? question.difficulty,
        content: dto.content ?? question.content,
        explanation: dto.explanation !== undefined ? dto.explanation : question.explanation,
        rubricId: dto.rubricId !== undefined ? dto.rubricId : question.rubricId,
        options: dto.options ?? question.options.map((option) => ({
            content: option.content,
            isCorrect: option.isCorrect,
          })),
      });
      await this.assertRubricRule(transaction, input.toeicSkill, input.rubricId);
      await transaction.questionOption.deleteMany({ where: { questionId } });

      const updatedQuestion = await transaction.question.update({
        where: { id: questionId },
        data: {
          responseType: input.responseType,
          toeicSkill: input.toeicSkill,
          difficulty: input.difficulty,
          content: input.content,
          explanation: input.explanation,
          rubricId: input.rubricId,
          options: { create: input.options.map((option, orderIndex) => ({ ...option, orderIndex })) },
        },
        select: instructorQuestionSelect,
      });

      for (const referencedTestId of new Set(
        publishedTestReferences.map((reference) => reference.testId),
      )) {
        await this.validatePublishableTest(transaction, referencedTestId);
      }

      return updatedQuestion;
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
      purpose: dto.type,
      placementMode: dto.placementMode ?? null,
      title: dto.title,
      description: dto.description ?? null,
      lessonId: dto.lessonId ?? null,
      maxAttempts: dto.maxAttempts ?? 1,
      showResultAfterSubmit: dto.showResultAfterSubmit ?? true,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertInstructorOwnsCourse(transaction, instructorId, courseId);
        await this.validateTestLessonRule(
          transaction,
          courseId,
          input.purpose,
          input.lessonId,
          false,
        );

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
          purpose: dto.type ?? test.purpose,
          placementMode: dto.placementMode !== undefined ? dto.placementMode : test.placementMode,
          title: dto.title ?? test.title,
          description: dto.description !== undefined ? dto.description : test.description,
          lessonId: dto.lessonId !== undefined ? dto.lessonId : test.lessonId,
          maxAttempts: dto.maxAttempts ?? test.maxAttempts,
          showResultAfterSubmit: dto.showResultAfterSubmit ?? test.showResultAfterSubmit,
        });
        const lockedFieldChanges =
          input.purpose !== test.purpose ||
          input.lessonId !== test.lessonId ||
          input.maxAttempts !== test.maxAttempts;
        if (lockedFieldChanges) {
          await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        }
        await this.validateTestLessonRule(
          transaction,
          test.courseId,
          input.purpose,
          input.lessonId,
          test.status === TestStatus.PUBLISHED,
        );

        const updated = await transaction.test.update({
          where: { id: testId },
          data: input,
          select: instructorTestDetailSelect,
        });
        await this.revalidatePublishedTest(transaction, testId, test.status);
        return updated;
      },
      'Test changed concurrently; please try again',
      'Test references changed concurrently; please try again',
    );
  }

  async deleteTest(instructorId: string, testId: string): Promise<{ message: string }> {
    const storageKeys = await this.runSerializableMutation(
      async (transaction) => {
        const test = await transaction.test.findUnique({
          where: { id: testId },
          select: {
            courseId: true,
            questionGroups: { select: { stimuli: { select: { storageKey: true } } } },
          },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        await transaction.testQuestion.deleteMany({ where: { testId } });
        await transaction.test.delete({ where: { id: testId } });
        return test.questionGroups.flatMap((group) =>
          group.stimuli.flatMap((stimulus) => stimulus.storageKey ? [stimulus.storageKey] : []),
        );
      },
      'Test changed concurrently; please try again',
      'Test cannot be deleted because attempt history exists',
    );

    await Promise.all(storageKeys.map((key) => this.stimulusStorage.delete(key).catch(() => undefined)));

    return { message: 'Test deleted successfully' };
  }

  /** Validates the complete published-test invariant without changing state. */
  async validatePublishableTest(database: PrismaService | Prisma.TransactionClient, testId: string) {
    const test = await database.test.findUnique({
      where: { id: testId },
      select: {
        ...instructorTestSelect,
        testQuestions: { orderBy: { orderIndex: 'asc' }, select: { id: true, groupId: true, orderIndex: true, points: true, question: { select: { courseId: true, responseType: true, toeicSkill: true, difficulty: true, content: true, explanation: true, rubricId: true, rubric: { select: { isActive: true } }, options: { orderBy: { orderIndex: 'asc' }, select: { content: true, isCorrect: true } } } } } },
        questionGroups: { orderBy: { orderIndex: 'asc' }, select: { id: true, skill: true, orderIndex: true, preparationSeconds: true, responseSeconds: true, recommendedSeconds: true, maxRecordingSeconds: true, stimuli: { orderBy: { orderIndex: 'asc' } }, testQuestions: { select: { id: true } } } },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    await this.validateTestLessonRule(database, test.courseId, test.purpose, test.lessonId, true);
    if (test.maxAttempts < 1) throw new BadRequestException('maxAttempts must be at least 1');
    if (test.testQuestions.length === 0) throw new BadRequestException('Test must contain at least one question before publishing');
    for (const [index, item] of test.testQuestions.entries()) {
      if (item.orderIndex !== index) throw new BadRequestException('TestQuestion order must be contiguous before publishing');
      if (item.points < 1) throw new BadRequestException('Every TestQuestion must have positive points');
      if (item.question.courseId !== test.courseId) throw new BadRequestException('Every Question must belong to the Test course');
      this.normalizeAndValidateQuestion({ type: item.question.responseType, toeicSkill: item.question.toeicSkill, difficulty: item.question.difficulty, content: item.question.content, explanation: item.question.explanation, rubricId: item.question.rubricId, options: item.question.options });
      if (([ToeicSkill.SPEAKING, ToeicSkill.WRITING] as ToeicSkill[]).includes(item.question.toeicSkill) && !item.question.rubric?.isActive) {
        throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `questions.${item.id}.rubricId`, message: 'Câu Speaking/Writing cần rubric đang hoạt động.' });
      }
    }
    if (new Set(test.testQuestions.map((item) => item.question.toeicSkill)).size > 1 && test.questionGroups.length === 0) {
      throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: 'groups', message: 'Đề kiểm tra nhiều kỹ năng cần ít nhất một phần thi.' });
    }
    if (test.questionGroups.length > 0) {
      for (const [index, group] of test.questionGroups.entries()) {
        if (group.orderIndex !== index) throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.orderIndex`, message: 'Thứ tự phần thi phải liên tục.' });
        if (group.testQuestions.length === 0) throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.questions`, message: 'Mỗi phần thi phải có ít nhất một câu hỏi.' });
        if (test.testQuestions.some((item) => item.groupId === group.id && item.question.toeicSkill !== group.skill)) throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.questions`, message: 'Kỹ năng câu hỏi không khớp kỹ năng phần thi.' });
        for (const stimulus of group.stimuli) if (stimulus.storageKey && !(await this.stimulusStorage.exists(stimulus.storageKey))) throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.stimuli.${stimulus.id}`, message: 'Tệp ngữ liệu không khả dụng.' });
      }
      const ungrouped = test.testQuestions.find((item) => !item.groupId);
      if (ungrouped) throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `questions.${ungrouped.id}.groupId`, message: 'Câu hỏi cần thuộc một phần thi trước khi xuất bản.' });
    }
    return test;
  }

  private async revalidatePublishedTest(database: Prisma.TransactionClient, testId: string, status: TestStatus) {
    if (status === TestStatus.PUBLISHED) await this.validatePublishableTest(database, testId);
  }

  async publishTest(instructorId: string, testId: string) {
    return this.runSerializableMutation(async (transaction) => {
      await this.validatePublishableTest(transaction, testId);
      const test = await transaction.test.findUnique({
        where: { id: testId },
        select: {
          ...instructorTestSelect,
          testQuestions: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              groupId: true,
              orderIndex: true,
              points: true,
              question: {
                select: {
                  courseId: true,
                  responseType: true,
                  toeicSkill: true,
                  difficulty: true,
                  content: true,
                  explanation: true,
                  rubricId: true,
                  rubric: { select: { isActive: true } },
                  options: {
                    orderBy: { orderIndex: 'asc' },
                    select: { content: true, isCorrect: true },
                  },
                },
              },
            },
          },
          questionGroups: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              skill: true,
              orderIndex: true,
              preparationSeconds: true,
              responseSeconds: true,
              recommendedSeconds: true,
              maxRecordingSeconds: true,
              stimuli: { orderBy: { orderIndex: 'asc' } },
              testQuestions: { select: { id: true } },
            },
          },
        },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.validateTestLessonRule(
        transaction,
        test.courseId,
        test.purpose,
        test.lessonId,
        true,
      );
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
          type: testQuestion.question.responseType,
          toeicSkill: testQuestion.question.toeicSkill,
          difficulty: testQuestion.question.difficulty,
          content: testQuestion.question.content,
          explanation: testQuestion.question.explanation,
          rubricId: testQuestion.question.rubricId,
          options: testQuestion.question.options,
        });
        if (
          ([ToeicSkill.SPEAKING, ToeicSkill.WRITING] as ToeicSkill[]).includes(testQuestion.question.toeicSkill) &&
          !testQuestion.question.rubric?.isActive
        ) {
          throw new BadRequestException({
            code: 'PUBLISH_VALIDATION_FAILED',
            field: `questions.${testQuestion.id}.rubricId`,
            message: 'Câu Speaking/Writing cần rubric đang hoạt động.',
          });
        }
      }

      if (new Set(test.testQuestions.map((item) => item.question.toeicSkill)).size > 1 && test.questionGroups.length === 0) {
        throw new BadRequestException({
          code: 'PUBLISH_VALIDATION_FAILED', field: 'groups',
          message: 'Đề kiểm tra nhiều kỹ năng cần ít nhất một phần thi.',
        });
      }

      if (test.questionGroups.length > 0) {
        for (const [groupIndex, group] of test.questionGroups.entries()) {
          if (group.orderIndex !== groupIndex) {
            throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.orderIndex`, message: 'Thứ tự phần thi phải liên tục.' });
          }
          if (group.testQuestions.length === 0) {
            throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.questions`, message: 'Mỗi phần thi phải có ít nhất một câu hỏi.' });
          }
          const incompatible = test.testQuestions.find((item) => item.groupId === group.id && item.question.toeicSkill !== group.skill);
          if (incompatible) {
            throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.questions`, message: 'Kỹ năng câu hỏi không khớp kỹ năng phần thi.' });
          }
          for (const stimulus of group.stimuli) {
            if (stimulus.storageKey && !(await this.stimulusStorage.exists(stimulus.storageKey))) {
              throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `groups.${group.id}.stimuli.${stimulus.id}`, message: 'Tệp ngữ liệu không khả dụng.' });
            }
          }
        }
        const ungrouped = test.testQuestions.find((item) => !item.groupId);
        if (ungrouped) {
          throw new BadRequestException({ code: 'PUBLISH_VALIDATION_FAILED', field: `questions.${ungrouped.id}.groupId`, message: 'Câu hỏi cần thuộc một phần thi trước khi xuất bản.' });
        }
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
          select: { courseId: true, status: true },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);

        const question = await transaction.question.findFirst({
          where: { id: dto.questionId, courseId: test.courseId },
          select: { id: true, toeicSkill: true },
        });
        if (!question) {
          throw new NotFoundException('Question not found');
        }
        if (dto.groupId) {
          const group = await transaction.testQuestionGroup.findFirst({
            where: { id: dto.groupId, testId },
            select: { skill: true },
          });
          if (!group) throw new NotFoundException('Test question group not found');
          if (group.skill !== question.toeicSkill) {
            throw new BadRequestException('Question skill must match its group skill');
          }
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

        const created = await transaction.testQuestion.create({
          data: {
            testId,
            questionId: dto.questionId,
            ...(dto.groupId ? { groupId: dto.groupId } : {}),
            points: dto.points ?? 1,
            orderIndex: lastQuestion ? lastQuestion.orderIndex + 1 : 0,
          },
          select: instructorTestQuestionSelect,
        });
        await this.revalidatePublishedTest(transaction, testId, test.status);
        return created;
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
        select: { courseId: true, status: true },
      });
      if (!test) {
        throw new NotFoundException('Test not found');
      }

      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.assertTestHasNoHistoricalAttempts(transaction, testId);
      await this.requireNestedTestQuestion(transaction, testId, testQuestionId);

      const updated = await transaction.testQuestion.update({
        where: { id: testQuestionId },
        data: { points: dto.points },
        select: instructorTestQuestionSelect,
      });
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return updated;
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
          select: { courseId: true, status: true },
        });
        if (!test) {
          throw new NotFoundException('Test not found');
        }

        await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
        await this.assertTestHasNoHistoricalAttempts(transaction, testId);
        await this.requireNestedTestQuestion(transaction, testId, testQuestionId);
        await transaction.testQuestion.delete({ where: { id: testQuestionId } });
        await this.reindexTestQuestions(transaction, testId);
        await this.revalidatePublishedTest(transaction, testId, test.status);
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
        select: { courseId: true, status: true },
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
      await this.revalidatePublishedTest(transaction, testId, test.status);

      return transaction.testQuestion.findMany({
        where: { testId },
        orderBy: { orderIndex: 'asc' },
        select: instructorTestQuestionSelect,
      });
    }, 'Test question order changed concurrently; please try again');
  }

  async moveTestQuestionGroup(instructorId: string, testId: string, testQuestionId: string, groupId: string | null) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await transaction.test.findUnique({ where: { id: testId }, select: { courseId: true, status: true } });
      if (!test) throw new NotFoundException('Test not found');
      await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
      await this.assertTestHasNoHistoricalAttempts(transaction, testId);
      const testQuestion = await transaction.testQuestion.findFirst({
        where: { id: testQuestionId, testId }, select: { id: true, question: { select: { toeicSkill: true } } },
      });
      if (!testQuestion) throw new NotFoundException('Test question not found');
      if (groupId) {
        const group = await transaction.testQuestionGroup.findFirst({ where: { id: groupId, testId }, select: { skill: true } });
        if (!group) throw new NotFoundException('Test question group not found');
        if (group.skill !== testQuestion.question.toeicSkill) throw new BadRequestException('Question skill must match its group skill');
      }
      const updated = await transaction.testQuestion.update({
        where: { id: testQuestionId }, data: { groupId }, select: instructorTestQuestionSelect,
      });
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return updated;
    }, 'Test question group changed concurrently; please try again');
  }

  async createTestGroup(instructorId: string, testId: string, dto: CreateTestGroupDto) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      const last = await transaction.testQuestionGroup.findFirst({
        where: { testId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true },
      });
      const created = await transaction.testQuestionGroup.create({
        data: {
          testId,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          ...this.normalizeGroup(dto),
        },
        include: { stimuli: true, testQuestions: true },
      });
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return created;
    }, 'Nhóm câu hỏi đang được cập nhật ở phiên khác. Vui lòng thử lại.');
  }

  async updateTestGroup(
    instructorId: string,
    testId: string,
    groupId: string,
    dto: UpdateTestGroupDto,
  ) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      const group = await transaction.testQuestionGroup.findFirst({
        where: { id: groupId, testId },
        select: { id: true, skill: true, testQuestions: { select: { question: { select: { toeicSkill: true } } } } },
      });
      if (!group) throw new NotFoundException('Test question group not found');
      if (group.testQuestions.some((item) => item.question.toeicSkill !== dto.skill)) {
        throw new BadRequestException('Hãy di chuyển câu hỏi không tương thích trước khi đổi kỹ năng nhóm.');
      }
      const updated = await transaction.testQuestionGroup.update({
        where: { id: groupId },
        data: this.normalizeGroup(dto),
        include: { stimuli: { orderBy: { orderIndex: 'asc' } }, testQuestions: { orderBy: { orderIndex: 'asc' } } },
      });
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return updated;
    }, 'Nhóm câu hỏi đang được cập nhật ở phiên khác. Vui lòng thử lại.');
  }

  async deleteTestGroup(instructorId: string, testId: string, groupId: string) {
    const mediaKeys: string[] = [];
    await this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      const group = await transaction.testQuestionGroup.findFirst({
        where: { id: groupId, testId },
        select: { stimuli: { select: { storageKey: true } } },
      });
      if (!group) throw new NotFoundException('Test question group not found');
      mediaKeys.push(...group.stimuli.flatMap((item) => item.storageKey ? [item.storageKey] : []));
      await transaction.testQuestionGroup.delete({ where: { id: groupId } });
      await this.reindexTestGroups(transaction, testId);
      await this.revalidatePublishedTest(transaction, testId, test.status);
    }, 'Nhóm câu hỏi đang được cập nhật ở phiên khác. Vui lòng thử lại.');
    await Promise.all(mediaKeys.map((key) => this.stimulusStorage.delete(key).catch(() => undefined)));
    return { message: 'Test question group deleted successfully' };
  }

  async reorderTestGroups(instructorId: string, testId: string, dto: ReorderTestGroupsDto) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      const existing = await transaction.testQuestionGroup.findMany({ where: { testId }, select: { id: true } });
      this.validateCompleteTestQuestionOrder(existing.map(({ id }) => id), dto.orderedGroupIds);
      for (const [index, id] of dto.orderedGroupIds.entries()) {
        await transaction.testQuestionGroup.update({ where: { id }, data: { orderIndex: -(index + 1) } });
      }
      for (const [index, id] of dto.orderedGroupIds.entries()) {
        await transaction.testQuestionGroup.update({ where: { id }, data: { orderIndex: index } });
      }
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return transaction.testQuestionGroup.findMany({
        where: { testId },
        orderBy: { orderIndex: 'asc' },
        include: {
          stimuli: { orderBy: { orderIndex: 'asc' } },
          testQuestions: { orderBy: { orderIndex: 'asc' } },
        },
      });
    }, 'Thứ tự nhóm đang được cập nhật ở phiên khác. Vui lòng thử lại.');
  }

  async createTextStimulus(
    instructorId: string,
    testId: string,
    groupId: string,
    dto: CreateTextStimulusDto,
  ) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      await this.requireNestedGroup(transaction, testId, groupId);
      const last = await transaction.assessmentStimulus.findFirst({
        where: { groupId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true },
      });
      const textContent = dto.textContent.trim();
      if (!textContent) throw new BadRequestException('Nội dung ngữ liệu không được để trống.');
      const created = await transaction.assessmentStimulus.create({
        data: {
          groupId,
          type: AssessmentStimulusType.TEXT,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          textContent,
          altText: dto.altText?.trim() || null,
          isProtected: false,
        },
      });
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return created;
    }, 'Stimulus đang được cập nhật ở phiên khác. Vui lòng thử lại.');
  }

  async uploadStimulus(
    instructorId: string,
    testId: string,
    groupId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    altText?: string,
  ) {
    const media = this.validateStimulusFile(file);
    const key = await this.stimulusStorage.put(file.buffer, media.extension);
    try {
      return await this.runSerializableMutation(async (transaction) => {
        const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
        await this.requireNestedGroup(transaction, testId, groupId);
        const last = await transaction.assessmentStimulus.findFirst({
          where: { groupId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true },
        });
        const created = await transaction.assessmentStimulus.create({
          data: {
            groupId,
            type: media.type,
            orderIndex: (last?.orderIndex ?? -1) + 1,
            storageKey: key,
            mimeType: media.mimeType,
            altText: altText?.trim() || null,
            isProtected: true,
          },
        });
        await this.revalidatePublishedTest(transaction, testId, test.status);
        return created;
      }, 'Stimulus đang được cập nhật ở phiên khác. Vui lòng thử lại.');
    } catch (error) {
      await this.stimulusStorage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async deleteStimulus(instructorId: string, testId: string, groupId: string, stimulusId: string) {
    let storageKey: string | null = null;
    await this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      await this.requireNestedGroup(transaction, testId, groupId);
      const stimulus = await transaction.assessmentStimulus.findFirst({ where: { id: stimulusId, groupId } });
      if (!stimulus) throw new NotFoundException('Assessment stimulus not found');
      storageKey = stimulus.storageKey;
      await transaction.assessmentStimulus.delete({ where: { id: stimulusId } });
      await this.reindexStimuli(transaction, groupId);
      await this.revalidatePublishedTest(transaction, testId, test.status);
    }, 'Stimulus đang được cập nhật ở phiên khác. Vui lòng thử lại.');
    if (storageKey) await this.stimulusStorage.delete(storageKey).catch(() => undefined);
    return { message: 'Assessment stimulus deleted successfully' };
  }

  async reorderStimuli(instructorId: string, testId: string, groupId: string, dto: ReorderStimuliDto) {
    return this.runSerializableMutation(async (transaction) => {
      const test = await this.requireMutableOwnedTest(transaction, instructorId, testId);
      await this.requireNestedGroup(transaction, testId, groupId);
      const existing = await transaction.assessmentStimulus.findMany({ where: { groupId }, select: { id: true } });
      this.validateCompleteTestQuestionOrder(existing.map(({ id }) => id), dto.orderedStimulusIds);
      for (const [index, id] of dto.orderedStimulusIds.entries()) {
        await transaction.assessmentStimulus.update({ where: { id }, data: { orderIndex: -(index + 1) } });
      }
      for (const [index, id] of dto.orderedStimulusIds.entries()) {
        await transaction.assessmentStimulus.update({ where: { id }, data: { orderIndex: index } });
      }
      await this.revalidatePublishedTest(transaction, testId, test.status);
      return transaction.assessmentStimulus.findMany({ where: { groupId }, orderBy: { orderIndex: 'asc' } });
    }, 'Thứ tự ngữ liệu đang được cập nhật ở phiên khác. Vui lòng thử lại.');
  }

  private normalizeGroup(dto: CreateTestGroupDto | UpdateTestGroupDto) {
    return {
      skill: dto.skill,
      title: dto.title?.trim() || null,
      instructions: dto.instructions?.trim() || null,
      preparationSeconds: dto.preparationSeconds ?? null,
      responseSeconds: dto.responseSeconds ?? null,
      recommendedSeconds: dto.recommendedSeconds ?? null,
      maxRecordingSeconds: dto.maxRecordingSeconds ?? null,
    };
  }

  private validateStimulusFile(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    const image = new Map([
      ['image/jpeg', { extension: 'jpg', type: AssessmentStimulusType.IMAGE, valid: file.buffer[0] === 0xff && file.buffer[1] === 0xd8 }],
      ['image/png', { extension: 'png', type: AssessmentStimulusType.IMAGE, valid: file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
      ['image/webp', { extension: 'webp', type: AssessmentStimulusType.IMAGE, valid: file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP' }],
    ]);
    const audio = new Map([
      ['audio/mpeg', { extension: 'mp3', type: AssessmentStimulusType.AUDIO, valid: file.buffer.subarray(0, 3).toString() === 'ID3' || (file.buffer[0] === 0xff && (file.buffer[1] & 0xe0) === 0xe0) }],
      ['audio/mp4', { extension: 'm4a', type: AssessmentStimulusType.AUDIO, valid: file.buffer.subarray(4, 8).toString() === 'ftyp' }],
      ['audio/ogg', { extension: 'ogg', type: AssessmentStimulusType.AUDIO, valid: file.buffer.subarray(0, 4).toString() === 'OggS' }],
      ['audio/webm', { extension: 'webm', type: AssessmentStimulusType.AUDIO, valid: file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) }],
    ]);
    const rule = image.get(file.mimetype) ?? audio.get(file.mimetype);
    if (!rule || !rule.valid) throw new BadRequestException('Định dạng hoặc nội dung tệp ngữ liệu không hợp lệ.');
    const limit = rule.type === AssessmentStimulusType.IMAGE ? 5 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > limit) throw new BadRequestException('Tệp ngữ liệu vượt quá dung lượng cho phép.');
    return { ...rule, mimeType: file.mimetype };
  }

  private async requireMutableOwnedTest(
    transaction: Prisma.TransactionClient,
    instructorId: string,
    testId: string,
  ) {
    const test = await transaction.test.findUnique({ where: { id: testId }, select: { id: true, courseId: true, status: true } });
    if (!test) throw new NotFoundException('Test not found');
    await this.assertInstructorOwnsCourse(transaction, instructorId, test.courseId);
    await this.assertTestHasNoHistoricalAttempts(transaction, testId);
    return test;
  }

  private async requireNestedGroup(transaction: Prisma.TransactionClient, testId: string, groupId: string) {
    const group = await transaction.testQuestionGroup.findFirst({ where: { id: groupId, testId }, select: { id: true } });
    if (!group) throw new NotFoundException('Test question group not found');
    return group;
  }

  private async reindexTestGroups(transaction: Prisma.TransactionClient, testId: string) {
    const rows = await transaction.testQuestionGroup.findMany({ where: { testId }, orderBy: { orderIndex: 'asc' }, select: { id: true } });
    for (const [index, row] of rows.entries()) await transaction.testQuestionGroup.update({ where: { id: row.id }, data: { orderIndex: index } });
  }

  private async reindexStimuli(transaction: Prisma.TransactionClient, groupId: string) {
    const rows = await transaction.assessmentStimulus.findMany({ where: { groupId }, orderBy: { orderIndex: 'asc' }, select: { id: true } });
    for (const [index, row] of rows.entries()) await transaction.assessmentStimulus.update({ where: { id: row.id }, data: { orderIndex: index } });
  }

  private async assertInstructorOwnsCourse(
    database: PrismaService | Prisma.TransactionClient,
    instructorId: string,
    courseId: string | null,
  ): Promise<void> {
    if (!courseId) {
      throw new NotFoundException('Course-scoped assessment not found');
    }

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
    courseId: string | null,
    purpose: TestPurpose,
    lessonId: string | null,
    publishing: boolean,
  ): Promise<void> {
    if (purpose === TestPurpose.PLACEMENT) {
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
    if (!courseId) {
      throw new BadRequestException('A lesson-scoped test must reference a Course');
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
      placementMode:
        input.purpose === TestPurpose.PLACEMENT ? (input.placementMode ?? PlacementMode.LR) : null,
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
    type: QuestionResponseType;
    toeicSkill: ToeicSkill;
    difficulty: QuestionDifficulty;
    content: string;
    explanation?: string | null;
    options?: QuestionOptionInputDto[];
    rubricId?: string | null;
  }): NormalizedQuestionInput {
    const content = input.content.trim();
    const explanation = input.explanation?.trim() || null;
    const options = (input.options ?? []).map((option) => ({
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

    const objective = input.toeicSkill === ToeicSkill.LISTENING || input.toeicSkill === ToeicSkill.READING;
    const objectiveTypes: QuestionResponseType[] = [
      QuestionResponseType.SINGLE_CHOICE,
      QuestionResponseType.MULTIPLE_CHOICE,
      QuestionResponseType.TRUE_FALSE,
    ];
    const compatible = objective
      ? objectiveTypes.includes(input.type)
      : input.toeicSkill === ToeicSkill.SPEAKING
        ? input.type === QuestionResponseType.AUDIO_RESPONSE
        : input.toeicSkill === ToeicSkill.WRITING && input.type === QuestionResponseType.TEXT_RESPONSE;
    if (!compatible) throw new BadRequestException('Kỹ năng và loại câu trả lời không tương thích.');
    if (!objective) {
      if (options.length > 0) throw new BadRequestException('Câu Speaking/Writing không được có phương án lựa chọn.');
      if (!input.rubricId) throw new BadRequestException('Câu Speaking/Writing cần rubric chấm điểm.');
      return {
        responseType: input.type, toeicSkill: input.toeicSkill, difficulty: input.difficulty,
        content, explanation, rubricId: input.rubricId, options: [],
      };
    }
    if (input.rubricId) throw new BadRequestException('Câu Listening/Reading không sử dụng rubric.');
    const correctCount = options.filter((option) => option.isCorrect).length;
    switch (input.type) {
      case QuestionResponseType.SINGLE_CHOICE:
        if (options.length < 2 || correctCount !== 1) {
          throw new BadRequestException(
            'SINGLE_CHOICE requires at least two options and exactly one correct option',
          );
        }
        break;
      case QuestionResponseType.TRUE_FALSE:
        if (options.length !== 2 || correctCount !== 1) {
          throw new BadRequestException(
            'TRUE_FALSE requires exactly two options and exactly one correct option',
          );
        }
        break;
      case QuestionResponseType.MULTIPLE_CHOICE:
        if (options.length < 2 || correctCount < 1) {
          throw new BadRequestException(
            'MULTIPLE_CHOICE requires at least two options and at least one correct option',
          );
        }
        break;
      default: throw new BadRequestException('Unsupported question type');
    }

    return {
      responseType: input.type,
      toeicSkill: input.toeicSkill,
      difficulty: input.difficulty,
      content,
      explanation,
      rubricId: null,
      options,
    };
  }

  private async assertRubricRule(database: Prisma.TransactionClient, skill: ToeicSkill, rubricId: string | null): Promise<void> {
    if (skill !== ToeicSkill.SPEAKING && skill !== ToeicSkill.WRITING) return;
    const rubric = rubricId ? await database.rubric.findFirst({ where: { id: rubricId, isActive: true }, select: { id: true } }) : null;
    if (!rubric) throw new BadRequestException('Rubric không tồn tại hoặc không còn hoạt động.');
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
