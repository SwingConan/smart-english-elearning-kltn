import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class QuizRequestDto {
  @IsUUID() idempotencyKey!: string;
}
export class QuizTransitionDto extends QuizRequestDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class QuizOptionDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) content!: string;
  @IsBoolean() isCorrect!: boolean;
}
export class QuizQuestionDto {
  @IsString() @IsNotEmpty() @MaxLength(10000) content!: string;
  @IsString() @MaxLength(10000) explanation = '';
  @IsInt() @Min(1) @Max(1000) points!: number;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => QuizOptionDto)
  options!: QuizOptionDto[];
}
export class QuizSourceDto extends QuizRequestDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsInt() @Min(0) expectedLockVersion?: number;
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) openAt!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) closeAt!: string;
  @IsInt() @Min(5) @Max(120) durationMinutes!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}
export class QuizStartDto extends QuizRequestDto {
  @IsUUID() sourceId!: string;
}
export class QuizAnswerDto {
  @IsUUID() questionId!: string;
  @IsOptional() @IsUUID() optionId?: string | null;
}
export class QuizSaveDto extends QuizTransitionDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((x: QuizAnswerDto) => x.questionId)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) marked!: string[];
}
