import { Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  AdaptiveMasteryBand,
  AdaptiveMasteryState,
  classifyMasteryBand,
} from './adaptive-engine';
import { DEFAULT_ADAPTIVE_POLICY } from './adaptive-policy.constants';

const dashboardSkillSelect = {
  id: true,
  code: true,
  name: true,
  pInit: true,
} satisfies Prisma.SkillSelect;

const dashboardEnrollmentSelect = {
  id: true,
  learnerId: true,
  learner: { select: { fullName: true } },
  classOffering: { select: { id: true, name: true } },
  learnerSkills: {
    select: {
      skillId: true,
      masteryProbability: true,
      observationCount: true,
      lastObservedAt: true,
    },
  },
} satisfies Prisma.EnrollmentSelect;

interface LearnerMasteryPolicy {
  remedialThreshold: number;
  progressionThreshold: number;
  source: 'DEFAULT' | 'SAVED';
}

interface LearnerMasterySkill {
  skillId: string;
  code: string;
  name: string;
}

interface LearnerMasterySkillState {
  skillId: string;
  state: AdaptiveMasteryState;
  masteryProbability: number;
  masteryBand: AdaptiveMasteryBand;
  observationCount: number;
  lastObservedAt: Date | null;
}

interface LearnerMasteryRow {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  classOffering: {
    id: string;
    name: string;
  };
  skillStates: LearnerMasterySkillState[];
}

export interface InstructorLearnerMasteryResponse {
  courseId: string;
  policy: LearnerMasteryPolicy;
  skills: LearnerMasterySkill[];
  learners: LearnerMasteryRow[];
}

type DashboardSkill = Prisma.SkillGetPayload<{ select: typeof dashboardSkillSelect }>;
type DashboardEnrollment = Prisma.EnrollmentGetPayload<{
  select: typeof dashboardEnrollmentSelect;
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEnrollments(left: DashboardEnrollment, right: DashboardEnrollment): number {
  return (
    compareText(left.classOffering.name, right.classOffering.name) ||
    compareText(left.classOffering.id, right.classOffering.id) ||
    compareText(left.learner.fullName, right.learner.fullName) ||
    compareText(left.learnerId, right.learnerId) ||
    compareText(left.id, right.id)
  );
}

@Injectable()
export class InstructorLearnerMasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(
    instructorId: string,
    courseId: string,
  ): Promise<InstructorLearnerMasteryResponse> {
    await this.assertInstructorAssigned(instructorId, courseId);

    const [savedPolicy, skills, enrollments] = await Promise.all([
      this.prisma.courseAdaptivePolicy.findUnique({
        where: { courseId },
        select: { remedialThreshold: true, progressionThreshold: true },
      }),
      this.prisma.skill.findMany({
        where: { courseId },
        select: dashboardSkillSelect,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.enrollment.findMany({
        where: {
          status: EnrollmentStatus.ACTIVE,
          classOffering: { courseId, instructorId },
        },
        select: {
          ...dashboardEnrollmentSelect,
          learnerSkills: {
            where: { skill: { courseId } },
            select: dashboardEnrollmentSelect.learnerSkills.select,
          },
        },
      }),
    ]);

    const thresholds = savedPolicy ?? DEFAULT_ADAPTIVE_POLICY;
    const policy: LearnerMasteryPolicy = {
      ...thresholds,
      source: savedPolicy ? 'SAVED' : 'DEFAULT',
    };

    return {
      courseId,
      policy,
      skills: skills.map(({ id, code, name }) => ({ skillId: id, code, name })),
      learners: enrollments
        .sort(compareEnrollments)
        .map((enrollment) => this.toLearnerRow(enrollment, skills, thresholds)),
    };
  }

  private async assertInstructorAssigned(instructorId: string, courseId: string): Promise<void> {
    const assignment = await this.prisma.classOffering.findFirst({
      where: { courseId, instructorId },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Learner mastery dashboard not found');
    }
  }

  private toLearnerRow(
    enrollment: DashboardEnrollment,
    skills: DashboardSkill[],
    policy: { remedialThreshold: number; progressionThreshold: number },
  ): LearnerMasteryRow {
    const persistedBySkillId = new Map(
      enrollment.learnerSkills.map((state) => [state.skillId, state]),
    );

    return {
      enrollmentId: enrollment.id,
      learnerId: enrollment.learnerId,
      learnerName: enrollment.learner.fullName,
      classOffering: enrollment.classOffering,
      skillStates: skills.map((skill) => {
        const persisted = persistedBySkillId.get(skill.id);
        const state: AdaptiveMasteryState = persisted ? 'OBSERVED' : 'PRIOR';
        const masteryProbability = persisted?.masteryProbability ?? skill.pInit;

        return {
          skillId: skill.id,
          state,
          masteryProbability,
          masteryBand: classifyMasteryBand(state, masteryProbability, policy),
          observationCount: persisted?.observationCount ?? 0,
          lastObservedAt: persisted?.lastObservedAt ?? null,
        };
      }),
    };
  }
}
