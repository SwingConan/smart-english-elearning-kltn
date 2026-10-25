import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AttendanceController, StudentAttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'attendanceCheckIn', ttl: 60_000, limit: 8 }])],
  controllers: [AttendanceController, StudentAttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class EngagementModule {}
