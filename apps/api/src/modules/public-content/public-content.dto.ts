import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export const PUBLIC_CONTENT_CATEGORIES = [
  'Lịch khai giảng',
  'Workshop',
  'Kỹ năng TOEIC',
  'Hướng dẫn học',
  'Cập nhật chương trình',
] as const;

export const PUBLIC_CONTENT_COVER_KEYS = [
  'enrollment',
  'listening',
  'reading',
  'speaking',
  'writing',
  'placement',
  'study-rhythm',
  'results',
] as const;

export class SavePublicContentDto {
  @IsString() @Length(1, 140) slug!: string;
  @IsIn(PUBLIC_CONTENT_CATEGORIES) category!: string;
  @IsString() @Length(3, 240) title!: string;
  @IsString() @Length(10, 1000) excerpt!: string;
  @IsString() @Length(10, 50000) bodyMarkdown!: string;
  @IsOptional() @IsIn(PUBLIC_CONTENT_COVER_KEYS) coverKey?: string | null;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) coverImageUrl?:
    string | null;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string | null;
}

export class UpdatePublicContentDto extends PartialType(SavePublicContentDto) {}

export class PublicContentQueryDto {
  @IsOptional() @IsString() category?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 12;
}
