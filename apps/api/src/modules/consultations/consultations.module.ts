import { Module } from '@nestjs/common';
import {
  InstructorConsultationsController,
  InstructorConsultationInboxController,
  StudentConsultationThreadController,
  StudentConsultationsController,
} from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  controllers: [
    StudentConsultationsController,
    InstructorConsultationsController,
    StudentConsultationThreadController,
    InstructorConsultationInboxController,
  ],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
