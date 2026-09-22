import { Module } from '@nestjs/common';
import { AssessmentInstructorController } from './assessment-instructor.controller';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { AssessmentStudentController } from './assessment-student.controller';
import { AssessmentStudentService } from './assessment-student.service';

@Module({
  controllers: [AssessmentInstructorController, AssessmentStudentController],
  providers: [AssessmentInstructorService, AssessmentStudentService],
})
export class AssessmentsModule {}
