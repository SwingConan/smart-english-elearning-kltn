import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ToeicSkill } from '../../../generated/prisma/client';
import { LESSON_TASK_CODES } from '../lesson-curriculum';

export class CreateLessonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
      : value,
  )
  learningObjectives?: string[];

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(30_000)
  contentMarkdown?: string | null;

  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(5)
  @Max(180)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ToeicSkill, { each: true })
  focusSkills?: ToeicSkill[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LESSON_TASK_CODES, { each: true })
  focusTaskCodes?: string[];
}
