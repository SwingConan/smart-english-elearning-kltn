import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DEFAULT_ADAPTIVE_POLICY } from './adaptive-policy.constants';
import { AdaptiveInstructorService } from './adaptive-instructor.service';

describe('AdaptiveInstructorService', () => {
  const instructorId = '10000000-0000-4000-8000-000000000001';
  const courseId = '20000000-0000-4000-8000-000000000001';
  let prisma: {
    classOffering: { findFirst: jest.Mock };
    courseAdaptivePolicy: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let service: AdaptiveInstructorService;

  beforeEach(() => {
    prisma = {
      classOffering: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assigned-offering' }),
      },
      courseAdaptivePolicy: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new AdaptiveInstructorService(prisma as unknown as PrismaService);
  });

  it('returns a saved policy with no persistence details', async () => {
    prisma.courseAdaptivePolicy.findUnique.mockResolvedValue({
      courseId,
      remedialThreshold: 0.25,
      progressionThreshold: 0.9,
    });

    await expect(service.getPolicy(instructorId, courseId)).resolves.toEqual({
      courseId,
      remedialThreshold: 0.25,
      progressionThreshold: 0.9,
      source: 'SAVED',
    });
  });

  it('returns in-memory defaults without creating or upserting a policy', async () => {
    prisma.courseAdaptivePolicy.findUnique.mockResolvedValue(null);

    await expect(service.getPolicy(instructorId, courseId)).resolves.toEqual({
      courseId,
      ...DEFAULT_ADAPTIVE_POLICY,
      source: 'DEFAULT',
    });
    expect(prisma.courseAdaptivePolicy.upsert).not.toHaveBeenCalled();
  });

  it('checks assignment through ClassOffering before reading policy', async () => {
    prisma.courseAdaptivePolicy.findUnique.mockResolvedValue(null);

    await service.getPolicy(instructorId, courseId);

    expect(prisma.classOffering.findFirst).toHaveBeenCalledWith({
      where: { courseId, instructorId },
      select: { id: true },
    });
  });

  it('returns 404 without reading policy when Instructor is unassigned', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);

    await expect(service.getPolicy(instructorId, courseId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.courseAdaptivePolicy.findUnique).not.toHaveBeenCalled();
  });

  it('upserts a complete replacement and returns SAVED', async () => {
    prisma.courseAdaptivePolicy.upsert.mockResolvedValue({
      courseId,
      remedialThreshold: 0.3,
      progressionThreshold: 0.85,
    });

    await expect(
      service.replacePolicy(instructorId, courseId, {
        remedialThreshold: 0.3,
        progressionThreshold: 0.85,
      }),
    ).resolves.toEqual({
      courseId,
      remedialThreshold: 0.3,
      progressionThreshold: 0.85,
      source: 'SAVED',
    });
    expect(prisma.courseAdaptivePolicy.upsert).toHaveBeenCalledWith({
      where: { courseId },
      create: {
        courseId,
        remedialThreshold: 0.3,
        progressionThreshold: 0.85,
      },
      update: {
        remedialThreshold: 0.3,
        progressionThreshold: 0.85,
      },
      select: {
        courseId: true,
        remedialThreshold: true,
        progressionThreshold: true,
      },
    });
  });

  it('allows the inclusive outer boundaries 0 and 1', async () => {
    prisma.courseAdaptivePolicy.upsert.mockResolvedValue({
      courseId,
      remedialThreshold: 0,
      progressionThreshold: 1,
    });

    await expect(
      service.replacePolicy(instructorId, courseId, {
        remedialThreshold: 0,
        progressionThreshold: 1,
      }),
    ).resolves.toMatchObject({
      remedialThreshold: 0,
      progressionThreshold: 1,
      source: 'SAVED',
    });
  });

  it.each([
    [-0.01, 0.8],
    [0.4, 1.01],
    [0.4, 0.4],
    [0.8, 0.4],
    [Number.NaN, 0.8],
    [0.4, Number.POSITIVE_INFINITY],
  ])('rejects invalid thresholds (%p, %p)', async (remedialThreshold, progressionThreshold) => {
    await expect(
      service.replacePolicy(instructorId, courseId, {
        remedialThreshold,
        progressionThreshold,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.courseAdaptivePolicy.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 without upserting when Instructor is unassigned', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);

    await expect(
      service.replacePolicy(instructorId, courseId, {
        remedialThreshold: 0.3,
        progressionThreshold: 0.9,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.courseAdaptivePolicy.upsert).not.toHaveBeenCalled();
  });
});
