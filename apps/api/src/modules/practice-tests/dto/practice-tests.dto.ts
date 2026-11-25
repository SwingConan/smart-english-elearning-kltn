import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class StartPracticeTestDto {
  @IsOptional()
  @IsBoolean()
  restart?: boolean;
}

export class PracticeAnswerItemDto {
  @IsUUID()
  testQuestionId: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds: string[];
}

export class SavePracticeProgressDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PracticeAnswerItemDto)
  answers?: PracticeAnswerItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  markedQuestionIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  listeningGroupIndex?: number;

  @IsOptional()
  @IsBoolean()
  enterReading?: boolean;
}
