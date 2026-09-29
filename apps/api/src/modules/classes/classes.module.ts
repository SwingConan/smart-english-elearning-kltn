import { Module } from '@nestjs/common';
import { ClassOfferingsService } from './class-offerings.service';
import { PublicClassOfferingsController } from './public-class-offerings.controller';

@Module({
  controllers: [PublicClassOfferingsController],
  providers: [ClassOfferingsService],
  exports: [ClassOfferingsService],
})
export class ClassesModule {}
