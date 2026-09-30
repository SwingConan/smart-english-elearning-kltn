import { IsEnum } from 'class-validator';

export enum PlacementSubmitReason {
  MANUAL = 'MANUAL',
  TIMEOUT = 'TIMEOUT',
}

export class SubmitPlacementAttemptDto {
  @IsEnum(PlacementSubmitReason)
  reason: PlacementSubmitReason;
}
