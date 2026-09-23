import { Module } from '@nestjs/common';
import { AdaptiveInstructorController } from './adaptive-instructor.controller';
import { AdaptiveInstructorService } from './adaptive-instructor.service';
import { AdaptiveStudentController } from './adaptive-student.controller';
import { AdaptiveStudentService } from './adaptive-student.service';

@Module({
  controllers: [AdaptiveInstructorController, AdaptiveStudentController],
  providers: [AdaptiveInstructorService, AdaptiveStudentService],
})
export class AdaptiveModule {}
