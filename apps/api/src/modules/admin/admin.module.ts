import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { CoursesModule } from '../courses/courses.module';
import { UsersModule } from '../users/users.module';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminClassOfferingsController } from './admin-class-offerings.controller';
import { AdminCoursesController } from './admin-courses.controller';

@Module({
  imports: [CoursesModule, ClassesModule, UsersModule],
  controllers: [AdminCoursesController, AdminClassOfferingsController, AdminAccountsController],
})
export class AdminModule {}
