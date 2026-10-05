import { PartialType } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { CreateModuleDto } from './create-module.dto';

export class UpdateModuleDto extends PartialType(CreateModuleDto) {
  @IsISO8601()
  expectedUpdatedAt: string;
}
