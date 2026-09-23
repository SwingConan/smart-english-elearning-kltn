import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeAdaptivePath } from './adaptive-engine';
import { DEFAULT_ADAPTIVE_POLICY } from './adaptive-policy.constants';

@Injectable()
export class AdaptiveStudentService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdaptivePath(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        classOffering: { select: { courseId: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    const courseId = enrollment.classOffering.courseId;
    const [savedPolicy, skills, modules] = await Promise.all([
      this.prisma.courseAdaptivePolicy.findUnique({
        where: { courseId },
        select: { remedialThreshold: true, progressionThreshold: true },
      }),
      this.prisma.skill.findMany({
        where: { courseId },
        select: {
          id: true,
          code: true,
          name: true,
          pInit: true,
          learnerStates: {
            where: { enrollmentId },
            select: { masteryProbability: true, observationCount: true },
          },
          prerequisites: { select: { prerequisiteSkillId: true } },
        },
      }),
      this.prisma.module.findMany({
        where: { courseId },
        select: {
          id: true,
          title: true,
          orderIndex: true,
          lessons: {
            select: {
              id: true,
              title: true,
              orderIndex: true,
              skills: { select: { skillId: true } },
              progress: {
                where: { enrollmentId },
                select: { status: true },
              },
            },
          },
        },
      }),
    ]);

    const policy = savedPolicy ?? DEFAULT_ADAPTIVE_POLICY;
    const source = savedPolicy ? ('SAVED' as const) : ('DEFAULT' as const);
    const result = computeAdaptivePath({
      policy,
      skills: skills.map((skill) => {
        const learnerState = skill.learnerStates[0];
        return {
          id: skill.id,
          code: skill.code,
          name: skill.name,
          pInit: skill.pInit,
          prerequisiteSkillIds: skill.prerequisites.map(
            ({ prerequisiteSkillId }) => prerequisiteSkillId,
          ),
          ...(learnerState
            ? {
                learnerState: {
                  masteryProbability: learnerState.masteryProbability,
                  observationCount: learnerState.observationCount,
                },
              }
            : {}),
        };
      }),
      lessons: modules.flatMap((module) =>
        module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          moduleId: module.id,
          moduleTitle: module.title,
          moduleOrderIndex: module.orderIndex,
          lessonOrderIndex: lesson.orderIndex,
          skillIds: lesson.skills.map(({ skillId }) => skillId),
          progressStatus: lesson.progress[0]?.status,
        })),
      ),
    });

    return {
      enrollmentId: enrollment.id,
      courseId,
      policy: {
        remedialThreshold: policy.remedialThreshold,
        progressionThreshold: policy.progressionThreshold,
        source,
      },
      ...result,
    };
  }
}
