import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceSkillMappingsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  skillIds: string[];
}
