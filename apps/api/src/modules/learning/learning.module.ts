import { Module } from '@nestjs/common';
import { InstructorContentController } from './instructor-content.controller';
import { InstructorContentService } from './instructor-content.service';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  controllers: [InstructorContentController, LearningController],
  providers: [InstructorContentService, LearningService],
  exports: [InstructorContentService, LearningService],
})
export class LearningModule {}
