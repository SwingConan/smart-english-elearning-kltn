import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SavePlacementAnswerDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  selectedOptionIds: string[];
}
