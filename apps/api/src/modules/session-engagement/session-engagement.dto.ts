import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
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
import { RoomCapability } from '../../generated/prisma/client';
export class W06Command {
  @IsUUID() key!: string;
}
export class W06Reason extends W06Command {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
export class W06MeetDto extends W06Reason {
  @IsString() @MaxLength(100) url!: string;
}
export class W06DecisionDto extends W06Reason {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
}
export class W06CheckinDto extends W06Command {
  @IsString() @Matches(/^[A-F0-9]{20}$/) code!: string;
}
export class W06CorrectionDto extends W06Reason {
  @IsUUID() learnerId!: string;
  @IsInt() @Min(0) baseVersion!: number;
  @IsIn(['PRESENT', 'LATE', 'NOT_RECORDED']) requestedStatus!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) evidence!: string;
}
export class W06ExceptionDto extends W06Reason {
  @IsIn(['LEAVE', 'RESCHEDULE', 'MAKEUP']) kind!: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) startLocal?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) endLocal?: string;
  @IsString() @MaxLength(100) timezone = 'Asia/Ho_Chi_Minh';
  @IsOptional() @IsInt() @Min(-840) @Max(840) startOffsetMinutes?: number;
  @IsOptional() @IsInt() @Min(-840) @Max(840) endOffsetMinutes?: number;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() assignmentId?: string;
  @IsIn(['ONLINE', 'OFFLINE', 'HYBRID']) modality!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsEnum(RoomCapability, { each: true })
  requiredCapabilities!: RoomCapability[];
}
