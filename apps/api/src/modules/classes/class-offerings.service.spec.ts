import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassOfferingStatus, PricingType, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassOfferingsService } from './class-offerings.service';

describe('ClassOfferingsService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    classOffering: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ClassOfferingsService(prisma as unknown as PrismaService);
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

    await expect(service.create(baseInput)).rejects.toBeInstanceOf(BadRequestException);
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
    await expect(service.create({ ...baseInput, maxStudents: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

  it('returns a published public offering with ACTIVE capacity and schedule', async () => {
    prisma.classOffering.findFirst.mockResolvedValue({
      id: 'offering-id',
      code: 'TOEIC-01',
      name: 'TOEIC Evening',
      status: ClassOfferingStatus.OPEN,
      modality: 'ONLINE',
      pricingType: PricingType.FREE,
      tuitionFeeVnd: 0,
      maxStudents: 10,
      totalSessions: 12,
      totalPeriods: 24,
      enrollmentStart: null,
      enrollmentEnd: null,
      classStart: null,
      classEnd: null,
      course: {
        id: 'course-id',
        title: 'TOEIC',
        slug: 'toeic',
        description: 'Public',
        level: 'A1',
        skillScope: 'LR',
        modules: [{ id: 'module-id', title: 'Module', orderIndex: 0, _count: { lessons: 2 } }],
      },
      instructor: { id: 'teacher-id', fullName: 'Teacher' },
      scheduleSlots: [
        {
          id: 'slot-id',
          dayOfWeek: 2,
          startTime: new Date('1970-01-01T18:00:00Z'),
          endTime: new Date('1970-01-01T20:00:00Z'),
          locationText: 'Online',
          meetingUrl: null,
        },
      ],
      _count: { enrollments: 4 },
    });
    await expect(service.getPublicById('offering-id')).resolves.toMatchObject({
      registeredCount: 4,
      remainingSeats: 6,
      isFull: false,
      registrationState: 'AVAILABLE',
      course: { modules: [{ lessonCount: 2 }] },
      scheduleSlots: [{ dayOfWeek: 2 }],
    });
    expect(prisma.classOffering.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'offering-id', course: { isPublished: true } }),
      }),
    );
  });

  it('does not expose missing, draft or unpublished offerings publicly', async () => {
    prisma.classOffering.findFirst.mockResolvedValue(null);
    await expect(service.getPublicById('private-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
