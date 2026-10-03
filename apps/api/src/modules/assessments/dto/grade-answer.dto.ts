import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RubricCriterionGradeDto {
  @IsUUID()
  rubricCriterionId: string;

  @IsString()
  score: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  feedback?: string | null;
}

export class GradeProductiveAnswerDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionGradeDto)
  criteria: RubricCriterionGradeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  feedback?: string | null;

  @IsBoolean()
  finalize: boolean;

  @IsOptional()
  @IsBoolean()
  editFinal?: boolean;
}
