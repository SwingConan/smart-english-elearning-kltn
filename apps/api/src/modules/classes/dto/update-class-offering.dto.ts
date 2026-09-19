import { PartialType } from '@nestjs/swagger';
import { CreateClassOfferingDto } from './create-class-offering.dto';

export class UpdateClassOfferingDto extends PartialType(
  CreateClassOfferingDto,
) {}
