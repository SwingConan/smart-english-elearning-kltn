import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassModality, EnrollmentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class VirtualClassroomService {
  constructor(private readonly prisma: PrismaService) {}

  async get(learnerId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        learnerId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: {
        id: true,
        status: true,
        classOffering: {
          select: {
            id: true,
            name: true,
            code: true,
            modality: true,
            classStart: true,
            classEnd: true,
            instructor: { select: { fullName: true } },
            scheduleSlots: {
              select: {
                id: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                meetingUrl: true,
                locationText: true,
              },
              orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException('Accessible enrollment not found');
    if (
      enrollment.classOffering.modality !== ClassModality.ONLINE &&
      enrollment.classOffering.modality !== ClassModality.HYBRID
    )
      throw new BadRequestException('This class has no virtual classroom');
    return enrollment;
  }
}
