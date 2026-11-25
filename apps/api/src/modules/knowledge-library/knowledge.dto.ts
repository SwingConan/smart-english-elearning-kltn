import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ToeicSkill } from '../../generated/prisma/client';
export class KnowledgeRequestDto {
  @IsUUID() idempotencyKey!: string;
}
export class KnowledgeTransitionDto extends KnowledgeRequestDto {
  @IsInt() @Min(0) expectedLockVersion!: number;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
  @IsOptional() @IsBoolean() rightsConfirmed?: boolean;
}
export class KnowledgeExampleDto {
  @IsString() @MaxLength(2000) english!: string;
  @IsString() @MaxLength(4000) explanation!: string;
}
export class KnowledgePracticeDto {
  @IsString() @MaxLength(3000) prompt!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  options!: string[];
  @IsInt() @Min(0) @Max(5) answer!: number;
  @IsString() @MaxLength(4000) feedback!: string;
}
export class KnowledgeRightsDto {
  @IsIn(['ORIGINAL', 'LICENSED']) kind!: 'ORIGINAL' | 'LICENSED';
  @IsString() @MaxLength(250) owner!: string;
  @IsIn(['ORIGINAL_TEXT', 'CC_BY', 'CC0', 'PERMISSION']) license!: string;
  @IsString() @MaxLength(5000) proof!: string;
}
export class KnowledgeReferenceDto {
  @IsString() @MinLength(1) @MaxLength(250) title!: string;
  @IsString() @MaxLength(2048) url!: string;
}
export class KnowledgeDraftDto extends KnowledgeRequestDto {
  @IsIn(['ARTICLE', 'TAG']) kind!: 'ARTICLE' | 'TAG';
  @IsString() @MaxLength(160) @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) slug!: string;
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[A-Z][A-Z0-9_]*$/) tagCode?: string;
  @IsInt() @Min(0) expectedPreviousVersion!: number;
  @IsInt() @Min(0) expectedLockVersion!: number;
  @IsString() @MinLength(1) @MaxLength(250) title!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  objectives: string[] = [];
  @IsString() @MaxLength(100000) bodyMarkdown = '';
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => KnowledgeExampleDto)
  examples: KnowledgeExampleDto[] = [];
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => KnowledgePracticeDto)
  practice: KnowledgePracticeDto[] = [];
  @IsOptional() @ValidateNested() @Type(() => KnowledgeRightsDto) rights?: KnowledgeRightsDto;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => KnowledgeReferenceDto)
  references: KnowledgeReferenceDto[] = [];
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(4)
  @IsEnum(ToeicSkill, { each: true })
  skills: ToeicSkill[] = [];
  @IsOptional() @IsInt() @Min(1) @Max(7) part?: number;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  synonyms: string[] = [];
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  tagRevisionIds: string[] = [];
}
export class KnowledgeQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsEnum(ToeicSkill) skill?: ToeicSkill;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(7) part?: number;
  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) tag?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class KnowledgeSelfCheckDto {
  @IsUUID() revisionId!: string;
  @IsInt() @Min(0) @Max(29) item!: number;
  @IsInt() @Min(0) @Max(5) option!: number;
}
export class KnowledgeLinkDto extends KnowledgeRequestDto {
  @IsUUID() testQuestionId!: string;
  @IsUUID() tagRevisionId!: string;
  @IsUUID() articleRevisionId!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
