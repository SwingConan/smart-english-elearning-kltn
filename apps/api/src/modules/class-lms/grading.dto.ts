import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class GradingRequestDto {
  @IsUUID() idempotencyKey!: string;
}
export class GradingTransitionDto extends GradingRequestDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class AssignmentCriterionDto {
  @IsString() @IsNotEmpty() @MaxLength(250) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) description!: string;
  @IsString() @Matches(/^\d{1,6}(?:\.\d{1,2})?$/) maxScore!: string;
}
export class AssignmentRubricDto extends GradingRequestDto {
  @IsInt() @Min(0) expectedPreviousVersion!: number;
  @IsString() @IsNotEmpty() @MaxLength(250) name!: string;
  @IsString() @MaxLength(5000) description = '';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AssignmentCriterionDto)
  criteria!: AssignmentCriterionDto[];
}
export class EditAssignmentRubricDto extends AssignmentRubricDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class AssignmentScoreDto {
  @IsUUID() criterionId!: string;
  @IsString() @Matches(/^\d{1,6}(?:\.\d{1,2})?$/) score!: string;
  @IsString() @MaxLength(5000) feedback = '';
}
export class AssignmentGradeDto extends GradingRequestDto {
  @IsInt() @Min(0) expectedPreviousVersion!: number;
  @IsUUID() rubricId!: string;
  @IsString() @MaxLength(1000) reason = '';
  @IsString() @MaxLength(10000) feedback = '';
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((s: AssignmentScoreDto) => s.criterionId)
  @ValidateNested({ each: true })
  @Type(() => AssignmentScoreDto)
  scores!: AssignmentScoreDto[];
}
export class EditAssignmentGradeDto extends AssignmentGradeDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
