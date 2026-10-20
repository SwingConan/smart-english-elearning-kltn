import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ClassModality, ClassOfferingStatus, PricingType } from '../../../generated/prisma/client';

export class AdminClassOfferingQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsEnum(ClassOfferingStatus)
  status?: ClassOfferingStatus;

  @IsOptional()
  @IsEnum(ClassModality)
  modality?: ClassModality;

  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
