import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassModality,
  ClassOfferingStatus,
  PricingType,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateClassOfferingDto } from './dto/create-class-offering.dto';
import { UpdateClassOfferingDto } from './dto/update-class-offering.dto';

interface OfferingRules {
  pricingType: PricingType;
  tuitionFeeVnd?: number | null;
  maxStudents?: number | null;
  enrollmentStart?: Date | null;
  enrollmentEnd?: Date | null;
  classStart?: Date | null;
  classEnd?: Date | null;
}

const adminOfferingInclude = {
  course: { select: { id: true, title: true, slug: true } },
  instructor: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class ClassOfferingsService {
  constructor(private readonly prisma: PrismaService) {}

  listAdmin() {
    return this.prisma.classOffering.findMany({
      include: adminOfferingInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreateClassOfferingDto) {
    await this.validateCourse(input.courseId);
    await this.validateInstructor(input.instructorId);

    const pricingType = input.pricingType ?? PricingType.FREE;
    this.validateRules({ ...input, pricingType });

    return this.prisma.classOffering.create({
      data: {
        courseId: input.courseId,
        instructorId: input.instructorId,
        code: input.code?.trim() || this.createCompatibilityCode(),
        name: input.name.trim(),
        status: input.status ?? ClassOfferingStatus.DRAFT,
        modality: input.modality ?? ClassModality.ONLINE,
        pricingType,
        tuitionFeeVnd: input.tuitionFeeVnd,
        maxStudents: input.maxStudents,
        totalSessions: input.totalSessions,
        totalPeriods: input.totalPeriods,
        enrollmentStart: input.enrollmentStart,
        enrollmentEnd: input.enrollmentEnd,
        classStart: input.classStart,
        classEnd: input.classEnd,
      },
      include: adminOfferingInclude,
    });
  }

  async update(id: string, input: UpdateClassOfferingDto) {
    const current = await this.prisma.classOffering.findUnique({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('Class offering not found');
    }

    if (input.courseId !== undefined) {
      await this.validateCourse(input.courseId);
    }
    if (input.instructorId !== undefined) {
      await this.validateInstructor(input.instructorId);
    }

    this.validateRules({
      pricingType: input.pricingType ?? current.pricingType,
      tuitionFeeVnd:
        input.tuitionFeeVnd !== undefined ? input.tuitionFeeVnd : current.tuitionFeeVnd,
      maxStudents: input.maxStudents !== undefined ? input.maxStudents : current.maxStudents,
      enrollmentStart:
        input.enrollmentStart !== undefined ? input.enrollmentStart : current.enrollmentStart,
      enrollmentEnd:
        input.enrollmentEnd !== undefined ? input.enrollmentEnd : current.enrollmentEnd,
      classStart: input.classStart !== undefined ? input.classStart : current.classStart,
      classEnd: input.classEnd !== undefined ? input.classEnd : current.classEnd,
    });

    return this.prisma.classOffering.update({
      where: { id },
      data: {
        ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        ...(input.instructorId !== undefined ? { instructorId: input.instructorId } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.code !== undefined ? { code: input.code.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.modality !== undefined ? { modality: input.modality } : {}),
        ...(input.pricingType !== undefined ? { pricingType: input.pricingType } : {}),
        ...(input.tuitionFeeVnd !== undefined ? { tuitionFeeVnd: input.tuitionFeeVnd } : {}),
        ...(input.maxStudents !== undefined ? { maxStudents: input.maxStudents } : {}),
        ...(input.totalSessions !== undefined ? { totalSessions: input.totalSessions } : {}),
        ...(input.totalPeriods !== undefined ? { totalPeriods: input.totalPeriods } : {}),
        ...(input.enrollmentStart !== undefined ? { enrollmentStart: input.enrollmentStart } : {}),
        ...(input.enrollmentEnd !== undefined ? { enrollmentEnd: input.enrollmentEnd } : {}),
        ...(input.classStart !== undefined ? { classStart: input.classStart } : {}),
        ...(input.classEnd !== undefined ? { classEnd: input.classEnd } : {}),
      },
      include: adminOfferingInclude,
    });
  }

  private async validateCourse(courseId: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) {
      throw new BadRequestException('Course does not exist');
    }
  }

  private async validateInstructor(instructorId: string | null | undefined): Promise<void> {
    if (!instructorId) {
      return;
    }

    const instructor = await this.prisma.user.findUnique({
      where: { id: instructorId },
      select: { role: true },
    });
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      throw new BadRequestException('Assigned user must be an instructor');
    }
  }

  private validateRules(input: OfferingRules): void {
    if (
      input.pricingType === PricingType.FREE &&
      input.tuitionFeeVnd !== undefined &&
      input.tuitionFeeVnd !== null &&
      input.tuitionFeeVnd !== 0
    ) {
      throw new BadRequestException('A free offering cannot have tuition');
    }

    if (
      input.pricingType === PricingType.PAID &&
      (input.tuitionFeeVnd === undefined ||
        input.tuitionFeeVnd === null ||
        input.tuitionFeeVnd <= 0)
    ) {
      throw new BadRequestException('A paid offering requires positive tuition');
    }

    if (input.maxStudents !== undefined && input.maxStudents !== null) {
      if (!Number.isInteger(input.maxStudents) || input.maxStudents <= 0) {
        throw new BadRequestException('maxStudents must be a positive integer');
      }
    }

    if (
      input.enrollmentStart &&
      input.enrollmentEnd &&
      input.enrollmentStart > input.enrollmentEnd
    ) {
      throw new BadRequestException('enrollmentStart must be before or equal to enrollmentEnd');
    }

    if (input.classStart && input.classEnd && input.classStart >= input.classEnd) {
      throw new BadRequestException('classStart must be before classEnd');
    }
  }

  private createCompatibilityCode(): string {
    return `CLS-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
  }
}
