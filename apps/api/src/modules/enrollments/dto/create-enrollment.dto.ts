import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  classOfferingId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entrySource?: string;

  @IsOptional()
  @IsUUID()
  placementAttemptId?: string;
}
