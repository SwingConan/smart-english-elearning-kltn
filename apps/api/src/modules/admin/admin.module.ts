import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { CoursesModule } from '../courses/courses.module';
import { UsersModule } from '../users/users.module';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminClassOfferingsController } from './admin-class-offerings.controller';
import { AdminCriteriaController } from './admin-criteria.controller';
import { AdminCriteriaService } from './admin-criteria.service';
import { AdminCoursesController } from './admin-courses.controller';
import { AdminReportingController } from './admin-reporting.controller';
import { AdminReportingService } from './admin-reporting.service';

@Module({
  imports: [CoursesModule, ClassesModule, UsersModule],
  controllers: [
    AdminCoursesController,
    AdminClassOfferingsController,
    AdminAccountsController,
    AdminCriteriaController,
    AdminReportingController,
  ],
  providers: [AdminCriteriaService, AdminReportingService],
})
export class AdminModule {}
