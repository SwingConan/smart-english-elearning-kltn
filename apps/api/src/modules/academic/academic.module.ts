import { Module } from '@nestjs/common';
import { AcademicService } from './academic.service';
import { AcademicController } from './academic.controller';
import { AcademicPlanningController } from './academic-planning.controller';
import { AcademicPlanningService } from './academic-planning.service';
@Module({
  providers: [AcademicService, AcademicPlanningService],
  controllers: [AcademicController, AcademicPlanningController],
  exports: [AcademicPlanningService],
})
export class AcademicModule {}
