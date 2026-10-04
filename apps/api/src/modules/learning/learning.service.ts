import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  EnrollmentStatus,
  LessonProgressStatus,
  Prisma,
  TestAttemptStatus,
  TestPurpose,
  TestStatus,
} from '../../generated/prisma/client';

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
            storageKey: true,
            originalFileName: true,
            mimeType: true,
            orderIndex: true,
            isDownloadable: true,
            updatedAt: true,
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
      select: {
        title: true,
        modules: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            orderIndex: true,
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                orderIndex: true,
                progress: {
                  where: { enrollmentId },
                  select: { status: true, completedAt: true },
                },
              },
            },
          },
        },
      },
    });

    const assessments = await this.prisma.classAssessment.findMany({
      where: {
        classOfferingId: enrollment.classOfferingId,
        isActive: true,
        test: {
          status: TestStatus.PUBLISHED,
          purpose: { in: [TestPurpose.IN_CLASS, TestPurpose.PRACTICE_MOCK] },
        },
      },
      orderBy: [{ openAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        stage: true,
        openAt: true,
        closeAt: true,
        maxAttemptsOverride: true,
        test: {
          select: {
            id: true,
            title: true,
            purpose: true,
            maxAttempts: true,
            showResultAfterSubmit: true,
          },
        },
      },
    });

    const assessmentAttempts = assessments.length
      ? await this.prisma.testAttempt.findMany({
          where: {
            enrollmentId,
            classAssessmentId: { in: assessments.map((assessment) => assessment.id) },
            status: { in: [TestAttemptStatus.IN_PROGRESS, TestAttemptStatus.SUBMITTED] },
          },
          orderBy: [{ classAssessmentId: 'asc' }, { attemptNumber: 'desc' }],
          select: {
            id: true,
            classAssessmentId: true,
            attemptNumber: true,
            status: true,
            submittedAt: true,
            skillScores: {
              orderBy: { skill: 'asc' },
              select: {
                skill: true,
                status: true,
                normalizedScore: true,
              },
            },
            answers: {
              select: {
                textResponse: true,
                audioStorageKey: true,
                testQuestion: {
                  select: {
                    question: { select: { toeicSkill: true } },
                  },
                },
              },
            },
          },
        })
      : [];

    const lessons = course.modules.flatMap((module) => module.lessons);
    const totalLessons = lessons.length;
    const completedLessons = lessons.filter(
      (lesson) => lesson.progress[0]?.status === LessonProgressStatus.COMPLETED,
    ).length;

    const progressPercent =
      totalLessons === 0 ? 0 : Math.min(100, Math.round((completedLessons / totalLessons) * 100));

    return {
      enrollmentId,
      courseTitle: course.title,
      totalLessons,
      completedLessons,
      progressPercent,
      modules: course.modules.map((module) => {
        const moduleCompletedLessons = module.lessons.filter(
          (lesson) => lesson.progress[0]?.status === LessonProgressStatus.COMPLETED,
        ).length;
        return {
          id: module.id,
          title: module.title,
          orderIndex: module.orderIndex,
          totalLessons: module.lessons.length,
          completedLessons: moduleCompletedLessons,
          progressPercent:
            module.lessons.length === 0
              ? 0
              : Math.round((moduleCompletedLessons / module.lessons.length) * 100),
          lessons: module.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            orderIndex: lesson.orderIndex,
            status: lesson.progress[0]?.status ?? LessonProgressStatus.NOT_STARTED,
            completedAt: lesson.progress[0]?.completedAt ?? null,
          })),
        };
      }),
      assessments: assessments.map((assessment) => {
        const attempts = assessmentAttempts.filter(
          (attempt) => attempt.classAssessmentId === assessment.id,
        );
        const currentAttempt = attempts.find(
          (attempt) => attempt.status === TestAttemptStatus.IN_PROGRESS,
        );
        const submittedAttempts = attempts.filter(
          (attempt) => attempt.status === TestAttemptStatus.SUBMITTED,
        );
        return {
          id: assessment.id,
          testId: assessment.test.id,
          title: assessment.test.title,
          purpose: assessment.test.purpose,
          stage: assessment.stage,
          openAt: assessment.openAt,
          closeAt: assessment.closeAt,
          maxAttempts: assessment.maxAttemptsOverride ?? assessment.test.maxAttempts,
          status: currentAttempt
            ? 'IN_PROGRESS'
            : submittedAttempts.length > 0
              ? 'COMPLETED'
              : 'NOT_STARTED',
          currentAttempt: currentAttempt
            ? {
                attemptId: currentAttempt.id,
                attemptNumber: currentAttempt.attemptNumber,
                status: 'IN_PROGRESS' as const,
              }
            : null,
          submittedAttempts: submittedAttempts.map((attempt) => ({
            attemptId: attempt.id,
            attemptNumber: attempt.attemptNumber,
            submittedAt: attempt.submittedAt,
            resultAvailable: assessment.test.showResultAfterSubmit,
            skillResults: this.mapAttemptSkillResults(attempt),
          })),
        };
      }),
    };
  }

  private mapAttemptSkillResults(attempt: {
    skillScores: Array<{ skill: string; status: string; normalizedScore: Prisma.Decimal }>;
    answers: Array<{
      textResponse: string | null;
      audioStorageKey: string | null;
      testQuestion: { question: { toeicSkill: string | null } };
    }>;
  }) {
    return (['LISTENING', 'READING', 'SPEAKING', 'WRITING'] as const).map((skill) => {
      const persisted = attempt.skillScores.find((score) => score.skill === skill);
      const hasResponse = attempt.answers.some(
        (answer) =>
          answer.testQuestion.question.toeicSkill === skill &&
          Boolean(answer.textResponse?.trim() || answer.audioStorageKey),
      );
      return {
        skill,
        state:
          persisted?.status === 'FINAL'
            ? ('FINAL' as const)
            : hasResponse
              ? ('PENDING_REVIEW' as const)
              : ('MISSING_RESPONSE' as const),
        normalizedScore: persisted?.status === 'FINAL' ? Number(persisted.normalizedScore) : null,
      };
    });
  }

  async getResourceDownload(learnerId: string, enrollmentId: string, resourceId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);
    const resource = await this.prisma.learningResource.findFirst({
      where: {
        id: resourceId,
        isDownloadable: true,
        lesson: { module: { courseId: enrollment.classOffering.courseId } },
      },
      select: {
        id: true,
        title: true,
        url: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
      },
    });
    if (!resource || !resource.url) {
      throw new NotFoundException('Downloadable resource not found');
    }

    return {
      resourceId: resource.id,
      url: resource.url,
      fileName: resource.originalFileName ?? resource.title,
      mimeType: resource.mimeType,
      delivery: resource.storageKey ? 'STORAGE' : 'EXTERNAL_URL',
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
            (left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id),
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
