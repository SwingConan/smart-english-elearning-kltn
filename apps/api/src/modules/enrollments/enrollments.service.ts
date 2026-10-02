import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassOfferingStatus,
  EnrollmentStatus,
  PricingType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { computeRegistrationState } from '../classes/registration-state';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';

const MAX_TRANSACTION_ATTEMPTS = 3;

const enrollmentViewSelect = {
  id: true,
  status: true,
  enrolledAt: true,
  updatedAt: true,
  lessonProgress: {
    where: { status: 'COMPLETED' as const },
    select: { id: true },
  },
  classOffering: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      modality: true,
      pricingType: true,
      tuitionFeeVnd: true,
      classStart: true,
      classEnd: true,
      instructor: { select: { id: true, fullName: true } },
      scheduleSlots: {
        orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          locationText: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          level: true,
          skillScope: true,
          thumbnailUrl: true,
          modules: {
            select: {
              lessons: { select: { id: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentSelect;

type EnrollmentViewRow = Prisma.EnrollmentGetPayload<{
  select: typeof enrollmentViewSelect;
}>;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(learnerId: string, input: CreateEnrollmentDto) {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const offering = await transaction.classOffering.findUnique({
              where: { id: input.classOfferingId },
              select: {
                id: true,
                status: true,
                pricingType: true,
                maxStudents: true,
                enrollmentStart: true,
                enrollmentEnd: true,
                course: { select: { isPublished: true } },
              },
            });

            if (!offering) {
              throw new NotFoundException('Class offering not found');
            }

            this.validateAvailability(offering, new Date());

            const existing = await transaction.enrollment.findUnique({
              where: {
                learnerId_classOfferingId: {
                  learnerId,
                  classOfferingId: offering.id,
                },
              },
              select: { id: true },
            });
            if (existing) {
              throw new ConflictException('You are already enrolled in this class offering');
            }

            const enrollmentStatus =
              offering.pricingType === PricingType.FREE
                ? EnrollmentStatus.ACTIVE
                : EnrollmentStatus.PENDING_PAYMENT;

            if (enrollmentStatus === EnrollmentStatus.ACTIVE && offering.maxStudents !== null) {
              const activeCount = await transaction.enrollment.count({
                where: {
                  classOfferingId: offering.id,
                  status: EnrollmentStatus.ACTIVE,
                },
              });
              if (activeCount >= offering.maxStudents) {
                throw new ConflictException('Class offering is full');
              }
            }

            const enrollment = await transaction.enrollment.create({
              data: {
                learnerId,
                classOfferingId: offering.id,
                status: enrollmentStatus,
              },
              select: enrollmentViewSelect,
            });
            return this.mapEnrollment(enrollment);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        if (this.isPrismaError(error, 'P2002')) {
          throw new ConflictException('You are already enrolled in this class offering');
        }

        if (this.isPrismaError(error, 'P2034')) {
          if (attempt < MAX_TRANSACTION_ATTEMPTS) {
            continue;
          }
          throw new ConflictException(
            'Enrollment conflicted with another request; please try again',
          );
        }

        throw error;
      }
    }

    throw new ConflictException('Enrollment could not be completed');
  }

  async listMine(learnerId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { learnerId },
      select: enrollmentViewSelect,
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map((enrollment) => this.mapEnrollment(enrollment));
  }

  async getMineById(learnerId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, learnerId },
      select: enrollmentViewSelect,
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    return this.mapEnrollment(enrollment);
  }

  private validateAvailability(
    offering: {
      status: ClassOfferingStatus;
      enrollmentStart: Date | null;
      enrollmentEnd: Date | null;
      course: { isPublished: boolean };
    },
    now: Date,
  ): void {
    const { registrationState } = computeRegistrationState({
      status: offering.status,
      courseIsPublished: offering.course.isPublished,
      enrollmentStart: offering.enrollmentStart,
      enrollmentEnd: offering.enrollmentEnd,
      maxStudents: null,
      registeredCount: 0,
      now,
    });
    if (registrationState === 'UPCOMING') {
      throw new BadRequestException('Enrollment has not opened yet');
    }
    if (registrationState === 'CLOSED') {
      if (offering.enrollmentEnd && now > offering.enrollmentEnd) {
        throw new BadRequestException('Enrollment has closed');
      }
      throw new BadRequestException('Class offering is not available');
    }
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private mapEnrollment(enrollment: EnrollmentViewRow) {
    const course = enrollment.classOffering.course;
    const modules = course?.modules ?? [];
    const completedProgress = enrollment.lessonProgress ?? [];
    const totalLessons = modules.reduce((total, module) => total + module.lessons.length, 0);
    const completedLessons = completedProgress.length;
    const progressPercent =
      totalLessons === 0 ? 0 : Math.min(100, Math.round((completedLessons / totalLessons) * 100));

    return {
      ...enrollment,
      classOffering: {
        ...enrollment.classOffering,
        ...(course ? { course: { ...course, modules: undefined } } : {}),
      },
      lessonProgress: undefined,
      progress: { totalLessons, completedLessons, progressPercent },
    };
  }
}
