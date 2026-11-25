import { Module } from '@nestjs/common';
import { InspectionController } from './inspection.controller';
import { InspectionService } from './inspection.service';
@Module({
  exports: [InspectionService],
  controllers: [InspectionController],
  providers: [InspectionService],
})
export class InspectionModule {}
