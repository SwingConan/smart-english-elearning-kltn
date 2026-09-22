import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsUUID, ValidateNested } from 'class-validator';

export class AnswerSelectionDto {
  @IsUUID()
  testQuestionId: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds: string[];
}

export class SaveAttemptAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerSelectionDto)
  answers: AnswerSelectionDto[];
}
