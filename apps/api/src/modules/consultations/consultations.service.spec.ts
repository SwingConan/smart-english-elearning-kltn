import { ConflictException } from '@nestjs/common';
import { ConsultationStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  it('rejects a duplicate transition race using the prior status and updatedAt', async () => {
    const updatedAt = new Date('2026-10-24T00:00:00Z');
    const prisma = {
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'class' }) },
      consultationRequest: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
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
});
