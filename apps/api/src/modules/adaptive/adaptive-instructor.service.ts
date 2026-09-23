import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DEFAULT_ADAPTIVE_POLICY } from './adaptive-policy.constants';
import { ReplaceAdaptivePolicyDto } from './dto/replace-adaptive-policy.dto';

const adaptivePolicySelect = {
  courseId: true,
  remedialThreshold: true,
  progressionThreshold: true,
} satisfies Prisma.CourseAdaptivePolicySelect;

export type AdaptivePolicySource = 'DEFAULT' | 'SAVED';

export interface AdaptivePolicyResponse {
  courseId: string;
  remedialThreshold: number;
  progressionThreshold: number;
  source: AdaptivePolicySource;
}

@Injectable()
export class AdaptiveInstructorService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(instructorId: string, courseId: string): Promise<AdaptivePolicyResponse> {
    await this.assertInstructorAssigned(instructorId, courseId);
    const policy = await this.prisma.courseAdaptivePolicy.findUnique({
      where: { courseId },
      select: adaptivePolicySelect,
    });

    if (!policy) {
      return {
        courseId,
        ...DEFAULT_ADAPTIVE_POLICY,
        source: 'DEFAULT',
      };
    }

    return { ...policy, source: 'SAVED' };
  }

  async replacePolicy(
    instructorId: string,
    courseId: string,
    dto: ReplaceAdaptivePolicyDto,
  ): Promise<AdaptivePolicyResponse> {
    await this.assertInstructorAssigned(instructorId, courseId);
    this.validatePolicy(dto);

    const policy = await this.prisma.courseAdaptivePolicy.upsert({
      where: { courseId },
      create: {
        courseId,
        remedialThreshold: dto.remedialThreshold,
        progressionThreshold: dto.progressionThreshold,
      },
      update: {
        remedialThreshold: dto.remedialThreshold,
        progressionThreshold: dto.progressionThreshold,
      },
      select: adaptivePolicySelect,
    });

    return { ...policy, source: 'SAVED' };
  }

  private async assertInstructorAssigned(instructorId: string, courseId: string): Promise<void> {
    const assignment = await this.prisma.classOffering.findFirst({
      where: { courseId, instructorId },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Adaptive policy not found');
    }
  }

  private validatePolicy(policy: ReplaceAdaptivePolicyDto): void {
    const { remedialThreshold, progressionThreshold } = policy;
    if (
      !Number.isFinite(remedialThreshold) ||
      !Number.isFinite(progressionThreshold) ||
      remedialThreshold < 0 ||
      progressionThreshold > 1 ||
      remedialThreshold >= progressionThreshold
    ) {
      throw new BadRequestException(
        'Policy must satisfy 0 <= remedialThreshold < progressionThreshold <= 1',
      );
    }
  }
}
