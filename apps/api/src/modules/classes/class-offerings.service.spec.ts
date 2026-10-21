import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ClassModality,
  ClassOfferingStatus,
  PricingType,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassOfferingsService } from './class-offerings.service';

describe('ClassOfferingsService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    classOffering: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new ClassOfferingsService(prisma as unknown as PrismaService);
  const baseInput = {
    courseId: '9ef6f40c-0524-4bd5-9bf1-7b3d6e01ca57',
    name: 'September Cohort',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.course.findUnique.mockResolvedValue({ id: baseInput.courseId });
    prisma.classOffering.create.mockResolvedValue(adminOfferingRow());
  });

  it('creates a valid free offering', async () => {
    await expect(
      service.create({
        ...baseInput,
        pricingType: PricingType.FREE,
        tuitionFeeVnd: 0,
        maxStudents: 20,
      }),
    ).resolves.toMatchObject({
      id: 'offering-id',
      registeredCount: 0,
      remainingSeats: 20,
      isFull: false,
      registrationState: 'CLOSED',
    });

    expect(prisma.classOffering.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ClassOfferingStatus.DRAFT,
          pricingType: PricingType.FREE,
        }),
      }),
    );
  });

  it('maps create and update responses to the shared admin projection', async () => {
    const created = await service.create({ ...baseInput, maxStudents: 20 });
    expect(created).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: 20,
        isFull: false,
        registrationState: 'CLOSED',
      }),
    );
    expect(created).not.toHaveProperty('_count');

    prisma.classOffering.findUnique.mockResolvedValue({
      ...adminOfferingRow(),
      pricingType: PricingType.FREE,
      tuitionFeeVnd: 0,
      classStart: new Date('2026-11-01T00:00:00Z'),
      classEnd: new Date('2026-12-01T00:00:00Z'),
      instructorId: 'teacher-id',
      instructor: {
        id: 'teacher-id',
        fullName: 'Teacher',
        email: 'teacher@example.com',
        role: UserRole.INSTRUCTOR,
        status: UserStatus.ACTIVE,
      },
      scheduleSlots: [
        {
          id: 'slot-id',
          dayOfWeek: 1,
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T10:00:00Z'),
          locationText: 'Room 1',
          meetingUrl: null,
        },
      ],
    });
    prisma.classOffering.update.mockResolvedValue(
      adminOfferingRow({ status: ClassOfferingStatus.OPEN }),
    );
    const updated = await service.update('offering-id', { status: ClassOfferingStatus.OPEN });
    expect(updated).toEqual(
      expect.objectContaining({
        registeredCount: 0,
        remainingSeats: 20,
        isFull: false,
        registrationState: 'AVAILABLE',
      }),
    );
    expect(updated).not.toHaveProperty('_count');
  });

  it('rejects a DRAFT to OPEN transition with stable readiness reasons', async () => {
    prisma.classOffering.findUnique.mockResolvedValue(adminOfferingRow());
    await expect(
      service.update('offering-id', { status: ClassOfferingStatus.OPEN }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLASS_NOT_READY',
        missing: expect.arrayContaining([
          'INSTRUCTOR_MISSING',
          'SCHEDULE_MISSING',
          'CLASS_DATES_MISSING',
        ]),
      }),
    });
    expect(prisma.classOffering.update).not.toHaveBeenCalled();
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

  it.each([
    [ClassOfferingStatus.DRAFT, ClassOfferingStatus.IN_PROGRESS],
    [ClassOfferingStatus.DRAFT, ClassOfferingStatus.COMPLETED],
    [ClassOfferingStatus.COMPLETED, ClassOfferingStatus.OPEN],
    [ClassOfferingStatus.CANCELLED, ClassOfferingStatus.OPEN],
  ])('rejects the class status transition %s -> %s', async (currentStatus, targetStatus) => {
    prisma.classOffering.findUnique.mockResolvedValue(adminOfferingRow({ status: currentStatus }));

    await expect(service.update('offering-id', { status: targetStatus })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLASS_STATUS_TRANSITION_NOT_ALLOWED' }),
    });
    expect(prisma.classOffering.update).not.toHaveBeenCalled();
  });

  it.each([
    [ClassOfferingStatus.DRAFT, ClassOfferingStatus.CANCELLED],
    [ClassOfferingStatus.OPEN, ClassOfferingStatus.IN_PROGRESS],
    [ClassOfferingStatus.IN_PROGRESS, ClassOfferingStatus.COMPLETED],
  ])('allows the class status transition %s -> %s', async (currentStatus, targetStatus) => {
    prisma.classOffering.findUnique.mockResolvedValue(adminOfferingRow({ status: currentStatus }));
    prisma.classOffering.update.mockResolvedValue(adminOfferingRow({ status: targetStatus }));

    await expect(service.update('offering-id', { status: targetStatus })).resolves.toMatchObject({
      status: targetStatus,
    });
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
          meetingUrl: 'https://meet.example.com/private',
        },
      ],
      _count: { enrollments: 4 },
    });
    const result = await service.getPublicById('offering-id');
    expect(result).toMatchObject({
      registeredCount: 4,
      remainingSeats: 6,
      isFull: false,
      registrationState: 'AVAILABLE',
      course: { modules: [{ lessonCount: 2 }] },
      scheduleSlots: [{ dayOfWeek: 2 }],
    });
    expect(result.scheduleSlots[0]).not.toHaveProperty('meetingUrl');
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

  it('filters, paginates and projects admin offering availability', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 'offering-id',
          code: 'TOEIC-01',
          name: 'Evening',
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.HYBRID,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 500_000,
          maxStudents: 10,
          enrollmentStart: null,
          enrollmentEnd: null,
          course: { id: 'course-id', title: 'TOEIC', slug: 'toeic', isPublished: true },
          instructor: null,
          scheduleSlots: [],
          _count: { enrollments: 4 },
        },
      ],
      11,
    ]);

    const result = await service.listAdmin({
      search: 'evening',
      courseId: baseInput.courseId,
      status: ClassOfferingStatus.OPEN,
      modality: ClassModality.HYBRID,
      pricingType: PricingType.PAID,
      page: 2,
      limit: 5,
    });

    expect(prisma.classOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ name: { contains: 'evening', mode: 'insensitive' } }]),
          courseId: baseInput.courseId,
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.HYBRID,
          pricingType: PricingType.PAID,
        }),
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: 5,
        take: 5,
      }),
    );
    expect(result.data[0]).toMatchObject({
      registeredCount: 4,
      remainingSeats: 6,
      isFull: false,
      registrationState: 'AVAILABLE',
    });
    expect(result.data[0]).not.toHaveProperty('_count');
    expect(result.meta).toEqual({ total: 11, page: 2, limit: 5, totalPages: 3 });
  });

  it('returns admin offering detail or a domain 404', async () => {
    const row = {
      id: 'offering-id',
      status: ClassOfferingStatus.DRAFT,
      maxStudents: null,
      enrollmentStart: null,
      enrollmentEnd: null,
      course: { isPublished: false },
      scheduleSlots: [],
      instructor: null,
      _count: { enrollments: 0 },
    };
    prisma.classOffering.findUnique.mockResolvedValueOnce(row);
    await expect(service.getAdminById('offering-id')).resolves.toMatchObject({
      id: 'offering-id',
      registeredCount: 0,
    });
    prisma.classOffering.findUnique.mockResolvedValueOnce(null);
    await expect(service.getAdminById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

function adminOfferingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offering-id',
    courseId: '9ef6f40c-0524-4bd5-9bf1-7b3d6e01ca57',
    instructorId: null,
    code: 'TOEIC-01',
    name: 'September Cohort',
    status: ClassOfferingStatus.DRAFT,
    modality: ClassModality.ONLINE,
    pricingType: PricingType.FREE,
    tuitionFeeVnd: 0,
    maxStudents: 20,
    totalSessions: null,
    totalPeriods: null,
    enrollmentStart: null,
    enrollmentEnd: null,
    classStart: null,
    classEnd: null,
    course: { id: 'course-id', title: 'TOEIC', slug: 'toeic', isPublished: true },
    instructor: null,
    scheduleSlots: [],
    _count: { enrollments: 0 },
    ...overrides,
  };
}
