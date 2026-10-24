import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CompletionPolicyDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100) minLessonCompletionPercent!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) minAttendancePercent?: number | null;
  @IsBoolean() requireFinalAssessment!: boolean;
}

export class CertificateQueryDto {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsIn(['VALID', 'REVOKED']) status?: 'VALID' | 'REVOKED';
  @IsOptional() @IsDateString() issuedFrom?: string;
  @IsOptional() @IsDateString() issuedTo?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class RevokeCertificateDto {
  @IsString() @Length(3, 2000) reason!: string;
}
