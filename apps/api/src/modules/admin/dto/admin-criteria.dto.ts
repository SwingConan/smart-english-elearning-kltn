import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CriterionRuleMode, ToeicSkill } from '../../../generated/prisma/client';

export class UpdatePlacementEvaluationCriteriaDto {
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  foundationUpperBoundary!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  advancingLowerBoundary!: number;
}

export enum CourseRecommendationProfileState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UNCONFIGURED = 'UNCONFIGURED',
}

export class AdminCourseRecommendationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsEnum(CourseRecommendationProfileState)
  profileState?: CourseRecommendationProfileState;

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

export class CourseRecommendationCriterionDto {
  @IsEnum(ToeicSkill)
  @IsIn([ToeicSkill.LISTENING, ToeicSkill.READING])
  skill!: Extract<ToeicSkill, 'LISTENING' | 'READING'>;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  minNormalizedScore!: number | null;

  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxNormalizedScore!: number | null;
}

export class UpdateCourseRecommendationProfileDto {
  @IsBoolean()
  isActive!: boolean;

  @IsEnum(CriterionRuleMode)
  @IsIn([CriterionRuleMode.ALL, CriterionRuleMode.ANY])
  ruleMode!: CriterionRuleMode;

  @IsInt()
  @Min(0)
  @Max(10_000)
  priority!: number;

  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => CourseRecommendationCriterionDto)
  criteria!: CourseRecommendationCriterionDto[];
}
