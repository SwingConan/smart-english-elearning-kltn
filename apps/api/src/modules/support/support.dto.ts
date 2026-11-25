import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ArrayMaxSize,
  IsArray,
} from 'class-validator';
export class SupportKeyDto {
  @IsUUID() idempotencyKey!: string;
}
export class SupportChangeDto extends SupportKeyDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class SupportCreateDto extends SupportKeyDto {
  @IsUUID() topicId!: string;
  @IsString() @MinLength(10) @MaxLength(2000) description!: string;
  @IsBoolean() consent!: boolean;
  @IsIn(['DEV_SUPPORT_V1']) consentVersion!: string;
  @IsIn(['EMAIL', 'IN_APP']) contactMethod!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) guestName?: string;
  @IsOptional() @IsString() @MaxLength(160) contact?: string;
  @IsOptional() @IsString() @MaxLength(0) website?: string;
}
export class SupportTopicDto extends SupportKeyDto {
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/) code!: string;
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(['ACADEMIC', 'FINANCE', 'LEARNING'], { each: true })
  routes!: string[];
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
export class SupportMessageDto extends SupportChangeDto {
  @IsIn(['PUBLIC', 'INTERNAL']) visibility!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}
export class SupportActionDto extends SupportChangeDto {
  @IsIn(['ASSIGN', 'TRANSITION']) action!: string;
  @IsOptional() @IsUUID() targetId?: string;
  @IsOptional()
  @IsIn([
    'TRIAGED',
    'IN_PROGRESS',
    'WAITING_CUSTOMER',
    'WAITING_SPECIALIST',
    'RESOLVED',
    'CLOSED',
    'REOPENED',
  ])
  state?: string;
}
export class SupportReferralDto extends SupportChangeDto {
  @IsIn(['ACADEMIC', 'FINANCE', 'LEARNING']) category!: string;
  @IsUUID() specialistId!: string;
  @IsString() @MinLength(10) @MaxLength(1000) summary!: string;
}
export class SupportReferralReplyDto extends SupportChangeDto {
  @IsString() @MinLength(1) @MaxLength(1500) response!: string;
}
export class SupportConsentDto extends SupportChangeDto {
  @IsIn(['APPLICATION', 'PLACEMENT']) purpose!: string;
  @IsOptional() @IsUUID() attemptId?: string;
  @IsBoolean() granted!: boolean;
}
export class CounselingDraftDto extends SupportChangeDto {
  @IsUUID() reviewerId!: string;
  @IsString() @MinLength(10) @MaxLength(2000) needs!: string;
  @IsString() @MinLength(5) @MaxLength(500) target!: string;
  @IsOptional() @IsInt() @Min(10) @Max(990) goalLR?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) goalSpeaking?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) goalWriting?: number;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() courseVersionId?: string;
  @IsOptional() @IsUUID() placementAttemptId?: string;
}
export class CounselingActionDto extends SupportChangeDto {
  @IsIn(['SUBMIT', 'ACKNOWLEDGE', 'REQUEST_CORRECTION']) action!: string;
}
export class SupportTechnicalEscalationDto extends SupportChangeDto {
  @IsIn([
    'LMS_SUBMISSION_ERROR',
    'PERMISSION_ACCESS',
    'ACCOUNT_LOGIN',
    'PAYMENT_SYNC',
    'SYSTEM_TECHNICAL',
  ])
  incidentCategory!: string;
  @IsString() @MinLength(10) @MaxLength(1000) summary!: string;
  @IsOptional() @IsUUID() assignedAdminId?: string;
  @IsOptional() @IsString() @MaxLength(255) affectedRoute?: string;
  @IsOptional() @IsString() @MaxLength(255) affectedAccountEmail?: string;
}
