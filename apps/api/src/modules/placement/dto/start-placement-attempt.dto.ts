import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { PlacementMode, PlacementSelfLevel } from '../../../generated/prisma/client';

export class StartPlacementAttemptDto {
  @IsEnum(PlacementMode)
  mode: PlacementMode;

  @IsEnum(PlacementSelfLevel)
  selfLevel: PlacementSelfLevel;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(990)
  goalScore: number;
}
