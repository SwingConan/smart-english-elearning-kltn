import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class AssignmentDraftDto {
  @IsUUID() revisionId!: string;
  @Type(() => Number) @IsInt() @Min(0) expectedLockVersion!: number;
  @IsString() @MaxLength(100000) text!: string;
}
export class AssignmentSubmitDto {
  @IsUUID() revisionId!: string;
  @IsInt() @Min(1) expectedLockVersion!: number;
  @IsUUID() idempotencyKey!: string;
}
