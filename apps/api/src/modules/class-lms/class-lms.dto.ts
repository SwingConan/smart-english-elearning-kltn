import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClassActivityType } from '../../generated/prisma/client';
export class RevisionDto {
  @Type(() => Number) @IsInt() @Min(0) expectedLockVersion!: number;
}
export class SectionDto {
  @IsString() @IsNotEmpty() @MaxLength(250) title!: string;
  @IsString() @MaxLength(5000) introduction = '';
}
export class UpdateSectionDto extends SectionDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class ActivityDto extends SectionDto {
  @IsEnum(ClassActivityType) type!: ClassActivityType;
  @IsString() @MaxLength(100000) contentMarkdown = '';
  @IsOptional() @IsString() @MaxLength(2048) resourceUrl?: string;
  @IsOptional() @IsUUID() sourceLessonId?: string;
  @IsOptional() @IsUUID() sourceResourceId?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  expectedSourceUpdatedAt?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  availableFrom?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  availableUntil?: string;
}
export class UpdateActivityDto extends ActivityDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class OrderItemDto extends RevisionDto {
  @IsUUID() id!: string;
}
export class OrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((v: OrderItemDto) => v.id)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
export class MonthDto {
  @IsString() @Matches(/^20\d{2}-(?:0[1-9]|1[0-2])$/) month!: string;
  @IsOptional() @IsUUID() classId?: string;
}
