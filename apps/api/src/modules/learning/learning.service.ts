import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EnrollmentStatus, LessonProgressStatus, Prisma } from '../../generated/prisma/client';

const MAX_PROGRESS_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  private async getEnrollmentForLearning(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        classOfferingId: true,
        status: true,
        classOffering: {
          select: { courseId: true },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    return enrollment;
  }

  async getContent(learnerId: string, enrollmentId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const courseId = enrollment.classOffering.courseId;

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        level: true,
        modules: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            orderIndex: true,
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                orderIndex: true,
                _count: { select: { resources: true } },
                progress: {
                  where: { enrollmentId },
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });

    return {
      course: { id: course.id, title: course.title, level: course.level },
      modules: course.modules.map((mod) => ({
        id: mod.id,
        title: mod.title,
        description: mod.description,
        orderIndex: mod.orderIndex,
        lessons: mod.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          orderIndex: lesson.orderIndex,
          progressStatus: lesson.progress[0]?.status ?? 'NOT_STARTED',
          resourceCount: lesson._count.resources,
        })),
      })),
    };
  }

  async openLesson(learnerId: string, enrollmentId: string, lessonId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const courseId = enrollment.classOffering.courseId;

    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        module: { courseId },
      },
      select: {
        id: true,
        title: true,
        description: true,
        orderIndex: true,
        module: { select: { id: true, title: true } },
        resources: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            type: true,
            url: true,
            orderIndex: true,
            isDownloadable: true,
          },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const progress = await this.runProgressTransaction(async (transaction) => {
      const now = new Date();
      const existing = await transaction.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      });

      if (!existing) {
        return transaction.lessonProgress.create({
          data: {
            enrollmentId,
            lessonId,
            status: LessonProgressStatus.IN_PROGRESS,
            lastAccessedAt: now,
          },
        });
      }

      return transaction.lessonProgress.update({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        data: {
          status:
            existing.status === LessonProgressStatus.COMPLETED
              ? LessonProgressStatus.COMPLETED
              : LessonProgressStatus.IN_PROGRESS,
          lastAccessedAt: now,
        },
      });
    });

    return {
      ...lesson,
      progress: {
        status: progress.status,
        lastAccessedAt: progress.lastAccessedAt,
        completedAt: progress.completedAt,
      },
    };
  }

  async completeLesson(learnerId: string, enrollmentId: string, lessonId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const courseId = enrollment.classOffering.courseId;

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId } },
      select: { id: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return this.runProgressTransaction(async (transaction) => {
      const now = new Date();
      const existing = await transaction.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      });

      if (!existing) {
        return transaction.lessonProgress.create({
          data: {
            enrollmentId,
            lessonId,
            status: LessonProgressStatus.COMPLETED,
            lastAccessedAt: now,
            completedAt: now,
          },
        });
      }

      if (existing.status === LessonProgressStatus.COMPLETED) {
        return existing;
      }

      return transaction.lessonProgress.update({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        data: {
          status: LessonProgressStatus.COMPLETED,
          lastAccessedAt: now,
          completedAt: now,
        },
      });
    });
  }

  async getProgress(learnerId: string, enrollmentId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const courseId = enrollment.classOffering.courseId;

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { title: true },
    });

    const totalLessons = await this.prisma.lesson.count({
      where: { module: { courseId } },
    });

    const completedLessons = await this.prisma.lessonProgress.count({
      where: {
        enrollmentId,
        status: LessonProgressStatus.COMPLETED,
        lesson: { module: { courseId } },
      },
    });

    const progressPercent =
      totalLessons === 0 ? 0 : Math.min(100, Math.round((completedLessons / totalLessons) * 100));

    return {
      enrollmentId,
      courseTitle: course.title,
      totalLessons,
      completedLessons,
      progressPercent,
    };
  }

  async getMastery(learnerId: string, enrollmentId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const courseId = enrollment.classOffering.courseId;
    const skills = await this.prisma.skill.findMany({
      where: { courseId },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        pInit: true,
        learnerStates: {
          where: { enrollmentId },
          select: {
            masteryProbability: true,
            observationCount: true,
            lastObservedAt: true,
          },
        },
        prerequisites: {
          select: {
            prerequisiteSkill: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    return {
      enrollmentId,
      courseId,
      skills: skills.map((skill) => ({
        id: skill.id,
        code: skill.code,
        name: skill.name,
        description: skill.description,
        ...this.currentMastery(skill.learnerStates[0], skill.pInit),
        prerequisites: skill.prerequisites
          .map(({ prerequisiteSkill }) => prerequisiteSkill)
          .sort(
            (left, right) =>
              left.code.localeCompare(right.code) || left.id.localeCompare(right.id),
          ),
      })),
    };
  }

  async getMasteryHistory(learnerId: string, enrollmentId: string, skillId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const skill = await this.prisma.skill.findFirst({
      where: { id: skillId, courseId: enrollment.classOffering.courseId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        pInit: true,
        learnerStates: {
          where: { enrollmentId },
          select: {
            masteryProbability: true,
            observationCount: true,
            lastObservedAt: true,
          },
        },
      },
    });
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const history = await this.prisma.masteryHistory.findMany({
      where: { enrollmentId, skillId },
      orderBy: [
        { createdAt: 'asc' },
        { testAttemptId: 'asc' },
        { testAnswerId: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        testAttemptId: true,
        testAnswerId: true,
        isCorrect: true,
        priorMastery: true,
        evidencePosterior: true,
        posteriorMastery: true,
        createdAt: true,
      },
    });

    return {
      enrollmentId,
      skill: {
        id: skill.id,
        code: skill.code,
        name: skill.name,
        description: skill.description,
      },
      current: this.currentMastery(skill.learnerStates[0], skill.pInit),
      history,
    };
  }

  private currentMastery(
    persisted:
      | {
          masteryProbability: number;
          observationCount: number;
          lastObservedAt: Date | null;
        }
      | undefined,
    pInit: number,
  ) {
    if (!persisted) {
      return {
        masteryProbability: pInit,
        observationCount: 0,
        lastObservedAt: null,
        state: 'PRIOR' as const,
      };
    }

    return {
      masteryProbability: persisted.masteryProbability,
      observationCount: persisted.observationCount,
      lastObservedAt: persisted.lastObservedAt,
      state: 'OBSERVED' as const,
    };
  }

  private async runProgressTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_PROGRESS_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        const retryable =
          this.isPrismaError(error, 'P2034') || this.isLessonProgressConflict(error);
        if (!retryable) throw error;
        if (attempt === MAX_PROGRESS_TRANSACTION_ATTEMPTS) {
          throw new ConflictException('Lesson progress changed concurrently; please try again');
        }
      }
    }

    throw new ConflictException('Lesson progress could not be updated');
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private isLessonProgressConflict(error: unknown): boolean {
    if (!this.isPrismaError(error, 'P2002')) return false;

    const metadata = (error as Prisma.PrismaClientKnownRequestError).meta as
      Record<string, unknown> | undefined;
    if (metadata?.modelName && metadata.modelName !== 'LessonProgress') {
      return false;
    }

    try {
      const serialized = JSON.stringify(metadata).toLowerCase();
      return serialized.includes('enrollmentid') && serialized.includes('lessonid');
    } catch {
      return false;
    }
  }
}
