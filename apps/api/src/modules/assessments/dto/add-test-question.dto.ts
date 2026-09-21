import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AddTestQuestionDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points?: number;
}
