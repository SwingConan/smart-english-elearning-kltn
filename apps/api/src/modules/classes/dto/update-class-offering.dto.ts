import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ClassOfferingStatus } from '../../../generated/prisma/client';
import { CreateClassOfferingDto } from './create-class-offering.dto';

export class UpdateClassOfferingDto extends PartialType(CreateClassOfferingDto) {
  @IsOptional()
  @IsEnum(ClassOfferingStatus)
  status?: ClassOfferingStatus;
}
