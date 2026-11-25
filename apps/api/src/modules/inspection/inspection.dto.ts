import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
export class InspectionQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 25;
  @IsOptional() @IsUUID() assignmentCursor?: string;
  @IsOptional() @IsUUID() sessionCursor?: string;
}
export class InspectionCommand {
  @IsUUID() key!: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  @IsOptional() @IsUUID() sessionId?: string;
  @IsOptional() @IsUUID() inspectorId?: string;
  @IsOptional() @IsInt() @Min(0) version?: number;
  @IsOptional()
  @IsIn([
    'ACK',
    'DECLINE',
    'REASSIGN',
    'START',
    'STOP',
    'REPORT',
    'REVIEW',
    'DISPUTE',
    'IN',
    'OUT',
    'CORRECTION',
    'CORRECTION_REVIEW',
  ])
  action?: string;
  @IsOptional() @IsIn(['PRESENT', 'LATE', 'ABSENT', 'INACCESSIBLE']) presence?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(2000) conditions?: string;
  @IsOptional() @IsIn(['APPROVE', 'PARTIAL', 'REJECT', 'ACCEPT']) disposition?: string;
  @IsOptional() @IsInt() @Min(0) approvedSeconds?: number;
  @IsOptional() @IsUUID() correctionId?: string;
  @IsOptional() @IsDateString() @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) proposedOutAt?: string;
  @IsOptional()
  @IsIn(['MISSING_CHECKOUT', 'LATE', 'EARLY', 'CANCELLED', 'WRONG_DEVICE'])
  kind?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(2000) evidence?: string;
}
