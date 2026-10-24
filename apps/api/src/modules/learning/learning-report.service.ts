import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';

@Injectable()
export class LearningReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
  ) {}

  async get(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, learnerId },
      select: {
        id: true,
        status: true,
        classOffering: {
          select: {
            id: true,
            name: true,
            code: true,
            course: {
              select: {
                id: true,
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
            },
          },
        },
        testAttempts: {
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            status: true,
            score: true,
            maxScore: true,
            startedAt: true,
            submittedAt: true,
            test: { select: { id: true, title: true, purpose: true } },
            classAssessment: { select: { id: true, stage: true } },
            evaluation: { select: { status: true } },
            skillScores: {
              select: {
                skill: true,
                normalizedScore: true,
                estimatedToeicScore: true,
                status: true,
                source: true,
              },
            },
          },
        },
        studyRecommendations: {
          where: { isActive: true },
          orderBy: { priority: 'asc' },
          select: {
            id: true,
            priority: true,
            skill: true,
            targetType: true,
            title: true,
            actionText: true,
            lessonId: true,
            resourceId: true,
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const readiness = await this.certificates.readiness(learnerId, enrollmentId);
    return {
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        classOffering: {
          id: enrollment.classOffering.id,
          name: enrollment.classOffering.name,
          code: enrollment.classOffering.code,
        },
        course: {
          id: enrollment.classOffering.course.id,
          title: enrollment.classOffering.course.title,
        },
      },
      modules: enrollment.classOffering.course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          orderIndex: lesson.orderIndex,
          status: lesson.progress[0]?.status ?? 'NOT_STARTED',
          completedAt: lesson.progress[0]?.completedAt ?? null,
        })),
      })),
      assessments: enrollment.testAttempts.map((attempt) => ({
        ...attempt,
        resultState:
          attempt.status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : attempt.evaluation?.status === 'FINAL'
              ? 'FINAL'
              : 'PENDING_REVIEW',
      })),
      skillTrend: enrollment.testAttempts.flatMap((attempt) =>
        attempt.skillScores.map((score) => ({
          attemptId: attempt.id,
          submittedAt: attempt.submittedAt,
          ...score,
        })),
      ),
      attendance: readiness.evidence.attendance,
      completion: {
        policy: readiness.policy,
        evidence: readiness.evidence,
        eligible: readiness.eligible,
        unmet: readiness.unmet,
        issued: readiness.completion,
      },
      recommendations: enrollment.studyRecommendations,
    };
  }
}
