import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  it('excludes private instructor notes from student responses while retaining them for instructor', async () => {
    const row = {
      id: 'request',
      topic: 'Kế hoạch học',
      status: ConsultationStatus.CONFIRMED,
      instructorNote: 'Ghi chú riêng',
    };
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment',
          status: 'ACTIVE',
          classOffering: { instructorId: 'instructor' },
        }),
      },
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'class' }) },
      consultationRequest: {
        findMany: jest
          .fn()
          .mockImplementation(({ select }) =>
            Promise.resolve([
              select
                ? Object.fromEntries(
                    Object.entries(row).filter(([key]) => key !== 'instructorNote'),
                  )
                : row,
            ]),
          ),
      },
    };
    const service = new ConsultationsService(prisma as unknown as PrismaService);
    const studentRows = await service.listMine('learner', 'enrollment');
    const instructorRows = await service.listForInstructor('instructor', 'class');
    expect(studentRows[0]).not.toHaveProperty('instructorNote');
    expect(instructorRows[0]).toHaveProperty('instructorNote', 'Ghi chú riêng');
    expect(prisma.consultationRequest.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'instructorNote',
    );
  });

  it('rejects a duplicate transition race using the prior status and updatedAt', async () => {
    const updatedAt = new Date('2026-10-24T00:00:00Z');
    const prisma = {
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'class' }) },
      consultationRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'request',
          instructorId: 'instructor',
          status: ConsultationStatus.REQUESTED,
          updatedAt,
          confirmedStartAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ConsultationsService(prisma as unknown as PrismaService);
    await expect(
      service.update('instructor', 'class', 'request', {
        status: ConsultationStatus.CONFIRMED,
        confirmedStartAt: '2026-10-25T10:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.consultationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ConsultationStatus.REQUESTED, updatedAt }),
      }),
    );
  });

  it('enforces learner ownership before creating or reading a thread', async () => {
    const prisma = { enrollment: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new ConsultationsService(prisma as unknown as PrismaService);

    await expect(service.studentThread('learner-a', 'enrollment-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'enrollment-b', learnerId: 'learner-a' } }),
    );
  });

  it('sends trimmed messages for active enrollment and rejects completed enrollment sends', async () => {
    const prisma = {
      enrollment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'enrollment',
            status: EnrollmentStatus.ACTIVE,
            classOffering: { instructorId: 'instructor' },
          })
          .mockResolvedValueOnce({
            id: 'enrollment',
            status: EnrollmentStatus.COMPLETED,
            classOffering: { instructorId: 'instructor' },
          }),
      },
      consultationThread: {
        upsert: jest.fn().mockResolvedValue({ id: 'thread' }),
      },
      consultationMessage: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'message', ...data })),
      },
    };
    const service = new ConsultationsService(prisma as unknown as PrismaService);

    await expect(
      service.sendStudentMessage('learner', 'enrollment', '  Em cần hỗ trợ  '),
    ).resolves.toMatchObject({ body: 'Em cần hỗ trợ' });
    expect(prisma.consultationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { threadId: 'thread', senderId: 'learner', body: 'Em cần hỗ trợ' },
      }),
    );
    await expect(
      service.sendStudentMessage('learner', 'enrollment', 'Tin nhắn mới'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns chronological messages, integrated appointments and unread count without private notes', async () => {
    const createdAt = new Date('2026-10-25T01:00:00Z');
    const prisma = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment',
          status: EnrollmentStatus.ACTIVE,
          classOffering: {
            id: 'class',
            name: 'Class',
            code: 'A01',
            instructorId: 'instructor',
            instructor: { id: 'instructor', fullName: 'Teacher', avatarKey: null },
          },
        }),
      },
      consultationThread: {
        upsert: jest.fn().mockResolvedValue({
          id: 'thread',
          learnerLastReadAt: new Date('2026-10-25T00:00:00Z'),
        }),
      },
      consultationMessage: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'one', senderId: 'learner', body: 'Question', createdAt },
          {
            id: 'two',
            senderId: 'instructor',
            body: 'Answer',
            createdAt: new Date('2026-10-25T02:00:00Z'),
          },
        ]),
      },
      consultationRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'appointment',
            status: ConsultationStatus.CONFIRMED,
            meetingUrl: 'https://meet.example.com/consultation',
          },
        ]),
      },
    };
    const service = new ConsultationsService(prisma as unknown as PrismaService);
    const result = await service.studentThread('learner', 'enrollment');

    expect(prisma.consultationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
    expect(result.unreadCount).toBe(1);
    expect(result.appointments[0]).toMatchObject({ id: 'appointment' });
    expect(result.appointments[0]).not.toHaveProperty('instructorNote');
  });
});
