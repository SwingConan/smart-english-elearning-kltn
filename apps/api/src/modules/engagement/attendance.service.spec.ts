import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AttendanceStatus, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AttendanceService } from './attendance.service';

function setup(validEnrollmentCount: number) {
  const records: unknown[] = [];
  const tx = {
    $queryRaw: jest.fn(),
    attendanceSession: {
      findFirst: jest.fn().mockResolvedValue({ id: 'session' }),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: 'session', records })),
    },
    enrollment: { count: jest.fn().mockResolvedValue(validEnrollmentCount) },
    attendanceRecord: {
      upsert: jest.fn().mockImplementation(({ create }) => {
        records.push(create);
        return Promise.resolve(create);
      }),
      deleteMany: jest.fn().mockImplementation(({ where }) => {
        const clearIds = where.enrollmentId.in as string[];
        const before = records.length;
        for (let index = records.length - 1; index >= 0; index -= 1) {
          if (clearIds.includes((records[index] as { enrollmentId: string }).enrollmentId))
            records.splice(index, 1);
        }
        return Promise.resolve({ count: before - records.length });
      }),
    },
  };
  const prisma = {
    classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'class' }) },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  return { service: new AttendanceService(prisma as unknown as PrismaService), tx, records };
}

describe('AttendanceService explicit clear contract', () => {
  it('clears an existing PRESENT record and returns persisted empty state', async () => {
    const { service, tx, records } = setup(1);
    records.push({ enrollmentId: 'learner-a', status: AttendanceStatus.PRESENT });
    const result = await service.putRecords('instructor', 'class', 'session', {
      records: [],
      clearEnrollmentIds: ['learner-a'],
    });
    expect(tx.attendanceRecord.deleteMany).toHaveBeenCalledWith({
      where: { attendanceSessionId: 'session', enrollmentId: { in: ['learner-a'] } },
    });
    expect(result.session.records).toEqual([]);
  });

  it('leaves an omitted existing row unchanged', async () => {
    const { service, tx, records } = setup(0);
    records.push({ enrollmentId: 'learner-a', status: AttendanceStatus.PRESENT });
    const result = await service.putRecords('instructor', 'class', 'session', { records: [] });
    expect(tx.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(tx.attendanceRecord.deleteMany).not.toHaveBeenCalled();
    expect(result.session.records).toHaveLength(1);
  });

  it('clears learner A without affecting learner B', async () => {
    const { service, records } = setup(1);
    records.push(
      { enrollmentId: 'learner-a', status: AttendanceStatus.PRESENT },
      { enrollmentId: 'learner-b', status: AttendanceStatus.ABSENT },
    );
    const result = await service.putRecords('instructor', 'class', 'session', {
      records: [],
      clearEnrollmentIds: ['learner-a'],
    });
    expect(result.session.records).toEqual([
      { enrollmentId: 'learner-b', status: AttendanceStatus.ABSENT },
    ]);
  });

  it('upserts a submitted status and trimmed note', async () => {
    const { service, tx } = setup(1);
    await service.putRecords('instructor', 'class', 'session', {
      records: [{ enrollmentId: 'learner-a', status: AttendanceStatus.LATE, note: '  Đến muộn  ' }],
      clearEnrollmentIds: [],
    });
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: AttendanceStatus.LATE,
          note: 'Đến muộn',
          source: 'INSTRUCTOR',
          checkedInAt: null,
        }),
        update: expect.objectContaining({
          status: AttendanceStatus.LATE,
          note: 'Đến muộn',
          source: 'INSTRUCTOR',
          checkedInAt: null,
        }),
      }),
    );
  });

  it('rejects a clear enrollment that does not belong to the class', async () => {
    const { service, tx } = setup(0);
    await expect(
      service.putRecords('instructor', 'class', 'session', {
        records: [],
        clearEnrollmentIds: ['other-class-enrollment'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.attendanceRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an enrollment duplicated between upsert and clear lists', async () => {
    const { service } = setup(1);
    await expect(
      service.putRecords('instructor', 'class', 'session', {
        records: [{ enrollmentId: 'learner-a', status: AttendanceStatus.PRESENT }],
        clearEnrollmentIds: ['learner-a'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AttendanceService learner self-check-in', () => {
  let accessCodeHash: string;

  beforeAll(async () => {
    accessCodeHash = await argon2.hash('246810');
  });

  function learnerSetup(options?: {
    enrollment?: { id: string; status: EnrollmentStatus; classOfferingId: string } | null;
    session?: Record<string, unknown> | null;
    existing?: Record<string, unknown> | null;
  }) {
    const now = Date.now();
    const enrollment =
      options && 'enrollment' in options
        ? options.enrollment
        : { id: 'enrollment', status: EnrollmentStatus.ACTIVE, classOfferingId: 'class' };
    const session =
      options && 'session' in options
        ? options.session
        : {
            id: 'session',
            classOfferingId: 'class',
            selfCheckInEnabled: true,
            opensAt: new Date(now - 60_000),
            closesAt: new Date(now + 60_000),
            closedAt: null,
            accessCodeHash: null,
          };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'session' }]),
      attendanceSession: { findFirst: jest.fn().mockResolvedValue(session) },
      attendanceRecord: {
        findUnique: jest.fn().mockResolvedValue(options?.existing ?? null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'record', ...data })),
      },
    };
    const prisma = {
      enrollment: { findFirst: jest.fn().mockResolvedValue(enrollment) },
      attendanceSession: { findMany: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return { service: new AttendanceService(prisma as unknown as PrismaService), prisma, tx };
  }

  it.each([
    ['before open', new Date(Date.now() + 60_000), new Date(Date.now() + 120_000)],
    ['after close', new Date(Date.now() - 120_000), new Date(Date.now() - 60_000)],
  ])('rejects check-in %s using server time', async (_label, opensAt, closesAt) => {
    const { service } = learnerSetup({
      session: {
        id: 'session',
        selfCheckInEnabled: true,
        opensAt,
        closesAt,
        closedAt: null,
        accessCodeHash: null,
      },
    });
    await expect(service.checkIn('learner', 'enrollment', 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires and verifies an Argon2 access code when configured', async () => {
    const session = {
      id: 'session',
      selfCheckInEnabled: true,
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 60_000),
      closedAt: null,
      accessCodeHash,
    };
    const missing = learnerSetup({ session });
    const wrong = learnerSetup({ session });
    const correct = learnerSetup({ session });

    await expect(
      missing.service.checkIn('learner', 'enrollment', 'session'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      wrong.service.checkIn('learner', 'enrollment', 'session', '000000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      correct.service.checkIn('learner', 'enrollment', 'session', ' 246810 '),
    ).resolves.toMatchObject({
      idempotent: false,
      record: { status: 'PRESENT', source: 'SELF_CHECK_IN', recordedById: 'learner' },
    });
  });

  it('returns an existing learner check-in idempotently without rewriting it', async () => {
    const existing = { id: 'record', status: 'PRESENT', source: 'SELF_CHECK_IN' };
    const { service, tx } = learnerSetup({ existing });
    await expect(service.checkIn('learner', 'enrollment', 'session')).resolves.toEqual({
      idempotent: true,
      record: existing,
    });
    expect(tx.attendanceRecord.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['ABSENT', 'PRESENT'])('rejects learner overwrite of instructor %s', async (status) => {
    const existing = { id: 'record', status, source: 'INSTRUCTOR' };
    const { service, tx } = learnerSetup({
      existing,
      session: {
        id: 'session',
        selfCheckInEnabled: true,
        opensAt: new Date(Date.now() - 60_000),
        closesAt: new Date(Date.now() + 60_000),
        closedAt: null,
        accessCodeHash,
      },
    });

    await expect(service.checkIn('learner', 'enrollment', 'session')).rejects.toThrow(
      'Giảng viên đã ghi nhận điểm danh',
    );
    expect(tx.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it('locks the session and uses a serializable transaction before creating a learner record', async () => {
    const { service, prisma, tx } = learnerSetup();
    await service.checkIn('learner', 'enrollment', 'session');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.attendanceRecord.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.attendanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'SELF_CHECK_IN', status: 'PRESENT' }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('retries a serializable write conflict before creating the learner record', async () => {
    const { service, prisma, tx } = learnerSetup();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });

    await expect(service.checkIn('learner', 'enrollment', 'session')).resolves.toMatchObject({
      idempotent: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.attendanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it('denies cross-enrollment check-in before resolving a session', async () => {
    const { service, prisma } = learnerSetup({ enrollment: null });
    await expect(service.checkIn('learner-a', 'enrollment-b', 'session')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps legacy instructor records readable without treating missing as absent', async () => {
    const legacyRecord = { id: 'legacy', status: 'PRESENT', source: 'INSTRUCTOR' };
    const { service, prisma } = learnerSetup();
    prisma.attendanceSession.findMany.mockResolvedValue([
      {
        id: 'session',
        accessCodeHash: null,
        opensAt: null,
        closesAt: null,
        closedAt: null,
        records: [legacyRecord],
      },
      {
        id: 'unmarked',
        accessCodeHash: null,
        opensAt: null,
        closesAt: null,
        closedAt: null,
        records: [],
      },
    ]);

    const result = await service.studentAttendance('learner', 'enrollment');
    expect(result[0]).toMatchObject({ record: legacyRecord, state: 'CHECKED_IN' });
    expect(result[1]).toMatchObject({ record: null, state: 'UNAVAILABLE' });
  });
});
