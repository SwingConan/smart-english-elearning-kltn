import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SavePlacementAnswerDto {
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
