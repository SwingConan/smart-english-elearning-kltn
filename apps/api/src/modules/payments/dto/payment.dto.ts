import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PaymentStatus } from '../../../generated/prisma/client';

export class SubmitPaymentDto {
  @IsOptional() @IsString() @Length(1, 128) payerReference?: string;
  @IsOptional() @IsString() @Length(1, 2000) learnerNote?: string;
}

export class ReviewPaymentDto {
  @IsOptional() @IsString() @Length(1, 2000) adminNote?: string;
}

export class PaymentQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  normalize?: never;
}
