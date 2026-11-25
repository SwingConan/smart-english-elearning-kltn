import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { W07_CONSENT } from './admissions-finance.policy';
export class W07Key {
  @IsUUID() key!: string;
}
export class W07Reason extends W07Key {
  @IsString() @IsNotEmpty() @Matches(/\S/u) @MaxLength(1000) reason!: string;
}
export class W07ApplyDto extends W07Key {
  @IsUUID() classId!: string;
  @IsOptional() @IsUUID() referralId?: string;
  @IsBoolean() @Equals(true) consent!: true;
  @IsIn([W07_CONSENT, 'W07_DEC071_ADMISSION_V1']) consentVersion!: string;
}
export class W07AcademicDto extends W07Reason {
  @IsIn(['APPROVE', 'REJECT', 'CANCEL']) decision!: 'APPROVE' | 'REJECT' | 'CANCEL';
  @IsInt() @Min(0) expectedVersion!: number;
  @IsOptional() @IsUUID() caseId?: string;
}
export class W07UploadDto extends W07Key {
  @IsString() @Matches(/^[1-9]\d{0,9}$/) amountVnd!: string;
  @IsString() @Matches(/^TEST-[A-Z0-9_-]{6,70}$/) sourceRef!: string;
  @Equals('true') synthetic!: string;
}
export class W07VerifyDto extends W07Reason {
  @IsIn(['VERIFY', 'REJECT']) decision!: 'VERIFY' | 'REJECT';
}
export class W07AdjustmentDto extends W07Reason {
  @IsIn(['REVERSAL', 'REFUND', 'ADJUSTMENT']) kind!: string;
  @IsInt() @Min(1) @Max(2147483647) amountVnd!: number;
  @IsString() @IsNotEmpty() @Matches(/\S/u) @MaxLength(2000) evidence!: string;
}
export class W07AdjustmentDecisionDto extends W07Reason {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
}
export class W07CaseDto extends W07Reason {
  @IsIn(['WITHDRAW', 'TRANSFER']) kind!: string;
  @IsOptional() @IsUUID() targetClassId?: string;
}
