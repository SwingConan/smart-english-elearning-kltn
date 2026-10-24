import { AttendanceStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
  it('upserts only submitted learner rows and leaves omitted learners UNMARKED', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue({ id: 'session' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'session', records: [] }),
      },
      enrollment: { count: jest.fn().mockResolvedValue(1) },
      attendanceRecord: { upsert: jest.fn() },
    };
    const prisma = {
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'class' }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new AttendanceService(prisma as unknown as PrismaService);
    await service.putRecords('instructor', 'class', 'session', {
      records: [
        { enrollmentId: 'learner-a', status: AttendanceStatus.PRESENT, note: 'Đến đúng giờ' },
      ],
    });
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attendanceSessionId_enrollmentId: {
            attendanceSessionId: 'session',
            enrollmentId: 'learner-a',
          },
        },
      }),
    );
    expect(tx.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ note: 'Đến đúng giờ' }),
        update: expect.objectContaining({ note: 'Đến đúng giờ' }),
      }),
    );
  });
});
