import { Module } from '@nestjs/common';
import { AssessmentInstructorController } from './assessment-instructor.controller';
import { AssessmentInstructorService } from './assessment-instructor.service';

@Module({
  controllers: [AssessmentInstructorController],
  providers: [AssessmentInstructorService],
})
export class AssessmentsModule {}
