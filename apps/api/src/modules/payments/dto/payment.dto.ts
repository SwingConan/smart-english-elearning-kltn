import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaymentStatus } from '../../../generated/prisma/client';

export class SubmitPaymentDto {
  @IsOptional() @IsString() @Length(1, 128) payerReference?: string;
  @IsOptional() @IsString() @Length(1, 2000) learnerNote?: string;
}

export class ReviewPaymentDto {
  @IsOptional() @IsString() @Length(1, 2000) adminNote?: string;
}

export class RejectPaymentDto {
  @IsString()
  @Length(1, 2000)
  @Matches(/\S/, { message: 'reason must contain non-whitespace characters' })
  reason!: string;
}

export class PaymentQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsUUID() classOfferingId?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  search?: string;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
