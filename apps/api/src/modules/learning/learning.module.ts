import { Module } from '@nestjs/common';
import { InstructorContentController } from './instructor-content.controller';
import { InstructorContentService } from './instructor-content.service';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningResourceStorage, LocalLearningResourceStorage } from './learning-resource.storage';
import { InstructorWorkspaceController } from './instructor-workspace.controller';
import { InstructorWorkspaceService } from './instructor-workspace.service';

@Module({
  controllers: [InstructorContentController, InstructorWorkspaceController, LearningController],
  providers: [
    InstructorContentService,
    LearningService,
    InstructorWorkspaceService,
    LocalLearningResourceStorage,
    { provide: LearningResourceStorage, useExisting: LocalLearningResourceStorage },
  ],
  exports: [InstructorContentService, LearningService],
})
export class LearningModule {}
