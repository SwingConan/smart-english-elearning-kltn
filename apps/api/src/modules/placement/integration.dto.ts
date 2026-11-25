import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
} from 'class-validator';
import { PlacementMode } from '../../generated/prisma/client';
export class PlacementPreviewStartDto {
  @IsUUID() idempotencyKey!: string;
  @IsUUID() sourceVersionId!: string;
  @IsEnum(PlacementMode) mode!: PlacementMode;
  @IsInt() @Min(10) @Max(990) goalLR!: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) goalSpeaking?: number;
  @IsOptional() @IsInt() @Min(0) @Max(200) goalWriting?: number;
}
export class PlacementPreviewCommandDto {
  @IsUUID() idempotencyKey!: string;
  @IsInt() @Min(0) expectedLockVersion!: number;
}
export class PlacementPreviewAnswerDto extends PlacementPreviewCommandDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1)
  @IsUUID(undefined, { each: true })
  selectedOptionIds?: string[];
  @IsOptional() @IsString() @MaxLength(20000) textResponse?: string;
}
export class PlacementPreviewMarkDto extends PlacementPreviewCommandDto {
  @IsBoolean() marked!: boolean;
}
