import { Module } from '@nestjs/common';
import { AssessmentInstructorController } from './assessment-instructor.controller';
import { AssessmentCompatibilityInterceptor } from './assessment-compatibility.interceptor';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { AssessmentStudentController } from './assessment-student.controller';
import { AssessmentStudentService } from './assessment-student.service';
import { ClassAssessmentController } from './class-assessment.controller';
import { ClassAssessmentService } from './class-assessment.service';
import {
  AssessmentResponseStorage,
  LocalAssessmentResponseStorage,
} from '../placement/assessment-response.storage';
import { AssessmentStimulusMediaStorage } from '../placement/assessment-stimulus-media.storage';

@Module({
  controllers: [
    AssessmentInstructorController,
    AssessmentStudentController,
    ClassAssessmentController,
  ],
  providers: [
    AssessmentCompatibilityInterceptor,
    AssessmentInstructorService,
    AssessmentStudentService,
    ClassAssessmentService,
    AssessmentStimulusMediaStorage,
    { provide: AssessmentResponseStorage, useClass: LocalAssessmentResponseStorage },
  ],
})
export class AssessmentsModule {}
