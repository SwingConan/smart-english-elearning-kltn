import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AddTestQuestionDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points?: number;
}
