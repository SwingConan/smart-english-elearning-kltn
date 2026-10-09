import { PartialType } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { CreateLessonDto } from './create-lesson.dto';

export class UpdateLessonDto extends PartialType(CreateLessonDto) {
  @IsISO8601()
  expectedUpdatedAt: string;
}
