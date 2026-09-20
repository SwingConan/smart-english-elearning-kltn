import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EnrollmentStatus, LessonProgressStatus } from '../../generated/prisma/client';

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  private async getEnrollmentForLearning(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
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

    let progressStatus: string = 'NOT_STARTED';
    let lastAccessedAt: Date | null = null;
    let completedAt: Date | null = null;

    if (enrollment.status === EnrollmentStatus.ACTIVE) {
      const now = new Date();
      const existing = await this.prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      });

      if (!existing) {
        const created = await this.prisma.lessonProgress.create({
          data: {
            enrollmentId,
            lessonId,
            status: LessonProgressStatus.IN_PROGRESS,
            lastAccessedAt: now,
          },
        });
        progressStatus = created.status;
        lastAccessedAt = created.lastAccessedAt;
      } else {
        const newStatus =
          existing.status === LessonProgressStatus.NOT_STARTED
            ? LessonProgressStatus.IN_PROGRESS
            : existing.status;
        const updated = await this.prisma.lessonProgress.update({
          where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
          data: {
            status: newStatus,
            lastAccessedAt: now,
          },
        });
        progressStatus = updated.status;
        lastAccessedAt = updated.lastAccessedAt;
        completedAt = updated.completedAt;
      }
    } else {
      const existing = await this.prisma.lessonProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        select: { status: true, lastAccessedAt: true, completedAt: true },
      });
      if (existing) {
        progressStatus = existing.status;
        lastAccessedAt = existing.lastAccessedAt;
        completedAt = existing.completedAt;
      }
    }

    return {
      ...lesson,
      progress: { status: progressStatus, lastAccessedAt, completedAt },
    };
  }

  async completeLesson(learnerId: string, enrollmentId: string, lessonId: string) {
    const enrollment = await this.getEnrollmentForLearning(learnerId, enrollmentId);

    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new ForbiddenException('Progress updates require an active enrollment');
    }

    const courseId = enrollment.classOffering.courseId;

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId } },
      select: { id: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const now = new Date();

    const existing = await this.prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });

    if (!existing) {
      return this.prisma.lessonProgress.create({
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

    return this.prisma.lessonProgress.update({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      data: {
        status: LessonProgressStatus.COMPLETED,
        lastAccessedAt: now,
        completedAt: now,
      },
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
      },
    });

    const progressPercent =
      totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

    return {
      enrollmentId,
      courseTitle: course.title,
      totalLessons,
      completedLessons,
      progressPercent,
    };
  }
}
