import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { QuestionDifficulty, QuestionResponseType, ToeicSkill } from '../../../generated/prisma/client';

export class QuestionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ToeicSkill)
  skill?: ToeicSkill;

  @IsOptional()
  @IsEnum(QuestionResponseType)
  responseType?: QuestionResponseType;

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty;

  @IsOptional()
  @IsIn(['ALL', 'USED', 'UNUSED'])
  usage: 'ALL' | 'USED' | 'UNUSED' = 'ALL';
}
