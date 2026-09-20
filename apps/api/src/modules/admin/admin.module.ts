import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { CoursesModule } from '../courses/courses.module';
import { AdminClassOfferingsController } from './admin-class-offerings.controller';
import { AdminCoursesController } from './admin-courses.controller';

@Module({
  imports: [CoursesModule, ClassesModule],
  controllers: [AdminCoursesController, AdminClassOfferingsController],
})
export class AdminModule {}
