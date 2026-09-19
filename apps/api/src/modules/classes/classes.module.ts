import { Module } from '@nestjs/common';
import { ClassOfferingsService } from './class-offerings.service';

@Module({
  providers: [ClassOfferingsService],
  exports: [ClassOfferingsService],
})
export class ClassesModule {}
