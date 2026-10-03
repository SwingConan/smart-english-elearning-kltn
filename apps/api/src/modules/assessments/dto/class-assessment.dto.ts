import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { AssessmentStage } from '../../../generated/prisma/client';

export class CreateClassAssessmentDto {
  @IsUUID()
  testId: string;

  @IsEnum(AssessmentStage)
  stage: AssessmentStage;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  openAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closeAt?: Date | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttemptsOverride?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClassAssessmentDto {
  @IsOptional()
  @IsEnum(AssessmentStage)
  stage?: AssessmentStage;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  openAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closeAt?: Date | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttemptsOverride?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
