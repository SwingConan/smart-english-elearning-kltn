import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class ReplaceAdaptivePolicyDto {
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  remedialThreshold: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1)
  progressionThreshold: number;
}
