import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ResourceType } from '../../../generated/prisma/client';

export class CreateResourceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsEnum(ResourceType)
  type: ResourceType;

  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsBoolean()
  isDownloadable?: boolean;
}
