import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
import {
  ClassModality,
  CourseSkillScope,
  PricingType,
  RoomCapability,
  RoomStatus,
} from '../../generated/prisma/client';
import { AcademicReasonDto } from './academic.dto';

export class PlanningQueryDto {
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) from?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) through?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}
export class RoomDto extends AcademicReasonDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,60}$/) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) location!: string;
  @IsInt() @Min(1) @Max(1000) capacity!: number;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(RoomCapability, { each: true })
  capabilities!: RoomCapability[];
  @IsEnum(RoomStatus) status!: RoomStatus;
}
export class UpdateRoomDto extends RoomDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class DecisionDto extends AcademicReasonDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class VersionApprovalDto extends DecisionDto {
  @IsBoolean() @Equals(true) poPriceConfirmed!: boolean;
  @IsString() @Matches(/\S/u) @MaxLength(300) poPriceReference!: string;
}
export class SessionApprovalDto extends DecisionDto {
  @IsOptional() @IsBoolean() sourceTemplateReviewed?: boolean;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  expectedSourceTemplateUpdatedAt?: string;
}
export class VersionDto extends AcademicReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) level!: string;
  @IsEnum(CourseSkillScope) skillScope!: CourseSkillScope;
  @IsOptional() @IsEnum(PricingType) standardPricingType?: PricingType;
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) standardTuitionFeeVnd?: number;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) effectiveFrom!: string;
}
export class UpdateVersionDto extends VersionDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class VersionOfferDto extends AcademicReasonDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,60}$/) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) name!: string;
  @IsEnum(ClassModality) modality!: ClassModality;
  @IsInt() @Min(1) @Max(1000) maxStudents!: number;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) enrollmentStart!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) enrollmentEnd!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) classStart!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) classEnd!: string;
}
export class OpenVersionOfferDto extends AcademicReasonDto {
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) expectedUpdatedAt!: string;
}
export class AssignmentDto extends AcademicReasonDto {
  @IsUUID() instructorId!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) effectiveFrom!: string;
  @IsDateString({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) effectiveTo!: string;
  @IsOptional() @IsUUID() replacesId?: string;
}
export class AssignmentApprovalDto extends DecisionDto {
  @IsBoolean() @Equals(true) eligibilityConfirmed!: boolean;
}
export class SessionDto extends AcademicReasonDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) startLocal!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) endLocal!: string;
  @IsString() @MaxLength(100) timezone = 'Asia/Ho_Chi_Minh';
  @IsOptional() @IsString() @Matches(/^[+-]\d{2}:\d{2}$/) startOffset?: string;
  @IsOptional() @IsString() @Matches(/^[+-]\d{2}:\d{2}$/) endOffset?: string;
  @IsEnum(ClassModality) modality!: ClassModality;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() assignmentId?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(RoomCapability, { each: true })
  requiredCapabilities!: RoomCapability[];
}
export class UpdateSessionDto extends SessionDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class GenerationDto extends AcademicReasonDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) through!: string;
  @IsString() @MaxLength(100) timezone = 'Asia/Ho_Chi_Minh';
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(60)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  excludeDates!: string[];
  @IsBoolean() @Equals(true) exceptionsReviewed!: boolean;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() assignmentId?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(RoomCapability, { each: true })
  requiredCapabilities!: RoomCapability[];
}
