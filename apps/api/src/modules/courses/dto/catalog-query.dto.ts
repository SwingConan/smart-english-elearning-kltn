import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CourseSkillScope } from '../../../generated/prisma/client';

export class CatalogQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  level?: string;

  @IsOptional()
  @IsEnum(CourseSkillScope)
  skillScope?: CourseSkillScope;

  @IsOptional()
  @IsIn(['OPEN'])
  availability?: 'OPEN';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 12;
}
