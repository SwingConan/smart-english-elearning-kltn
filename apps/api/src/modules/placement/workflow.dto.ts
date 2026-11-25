import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PlacementPreviewStartDto,
  PlacementPreviewCommandDto,
  PlacementPreviewAnswerDto,
} from './integration.dto';
import { Type } from 'class-transformer';
export class WorkflowUploadDto {
  @IsUUID() tabId!: string;
  @IsUUID() token!: string;
  @IsUUID() idempotencyKey!: string;
  @Type(() => Number) @IsInt() @Min(0) expectedLockVersion!: number;
}
export class WorkflowReasonDto {
  @IsUUID() idempotencyKey!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class WorkflowPolicyDto extends WorkflowReasonDto {
  @IsIn(['SOURCE_TIMING', 'RUBRIC', 'CRITERIA']) kind!: 'SOURCE_TIMING' | 'RUBRIC' | 'CRITERIA';
  @IsIn(['LR', 'FOUR_SKILLS']) mode!: 'LR' | 'FOUR_SKILLS';
  @IsOptional() @IsUUID() sourceId?: string;
  @IsObject() body!: Record<string, unknown>;
}
export class WorkflowStartDto extends PlacementPreviewStartDto {
  @IsUUID() policyId!: string;
}
export class WorkflowCommandDto extends PlacementPreviewCommandDto {
  @IsIn(['NEXT', 'BREAK', 'INCIDENT']) action!: 'NEXT' | 'BREAK' | 'INCIDENT';
  @IsOptional() @IsString() @MinLength(10) @MaxLength(500) reason?: string;
}
export class WorkflowAnswerDto extends PlacementPreviewAnswerDto {
  @IsUUID() questionId!: string;
  @IsOptional() @IsBoolean() marked?: boolean;
}
export class WorkflowAssignDto extends WorkflowReasonDto {
  @IsUUID() graderId!: string;
  @IsBoolean() eligibilityConfirmed!: boolean;
}
export class WorkflowEvaluationDto extends WorkflowReasonDto {
  @IsIn(['SPEAKING', 'WRITING']) skill!: 'SPEAKING' | 'WRITING';
  @IsUUID() rubricId!: string;
  @IsInt() @Min(0) @Max(10000) expectedNumber!: number;
  @IsBoolean() originalEvidenceReviewed!: boolean;
  @IsObject() scores!: Record<
    string,
    { code: string; score: number; evidence: string; feedback: string }[]
  >;
}
