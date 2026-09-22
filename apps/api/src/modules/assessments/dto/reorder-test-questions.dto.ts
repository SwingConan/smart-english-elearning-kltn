import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderTestQuestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedIds: string[];
}
