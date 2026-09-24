import { Module } from '@nestjs/common';
import { AdaptiveInstructorController } from './adaptive-instructor.controller';
import { AdaptiveInstructorService } from './adaptive-instructor.service';
import { AdaptiveStudentController } from './adaptive-student.controller';
import { AdaptiveStudentService } from './adaptive-student.service';
import { InstructorLearnerMasteryController } from './instructor-learner-mastery.controller';
import { InstructorLearnerMasteryService } from './instructor-learner-mastery.service';

@Module({
  controllers: [
    AdaptiveInstructorController,
    AdaptiveStudentController,
    InstructorLearnerMasteryController,
  ],
  providers: [
    AdaptiveInstructorService,
    AdaptiveStudentService,
    InstructorLearnerMasteryService,
  ],
})
export class AdaptiveModule {}
