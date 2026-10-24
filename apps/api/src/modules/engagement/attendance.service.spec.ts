import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/prisma/client';
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
        create: expect.objectContaining({ status: AttendanceStatus.LATE, note: 'Đến muộn' }),
        update: expect.objectContaining({ status: AttendanceStatus.LATE, note: 'Đến muộn' }),
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
