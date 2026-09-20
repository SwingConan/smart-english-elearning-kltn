import { IsUUID } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  classOfferingId: string;
}
