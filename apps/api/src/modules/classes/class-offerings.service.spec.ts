import { BadRequestException } from '@nestjs/common';
import {
  ClassOfferingStatus,
  PricingType,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassOfferingsService } from './class-offerings.service';

describe('ClassOfferingsService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    classOffering: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ClassOfferingsService(
    prisma as unknown as PrismaService,
  );
  const baseInput = {
    courseId: '9ef6f40c-0524-4bd5-9bf1-7b3d6e01ca57',
    name: 'September Cohort',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.course.findUnique.mockResolvedValue({ id: baseInput.courseId });
    prisma.classOffering.create.mockResolvedValue({ id: 'offering-id' });
  });

  it('creates a valid free offering', async () => {
    await expect(
      service.create({
        ...baseInput,
        pricingType: PricingType.FREE,
        tuitionFeeVnd: 0,
        maxStudents: 20,
      }),
    ).resolves.toEqual({ id: 'offering-id' });

    expect(prisma.classOffering.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ClassOfferingStatus.DRAFT,
          pricingType: PricingType.FREE,
        }),
      }),
    );
  });

  it('rejects an offering for a course that does not exist', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    await expect(service.create(baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a free offering with a positive fee', async () => {
    await expect(
      service.create({
        ...baseInput,
        pricingType: PricingType.FREE,
        tuitionFeeVnd: 100_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([null, 0])('rejects a paid offering with fee %s', async (fee) => {
    await expect(
      service.create({
        ...baseInput,
        pricingType: PricingType.PAID,
        tuitionFeeVnd: fee,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid enrollment date range', async () => {
    await expect(
      service.create({
        ...baseInput,
        enrollmentStart: new Date('2026-10-02T00:00:00Z'),
        enrollmentEnd: new Date('2026-10-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid class date range', async () => {
    await expect(
      service.create({
        ...baseInput,
        classStart: new Date('2026-10-02T00:00:00Z'),
        classEnd: new Date('2026-10-02T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid maxStudents even when called outside DTO validation', async () => {
    await expect(
      service.create({ ...baseInput, maxStudents: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects assigning a user who is not an instructor', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: UserRole.STUDENT });

    await expect(
      service.create({
        ...baseInput,
        instructorId: '35962015-26c6-48a7-a7c3-46052a3ad6dc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
