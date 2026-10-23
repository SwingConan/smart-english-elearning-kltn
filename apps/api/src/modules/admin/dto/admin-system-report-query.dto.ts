import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ClassOfferingStatus, EnrollmentStatus } from '../../../generated/prisma/client';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AdminSystemReportQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}

class PaginatedReportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminReportClassesQueryDto extends PaginatedReportQueryDto {
  @IsOptional()
  @IsEnum(ClassOfferingStatus)
  status?: ClassOfferingStatus;

  @IsOptional()
  @IsIn(['READY', 'NOT_READY'])
  readiness?: 'READY' | 'NOT_READY';

  @IsOptional()
  @IsIn(['AVAILABLE', 'FULL', 'UPCOMING', 'CLOSED'])
  registrationState?: 'AVAILABLE' | 'FULL' | 'UPCOMING' | 'CLOSED';
}

export class AdminReportEnrollmentsQueryDto extends PaginatedReportQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;

  @IsOptional()
  @IsUUID()
  classOfferingId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}

export class AdminReportGradingBacklogQueryDto extends PaginatedReportQueryDto {
  @IsOptional()
  @IsUUID()
  classOfferingId?: string;

  @IsOptional()
  @IsUUID()
  classAssessmentId?: string;
}
