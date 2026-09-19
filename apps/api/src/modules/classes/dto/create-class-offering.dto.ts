import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ClassOfferingStatus,
  PricingType,
} from '../../../generated/prisma/client';

export class CreateClassOfferingDto {
  @IsUUID()
  courseId: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsEnum(ClassOfferingStatus)
  status?: ClassOfferingStatus;

  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuitionFeeVnd?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  enrollmentStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  enrollmentEnd?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  classStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  classEnd?: Date | null;
}
