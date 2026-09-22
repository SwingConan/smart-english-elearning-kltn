import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { ReplacePrerequisitesDto } from './dto/replace-prerequisites.dto';
import { ReplaceSkillMappingsDto } from './dto/replace-skill-mappings.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

const MAX_KNOWLEDGE_TRANSACTION_ATTEMPTS = 3;
const DEFAULT_BKT = {
  pInit: 0.5,
  pLearn: 0.1,
  pGuess: 0.2,
  pSlip: 0.1,
} as const;

const instructorSkillSelect = {
  id: true,
  courseId: true,
  code: true,
  name: true,
  description: true,
  pInit: true,
  pLearn: true,
  pGuess: true,
  pSlip: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SkillSelect;

type Database = PrismaService | Prisma.TransactionClient;
interface BktParameters {
  pInit: number;
  pLearn: number;
  pGuess: number;
  pSlip: number;
}

@Injectable()
export class KnowledgeModelInstructorService {
  constructor(private readonly prisma: PrismaService) {}

  async listSkills(instructorId: string, courseId: string) {
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, courseId);
    return this.prisma.skill.findMany({
      where: { courseId },
      select: instructorSkillSelect,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  async createSkill(instructorId: string, courseId: string, dto: CreateSkillDto) {
    const input = this.normalizeCreateInput(dto);
    this.validateBkt({
      pInit: input.pInit,
      pLearn: input.pLearn,
      pGuess: input.pGuess,
      pSlip: input.pSlip,
    });

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertInstructorOwnsCourse(transaction, instructorId, courseId);
        return transaction.skill.create({
          data: { courseId, ...input },
          select: instructorSkillSelect,
        });
      });
    } catch (error: unknown) {
      this.rethrowMutationError(error, 'A Skill with this code already exists in the Course');
    }
  }

  async updateSkill(instructorId: string, skillId: string, dto: UpdateSkillDto) {
    return this.runSerializableMutation(
      async (transaction) => {
        const skill = await transaction.skill.findUnique({
          where: { id: skillId },
          select: instructorSkillSelect,
        });
        if (!skill) throw new NotFoundException('Skill not found');
        await this.assertInstructorOwnsCourse(transaction, instructorId, skill.courseId);

        const effectiveBkt = {
          pInit: dto.pInit ?? skill.pInit,
          pLearn: dto.pLearn ?? skill.pLearn,
          pGuess: dto.pGuess ?? skill.pGuess,
          pSlip: dto.pSlip ?? skill.pSlip,
        };
        this.validateBkt(effectiveBkt);

        const bktChanged =
          effectiveBkt.pInit !== skill.pInit ||
          effectiveBkt.pLearn !== skill.pLearn ||
          effectiveBkt.pGuess !== skill.pGuess ||
          effectiveBkt.pSlip !== skill.pSlip;
        if (bktChanged) {
          const historyExists = await transaction.masteryHistory.findFirst({
            where: { skillId },
            select: { id: true },
          });
          if (historyExists) {
            throw new ConflictException(
              'BKT parameters cannot change after mastery history exists for this Skill',
            );
          }
        }

        const data: {
          code?: string;
          name?: string;
          description?: string | null;
          pInit?: number;
          pLearn?: number;
          pGuess?: number;
          pSlip?: number;
        } = {};
        if (dto.code !== undefined) data.code = this.requireTrimmed(dto.code, 'Skill code');
        if (dto.name !== undefined) data.name = this.requireTrimmed(dto.name, 'Skill name');
        if (dto.description !== undefined) data.description = dto.description?.trim() || null;
        if (dto.pInit !== undefined) data.pInit = dto.pInit;
        if (dto.pLearn !== undefined) data.pLearn = dto.pLearn;
        if (dto.pGuess !== undefined) data.pGuess = dto.pGuess;
        if (dto.pSlip !== undefined) data.pSlip = dto.pSlip;

        if (Object.keys(data).length === 0) return skill;
        return transaction.skill.update({
          where: { id: skillId },
          data,
          select: instructorSkillSelect,
        });
      },
      'Skill changed concurrently; please try again',
      'A Skill with this code already exists in the Course',
    );
  }

  async deleteSkill(instructorId: string, skillId: string): Promise<{ message: string }> {
    await this.runSerializableMutation(
      async (transaction) => {
        const skill = await transaction.skill.findUnique({
          where: { id: skillId },
          select: { courseId: true },
        });
        if (!skill) throw new NotFoundException('Skill not found');
        await this.assertInstructorOwnsCourse(transaction, instructorId, skill.courseId);

        const [questionMappings, lessonMappings, prerequisiteEdges, learnerStates, history] =
          await Promise.all([
            transaction.questionSkill.count({ where: { skillId } }),
            transaction.lessonSkill.count({ where: { skillId } }),
            transaction.skillPrerequisite.count({
              where: { OR: [{ skillId }, { prerequisiteSkillId: skillId }] },
            }),
            transaction.learnerSkillState.count({ where: { skillId } }),
            transaction.masteryHistory.count({ where: { skillId } }),
          ]);
        if (questionMappings + lessonMappings + prerequisiteEdges + learnerStates + history > 0) {
          throw new ConflictException('Skill cannot be deleted while it is referenced');
        }
        await transaction.skill.delete({ where: { id: skillId } });
      },
      'Skill changed concurrently; please try again',
      'Skill cannot be deleted while it is referenced',
    );

    return { message: 'Skill deleted successfully' };
  }

  async listPrerequisites(instructorId: string, skillId: string) {
    const skill = await this.requireSkill(this.prisma, skillId);
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, skill.courseId);
    return this.findPrerequisiteSkills(this.prisma, skillId);
  }

  async replacePrerequisites(instructorId: string, skillId: string, dto: ReplacePrerequisitesDto) {
    this.assertUniqueIds(dto.prerequisiteSkillIds, 'prerequisiteSkillIds');
    if (dto.prerequisiteSkillIds.includes(skillId)) {
      throw new BadRequestException('A Skill cannot require itself');
    }

    return this.runSerializableMutation(
      async (transaction) => {
        const skill = await this.requireSkill(transaction, skillId);
        await this.assertInstructorOwnsCourse(transaction, instructorId, skill.courseId);
        await this.requireSkillsInCourse(transaction, dto.prerequisiteSkillIds, skill.courseId);

        const courseEdges = await transaction.skillPrerequisite.findMany({
          where: { skill: { courseId: skill.courseId } },
          select: { skillId: true, prerequisiteSkillId: true },
        });
        const resultingEdges = [
          ...courseEdges.filter((edge) => edge.skillId !== skillId),
          ...dto.prerequisiteSkillIds.map((prerequisiteSkillId) => ({
            skillId,
            prerequisiteSkillId,
          })),
        ];
        if (this.hasCycle(resultingEdges)) {
          throw new BadRequestException('Skill prerequisite graph must remain acyclic');
        }

        const current = await transaction.skillPrerequisite.findMany({
          where: { skillId },
          select: { id: true, prerequisiteSkillId: true },
        });
        const requested = new Set(dto.prerequisiteSkillIds);
        const existing = new Set(current.map((edge) => edge.prerequisiteSkillId));
        const removedIds = current
          .filter((edge) => !requested.has(edge.prerequisiteSkillId))
          .map((edge) => edge.id);
        if (removedIds.length > 0) {
          await transaction.skillPrerequisite.deleteMany({ where: { id: { in: removedIds } } });
        }
        for (const prerequisiteSkillId of dto.prerequisiteSkillIds) {
          if (!existing.has(prerequisiteSkillId)) {
            await transaction.skillPrerequisite.create({ data: { skillId, prerequisiteSkillId } });
          }
        }
        return this.findPrerequisiteSkills(transaction, skillId);
      },
      'Skill prerequisites changed concurrently; please try again',
      undefined,
      true,
    );
  }

  async listQuestionSkills(instructorId: string, questionId: string) {
    const question = await this.requireQuestion(this.prisma, questionId);
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, question.courseId);
    return this.findQuestionSkills(this.prisma, questionId);
  }

  async replaceQuestionSkills(
    instructorId: string,
    questionId: string,
    dto: ReplaceSkillMappingsDto,
  ) {
    this.assertUniqueIds(dto.skillIds, 'skillIds');
    return this.runSerializableMutation(
      async (transaction) => {
        const question = await this.requireQuestion(transaction, questionId);
        await this.assertInstructorOwnsCourse(transaction, instructorId, question.courseId);
        await this.requireSkillsInCourse(transaction, dto.skillIds, question.courseId);
        await this.replaceQuestionSkillSet(transaction, questionId, dto.skillIds);
        return this.findQuestionSkills(transaction, questionId);
      },
      'Question Skill mappings changed concurrently; please try again',
      undefined,
      true,
    );
  }

  async listLessonSkills(instructorId: string, lessonId: string) {
    const lesson = await this.requireLesson(this.prisma, lessonId);
    await this.assertInstructorOwnsCourse(this.prisma, instructorId, lesson.courseId);
    return this.findLessonSkills(this.prisma, lessonId);
  }

  async replaceLessonSkills(instructorId: string, lessonId: string, dto: ReplaceSkillMappingsDto) {
    this.assertUniqueIds(dto.skillIds, 'skillIds');
    return this.runSerializableMutation(
      async (transaction) => {
        const lesson = await this.requireLesson(transaction, lessonId);
        await this.assertInstructorOwnsCourse(transaction, instructorId, lesson.courseId);
        await this.requireSkillsInCourse(transaction, dto.skillIds, lesson.courseId);
        await this.replaceLessonSkillSet(transaction, lessonId, dto.skillIds);
        return this.findLessonSkills(transaction, lessonId);
      },
      'Lesson Skill mappings changed concurrently; please try again',
      undefined,
      true,
    );
  }

  private normalizeCreateInput(dto: CreateSkillDto) {
    return {
      code: this.requireTrimmed(dto.code, 'Skill code'),
      name: this.requireTrimmed(dto.name, 'Skill name'),
      description: dto.description?.trim() || null,
      pInit: dto.pInit ?? DEFAULT_BKT.pInit,
      pLearn: dto.pLearn ?? DEFAULT_BKT.pLearn,
      pGuess: dto.pGuess ?? DEFAULT_BKT.pGuess,
      pSlip: dto.pSlip ?? DEFAULT_BKT.pSlip,
    };
  }

  private validateBkt(parameters: BktParameters): void {
    for (const [name, value] of Object.entries(parameters)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new BadRequestException(`${name} must be a finite number between 0 and 1`);
      }
    }
    if (parameters.pGuess + parameters.pSlip >= 1) {
      throw new BadRequestException('pGuess + pSlip must be less than 1');
    }
  }

  private requireTrimmed(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException(`${label} must not be empty`);
    return trimmed;
  }

  private assertUniqueIds(ids: string[], field: string): void {
    if (!Array.isArray(ids)) throw new BadRequestException(`${field} must be an array`);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(`${field} must not contain duplicates`);
    }
  }

  private async assertInstructorOwnsCourse(
    database: Database,
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

  private async requireSkill(database: Database, skillId: string) {
    const skill = await database.skill.findUnique({
      where: { id: skillId },
      select: { id: true, courseId: true },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    return skill;
  }

  private async requireQuestion(database: Database, questionId: string) {
    const question = await database.question.findUnique({
      where: { id: questionId },
      select: { id: true, courseId: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  private async requireLesson(database: Database, lessonId: string) {
    const lesson = await database.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return { id: lesson.id, courseId: lesson.module.courseId };
  }

  private async requireSkillsInCourse(
    database: Database,
    skillIds: string[],
    courseId: string,
  ): Promise<void> {
    if (skillIds.length === 0) return;
    const skills = await database.skill.findMany({
      where: { id: { in: skillIds } },
      select: { id: true, courseId: true },
    });
    if (skills.length !== skillIds.length || skills.some((skill) => skill.courseId !== courseId)) {
      throw new NotFoundException('Skill not found');
    }
  }

  private findPrerequisiteSkills(database: Database, skillId: string) {
    return database.skill.findMany({
      where: { prerequisiteFor: { some: { skillId } } },
      select: instructorSkillSelect,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  private findQuestionSkills(database: Database, questionId: string) {
    return database.skill.findMany({
      where: { questionMappings: { some: { questionId } } },
      select: instructorSkillSelect,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  private findLessonSkills(database: Database, lessonId: string) {
    return database.skill.findMany({
      where: { lessonMappings: { some: { lessonId } } },
      select: instructorSkillSelect,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  private async replaceQuestionSkillSet(
    transaction: Prisma.TransactionClient,
    questionId: string,
    skillIds: string[],
  ): Promise<void> {
    const current = await transaction.questionSkill.findMany({
      where: { questionId },
      select: { id: true, skillId: true },
    });
    const requested = new Set(skillIds);
    const existing = new Set(current.map((mapping) => mapping.skillId));
    const removedIds = current
      .filter((mapping) => !requested.has(mapping.skillId))
      .map((mapping) => mapping.id);
    if (removedIds.length > 0) {
      await transaction.questionSkill.deleteMany({ where: { id: { in: removedIds } } });
    }
    for (const skillId of skillIds) {
      if (!existing.has(skillId)) {
        await transaction.questionSkill.create({ data: { questionId, skillId } });
      }
    }
  }

  private async replaceLessonSkillSet(
    transaction: Prisma.TransactionClient,
    lessonId: string,
    skillIds: string[],
  ): Promise<void> {
    const current = await transaction.lessonSkill.findMany({
      where: { lessonId },
      select: { id: true, skillId: true },
    });
    const requested = new Set(skillIds);
    const existing = new Set(current.map((mapping) => mapping.skillId));
    const removedIds = current
      .filter((mapping) => !requested.has(mapping.skillId))
      .map((mapping) => mapping.id);
    if (removedIds.length > 0) {
      await transaction.lessonSkill.deleteMany({ where: { id: { in: removedIds } } });
    }
    for (const skillId of skillIds) {
      if (!existing.has(skillId)) {
        await transaction.lessonSkill.create({ data: { lessonId, skillId } });
      }
    }
  }

  private hasCycle(edges: Array<{ skillId: string; prerequisiteSkillId: string }>): boolean {
    const graph = new Map<string, string[]>();
    for (const { skillId, prerequisiteSkillId } of edges) {
      const adjacent = graph.get(skillId) ?? [];
      adjacent.push(prerequisiteSkillId);
      graph.set(skillId, adjacent);
    }

    const state = new Map<string, 0 | 1 | 2>();
    const visit = (node: string): boolean => {
      const current = state.get(node) ?? 0;
      if (current === 1) return true;
      if (current === 2) return false;
      state.set(node, 1);
      for (const prerequisite of graph.get(node) ?? []) {
        if (visit(prerequisite)) return true;
      }
      state.set(node, 2);
      return false;
    };
    return [...new Set(edges.flatMap((edge) => [edge.skillId, edge.prerequisiteSkillId]))].some(
      visit,
    );
  }

  private async runSerializableMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    concurrencyMessage: string,
    constraintMessage = concurrencyMessage,
    retryUniqueConflict = false,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_KNOWLEDGE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (
          this.isPrismaError(error, 'P2034') ||
          (retryUniqueConflict && this.isPrismaError(error, 'P2002'))
        ) {
          if (attempt === MAX_KNOWLEDGE_TRANSACTION_ATTEMPTS) {
            throw new ConflictException(concurrencyMessage);
          }
          continue;
        }
        if (
          this.isPrismaError(error, 'P2002') ||
          this.isPrismaError(error, 'P2003') ||
          this.isPrismaError(error, 'P2014')
        ) {
          throw new ConflictException(constraintMessage);
        }
        throw error;
      }
    }
    throw new ConflictException(concurrencyMessage);
  }

  private rethrowMutationError(error: unknown, conflictMessage: string): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }
    if (
      this.isPrismaError(error, 'P2002') ||
      this.isPrismaError(error, 'P2003') ||
      this.isPrismaError(error, 'P2014')
    ) {
      throw new ConflictException(conflictMessage);
    }
    throw error;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
