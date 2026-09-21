import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateTestQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points: number;
}
