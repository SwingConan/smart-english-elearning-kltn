import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ConsultationStatus } from '../../generated/prisma/client';

export class CreateConsultationDto {
  @IsString() @Length(3, 200) topic!: string;
  @IsOptional() @IsString() @Length(1, 2000) learnerNote?: string;
  @IsDateString() requestedStartAt!: string;
  @Type(() => Number) @IsInt() @Min(15) @Max(180) durationMinutes!: number;
}

export class UpdateConsultationDto {
  @IsEnum(ConsultationStatus) status!: ConsultationStatus;
  @IsOptional() @IsDateString() confirmedStartAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(180) durationMinutes?: number;
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  meetingUrl?: string;
  @IsOptional() @IsString() @Length(1, 2000) instructorNote?: string;
  @IsOptional() @IsString() @Length(1, 2000) declineReason?: string;
}

export class SendConsultationMessageDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
