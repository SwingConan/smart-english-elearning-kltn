import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../../generated/prisma/client';

export class CreateAttendanceSessionDto {
  @IsDateString() sessionDate!: string;
  @IsOptional() @IsUUID() scheduleSlotId?: string;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() @Length(1, 2000) note?: string;
}

export class AttendanceRecordDto {
  @IsUUID() enrollmentId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsOptional() @IsString() @Length(1, 1000) note?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  clearEnrollmentIds?: string[];
}
