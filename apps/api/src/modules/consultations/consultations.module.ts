import { Module } from '@nestjs/common';
import {
  InstructorConsultationsController,
  StudentConsultationsController,
} from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  controllers: [StudentConsultationsController, InstructorConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
