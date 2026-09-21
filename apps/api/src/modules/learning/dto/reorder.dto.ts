import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedIds: string[];
}
