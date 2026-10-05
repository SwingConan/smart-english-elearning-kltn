import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToeicSkill } from '../../../generated/prisma/client';

export class CreateTestGroupDto {
  @IsEnum(ToeicSkill)
  skill: ToeicSkill;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string | null;

  @IsOptional() @IsString() @MaxLength(5_000)
  instructions?: string | null;

  @IsOptional() @IsInt() @Min(0) @Max(3_600)
  preparationSeconds?: number | null;

  @IsOptional() @IsInt() @Min(1) @Max(7_200)
  responseSeconds?: number | null;

  @IsOptional() @IsInt() @Min(1) @Max(7_200)
  recommendedSeconds?: number | null;

  @IsOptional() @IsInt() @Min(1) @Max(7_200)
  maxRecordingSeconds?: number | null;
}

export class UpdateTestGroupDto extends CreateTestGroupDto {}

export class ReorderTestGroupsDto {
  @IsArray() @IsUUID('4', { each: true })
  orderedGroupIds: string[];
}

export class CreateTextStimulusDto {
  @IsString() @MaxLength(20_000)
  textContent: string;

  @IsOptional() @IsString() @MaxLength(1_000)
  altText?: string | null;
}

export class ReorderStimuliDto {
  @IsArray() @IsUUID('4', { each: true })
  orderedStimulusIds: string[];
}

export class MoveGroupQuestionDto {
  @IsUUID()
  testQuestionId: string;

  @IsOptional() @IsInt() @Min(0)
  orderIndex?: number;
}

export class MoveTestQuestionGroupDto {
  @IsOptional() @IsUUID()
  groupId?: string | null;
}

export class ReorderGroupQuestionItemDto {
  @IsUUID()
  testQuestionId: string;
}

export class ReorderGroupQuestionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReorderGroupQuestionItemDto)
  questions: ReorderGroupQuestionItemDto[];
}
