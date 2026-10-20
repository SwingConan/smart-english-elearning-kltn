import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassOperationsService } from './class-operations.service';
import { ClassOfferingsService } from './class-offerings.service';

describe('ClassOperationsService', () => {
  const prisma = {
    user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    classOffering: { findUnique: jest.fn(), update: jest.fn() },
    classScheduleSlot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const classOfferings = { getAdminById: jest.fn() };
  const service = new ClassOperationsService(
    prisma as unknown as PrismaService,
    classOfferings as unknown as ClassOfferingsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.classOffering.findUnique.mockResolvedValue({
      id: 'class-id',
      status: ClassOfferingStatus.DRAFT,
    });
    classOfferings.getAdminById.mockResolvedValue({ id: 'class-id', registeredCount: 2 });
    prisma.classScheduleSlot.findMany.mockResolvedValue([]);
  });

  it('lists only ACTIVE INSTRUCTOR options with bounded search and stable ordering', async () => {
    prisma.$transaction.mockResolvedValue([
      [{ id: 'teacher', fullName: 'An', email: 'a@x.vn' }],
      1,
    ]);
    await expect(
      service.listInstructorOptions({ search: ' an ', page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      data: [{ id: 'teacher' }],
      meta: { total: 1, totalPages: 1 },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE }),
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it.each([
    [UserRole.STUDENT, UserStatus.ACTIVE],
    [UserRole.INSTRUCTOR, UserStatus.INACTIVE],
    [UserRole.INSTRUCTOR, UserStatus.LOCKED],
  ])('rejects assignment for role %s with status %s', async (role, status) => {
    prisma.user.findUnique.mockResolvedValue({ role, status });
    await expect(service.assignInstructor('class-id', 'user-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.classOffering.update).not.toHaveBeenCalled();
  });

  it('assigns an active instructor using the existing instructorId relation', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
    });
    await service.assignInstructor('class-id', 'teacher-id');
    expect(prisma.classOffering.update).toHaveBeenCalledWith({
      where: { id: 'class-id' },
      data: { instructorId: 'teacher-id' },
    });
    expect(classOfferings.getAdminById).toHaveBeenCalledWith('class-id');
  });

  it.each([ClassOfferingStatus.COMPLETED, ClassOfferingStatus.CANCELLED])(
    'locks assignment changes for %s classes',
    async (status) => {
      prisma.classOffering.findUnique.mockResolvedValue({ id: 'class-id', status });
      await expect(service.assignInstructor('class-id', 'teacher-id')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects unassigning an in-progress class', async () => {
    prisma.classOffering.findUnique.mockResolvedValue({
      id: 'class-id',
      status: ClassOfferingStatus.IN_PROGRESS,
    });
    await expect(service.assignInstructor('class-id', null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates a Sunday slot with UTC wall-clock times and a normalized destination', async () => {
    prisma.classScheduleSlot.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'slot-id', ...data }),
    );
    await expect(
      service.createScheduleSlot('class-id', {
        dayOfWeek: 7,
        startTime: '08:05',
        endTime: '10:00',
        locationText: ' Phòng 2 ',
        meetingUrl: null,
      }),
    ).resolves.toMatchObject({ dayOfWeek: 7, startTime: '08:05', endTime: '10:00' });
    expect(prisma.classScheduleSlot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classOfferingId: 'class-id',
        dayOfWeek: 7,
        locationText: 'Phòng 2',
        startTime: new Date('1970-01-01T08:05:00.000Z'),
      }),
    });
  });

  it('rejects missing destinations, invalid HTTP links, and overlaps', async () => {
    await expect(
      service.createScheduleSlot('class-id', {
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        locationText: ' ',
        meetingUrl: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createScheduleSlot('class-id', {
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '09:00',
        meetingUrl: 'ftp://example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.classScheduleSlot.findMany.mockResolvedValue([
      {
        startTime: new Date('1970-01-01T08:30:00Z'),
        endTime: new Date('1970-01-01T10:00:00Z'),
      },
    ]);
    await expect(
      service.createScheduleSlot('class-id', {
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '11:00',
        locationText: 'Room',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces schedule ownership and mutation status restrictions', async () => {
    prisma.classScheduleSlot.findFirst.mockResolvedValue(null);
    await expect(
      service.updateScheduleSlot('class-id', 'other-slot', { startTime: '09:00' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.classOffering.findUnique.mockResolvedValue({
      id: 'class-id',
      status: ClassOfferingStatus.COMPLETED,
    });
    await expect(service.deleteScheduleSlot('class-id', 'slot-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('filters and paginates the real enrollment roster with summary counts', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 'enrollment-id',
          status: EnrollmentStatus.ACTIVE,
          enrolledAt: new Date(),
          learner: { id: 'learner', fullName: 'Lan', email: 'lan@example.com' },
        },
      ],
      1,
      [
        { status: EnrollmentStatus.ACTIVE, _count: { id: 2 } },
        { status: EnrollmentStatus.PENDING_PAYMENT, _count: { id: 1 } },
      ],
    ]);
    await expect(
      service.listRoster('class-id', {
        search: 'lan',
        status: EnrollmentStatus.ACTIVE,
        page: 1,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      summary: { total: 3, active: 2, pendingPayment: 1 },
      meta: { total: 1, page: 1 },
    });
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classOfferingId: 'class-id', status: 'ACTIVE' }),
      }),
    );
  });

  it.each([
    [EnrollmentStatus.ACTIVE, EnrollmentStatus.DROPPED],
    [EnrollmentStatus.ACTIVE, EnrollmentStatus.CANCELLED],
    [EnrollmentStatus.PENDING_PAYMENT, EnrollmentStatus.CANCELLED],
  ])('allows roster transition %s → %s and refreshes capacity truth', async (from, to) => {
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-id', status: from });
    prisma.enrollment.updateMany.mockResolvedValue({ count: 1 });
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'enrollment-id', status: to });
    await expect(
      service.updateRosterStatus('class-id', 'enrollment-id', { status: to } as never),
    ).resolves.toMatchObject({ enrollment: { status: to }, classOffering: { registeredCount: 2 } });
  });

  it('rejects payment/completion bypasses and cross-class enrollment IDs', async () => {
    prisma.enrollment.findFirst.mockResolvedValue({
      id: 'enrollment-id',
      status: EnrollmentStatus.PENDING_PAYMENT,
    });
    await expect(
      service.updateRosterStatus('class-id', 'enrollment-id', {
        status: EnrollmentStatus.ACTIVE,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.enrollment.findFirst.mockResolvedValue(null);
    await expect(
      service.updateRosterStatus('class-id', 'other-class-enrollment', {
        status: EnrollmentStatus.CANCELLED,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
