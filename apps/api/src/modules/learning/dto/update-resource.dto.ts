import { PartialType } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { CreateResourceDto } from './create-resource.dto';

export class UpdateResourceDto extends PartialType(CreateResourceDto) {
  @IsISO8601()
  expectedUpdatedAt: string;
}
