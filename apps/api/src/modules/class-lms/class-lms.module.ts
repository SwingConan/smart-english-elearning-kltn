import { ClassQuizController } from './quiz.controller';
import { ClassQuizService } from './quiz.service';
import { Module } from '@nestjs/common';
import { AssignmentGradingController } from './grading.controller';
import { AssignmentGradingService } from './grading.service';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { ClassLmsController, ClassDashboardController } from './class-lms.controller';
import { ClassLmsService } from './class-lms.service';
import { ClassDashboardService } from './class-dashboard.service';
import { ClassProgressService } from './class-progress.service';
import { LmsLocalController } from './lms-local.controller';
import { LmsLocalService } from './lms-local.service';
import {
  LearningResourceStorage,
  LocalLearningResourceStorage,
} from '../learning/learning-resource.storage';
@Module({
  controllers: [
    ClassQuizController,
    ClassLmsController,
    ClassDashboardController,
    AssignmentController,
    AssignmentGradingController,
    LmsLocalController,
  ],
  exports: [ClassLmsService, LmsLocalService],
  providers: [
    ClassProgressService,
    ClassQuizService,
    AssignmentGradingService,
    AssignmentService,
    ClassLmsService,
    ClassDashboardService,
    LmsLocalService,
    LocalLearningResourceStorage,
    { provide: LearningResourceStorage, useExisting: LocalLearningResourceStorage },
  ],
})
export class ClassLmsModule {}
