import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import {
  QuestionDifficulty,
  QuestionResponseType,
  ToeicSkill,
} from '../../../generated/prisma/client';

export class QuestionOptionInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsEnum(QuestionResponseType)
  type: QuestionResponseType;

  @IsEnum(ToeicSkill)
  toeicSkill: ToeicSkill;

  @IsEnum(QuestionDifficulty)
  difficulty: QuestionDifficulty;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  explanation?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];

  @IsOptional()
  @IsUUID()
  rubricId?: string | null;
}
