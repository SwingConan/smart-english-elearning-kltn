import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PublicContentFormat } from '../../generated/prisma/client';

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
  @IsUUID() categoryId!: string;
  @IsString() @Length(3, 240) title!: string;
  @IsString() @Length(10, 1000) excerpt!: string;
  @IsEnum(PublicContentFormat) contentFormat: PublicContentFormat = PublicContentFormat.RICH_HTML;
  @IsOptional() @IsString() @Length(10, 50000) bodyMarkdown?: string | null;
  @IsOptional() @IsString() @Length(10, 100000) bodyHtml?: string | null;
  @IsOptional() @IsString() coverKey?: string | null;
  @IsOptional() @IsUUID() coverAssetId?: string | null;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string | null;
}

export class UpdatePublicContentDto extends PartialType(SavePublicContentDto) {}

export class PublicContentQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() search?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 12;
}

export class SavePublicContentCategoryDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Length(1, 120) slug!: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePublicContentCategoryDto extends PartialType(SavePublicContentCategoryDto) {}
