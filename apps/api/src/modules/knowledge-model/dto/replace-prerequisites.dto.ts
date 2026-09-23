import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplacePrerequisitesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  prerequisiteSkillIds: string[];
}
