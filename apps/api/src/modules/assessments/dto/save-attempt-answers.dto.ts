import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AnswerSelectionDto {
  @IsUUID()
  testQuestionId: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  textResponse?: string;
}

export class SaveAttemptAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerSelectionDto)
  answers: AnswerSelectionDto[];
}
