import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export const CONSULTATION_OPERATIONS = [
  'PROFILE_SAVE',
  'PROFILE_APPROVE',
  'PROFILE_REJECT',
  'PROFILE_DISABLE',
  'PROFILE_ENABLE',
  'AVAILABILITY_ADD',
  'AVAILABILITY_REMOVE',
  'HOLD',
  'SUBMIT',
  'CONFIRM',
  'REJECT',
  'CANCEL',
  'RESCHEDULE',
  'CHANGE_REQUEST',
  'CHANGE_APPROVE',
  'CHANGE_REJECT',
  'LINK_PROPOSE',
  'LINK_APPROVE',
  'LINK_REJECT',
  'NO_SHOW',
  'DISPUTE',
] as const;
export class ConsultationCommandDto {
  @IsUUID() key!: string;
  @IsIn(CONSULTATION_OPERATIONS) op!: (typeof CONSULTATION_OPERATIONS)[number];
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsUUID() teacherId?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsString() @MaxLength(500) specialties?: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsString() @MaxLength(1000) topic?: string;
  @IsOptional() @IsString() @MaxLength(2000) evidence?: string;
  @IsOptional() @IsIn(['WEEKLY', 'LEAVE', 'CANCEL', 'RESCHEDULE']) kind?: string;
  @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) startMinute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) endMinute?: number;
  @IsOptional() @IsInt() @Min(0) version?: number;
  @IsOptional() @IsDateString({ strict: true }) startsAt?: string;
  @IsOptional() @IsDateString({ strict: true }) endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) url?: string;
}
