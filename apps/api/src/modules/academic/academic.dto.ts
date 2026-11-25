import { Transform, Type } from 'class-transformer';
import {
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ClassModality,
  ClassOfferingStatus,
  CourseSkillScope,
  EnrollmentStatus,
  PricingType,
} from '../../generated/prisma/client';
export class AcademicQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsEnum(ClassOfferingStatus) status?: ClassOfferingStatus;
  @IsOptional() @IsEnum(EnrollmentStatus) enrollmentStatus?: EnrollmentStatus;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class AcademicReasonDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
export class DraftProgramDto extends AcademicReasonDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;
  @IsString() @MaxLength(5000) description!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  level!: string;
  @IsEnum(CourseSkillScope) skillScope!: CourseSkillScope;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(104) defaultDurationWeeks?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) defaultSessionsCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) defaultPeriodsPerSession?: number;
  @IsOptional() @IsEnum(PricingType) defaultPricingType?: PricingType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000000) defaultTuitionFeeVnd?: number;
}
export class UpdateDraftProgramDto extends DraftProgramDto {
  @IsDateString() expectedUpdatedAt!: string;
}
export class DraftClassDto extends AcademicReasonDto {
  @IsUUID() courseId!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,60}$/)
  code!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name!: string;
  @IsEnum(ClassModality) modality!: ClassModality;
  @IsInt() @Min(1) @Max(1000) maxStudents!: number;
  @IsEnum(PricingType) pricingType!: PricingType;
  @IsInt() @Min(0) @Max(1000000000) tuitionFeeVnd!: number;
  @IsOptional() @IsDateString() classStart?: string;
  @IsOptional() @IsDateString() classEnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) totalSessions?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) periodsPerSession?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(104) durationWeeks?: number;
  @IsOptional() @IsUUID() defaultRoomId?: string;
  @IsOptional() @IsUUID() instructorId?: string;
  @IsOptional() @IsBoolean() autoInitSections?: boolean;
}
export class UpdateDraftClassDto extends DraftClassDto {
  @IsDateString() expectedUpdatedAt!: string;
}
export class DraftSlotDto extends AcademicReasonDto {
  @IsDateString() expectedUpdatedAt!: string;
  @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsString() @MaxLength(300) locationText!: string;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string;
}
export class RemoveDraftSlotDto extends AcademicReasonDto {
  @IsDateString() expectedUpdatedAt!: string;
}

export class CurriculumLessonDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600) estimatedMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orderIndex?: number;
}

export class CurriculumModuleDto {
  @IsOptional() @IsUUID() id?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orderIndex?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumLessonDto)
  lessons!: CurriculumLessonDto[];
}

export class SaveCourseCurriculumDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumModuleDto)
  modules!: CurriculumModuleDto[];
}

export class PublishToggleDto {
  @IsBoolean() isPublished!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class SetupSlotInputDto {
  @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsOptional() @IsUUID() roomId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) locationText?: string | null;
  @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string | null;
}

export class SetupClassDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  name?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,60}$/)
  code?: string;
  @IsOptional() @IsEnum(ClassModality) modality?: ClassModality;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxStudents?: number;
  @IsOptional() @IsEnum(PricingType) pricingType?: PricingType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000000000) tuitionFeeVnd?: number;
  @IsOptional() @IsEnum(ClassOfferingStatus) status?: ClassOfferingStatus;
  @IsOptional() @IsDateString() classStart?: string | null;
  @IsOptional() @IsDateString() classEnd?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) totalSessions?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) periodsPerSession?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(104) durationWeeks?: number | null;
  @IsOptional() @IsUUID() defaultRoomId?: string | null;
  @IsOptional() @IsUUID() instructorId?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupSlotInputDto)
  slots?: SetupSlotInputDto[];
  @IsOptional() @IsBoolean() syncLmsSections?: boolean;
}

export class GenerateRoadmapDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() classStart?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) totalSessions?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) periodsPerSession?: number;
  @IsOptional() @IsUUID() defaultRoomId?: string | null;
  @IsOptional() @IsBoolean() syncTeachingSessions?: boolean;
  @IsOptional() @IsBoolean() syncLmsSections?: boolean;
  @IsOptional() @IsBoolean() replaceExisting?: boolean;
}

export class RoadmapItemInputDto {
  @IsOptional() @IsUUID() id?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(200) weekNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(500) sessionNumber!: number;
  @IsDateString() sessionDate!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @IsString() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) periods!: number;
  @IsEnum(ClassModality) modality!: ClassModality;
  @IsOptional() @IsUUID() roomId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) locationText?: string | null;
  @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string | null;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  topicTitle!: string;
  @IsOptional() @IsString() @MaxLength(1000) contentSummary?: string;
  @IsOptional() @IsUUID() sourceModuleId?: string | null;
  @IsOptional() @IsUUID() teachingSessionId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orderIndex?: number;
}

export class SaveRoadmapDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoadmapItemInputDto)
  items!: RoadmapItemInputDto[];
  @IsOptional() @IsBoolean() syncTeachingSessions?: boolean;
}
