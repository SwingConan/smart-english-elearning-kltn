import { Module } from '@nestjs/common';
import { ClassOfferingsService } from './class-offerings.service';
import { PublicClassOfferingsController } from './public-class-offerings.controller';
import { ClassOperationsService } from './class-operations.service';

@Module({
  controllers: [PublicClassOfferingsController],
  providers: [ClassOfferingsService, ClassOperationsService],
  exports: [ClassOfferingsService, ClassOperationsService],
})
export class ClassesModule {}
