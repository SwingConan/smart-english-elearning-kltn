import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AttendanceService } from './attendance.service';
import { BulkAttendanceDto, CheckInDto, CreateAttendanceSessionDto } from './attendance.dto';

@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes/:classOfferingId/attendance/sessions')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}
  @Get() list(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
  ) {
    return this.service.list(user.id, classOfferingId);
  }
  @Get('schedule-slots') slots(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
  ) {
    return this.service.slots(user.id, classOfferingId);
  }
  @Post() create(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Body() input: CreateAttendanceSessionDto,
  ) {
    return this.service.create(user.id, classOfferingId, input);
  }
  @Get(':sessionId') detail(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.detail(user.id, classOfferingId, sessionId);
  }
  @Put(':sessionId/records') records(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: BulkAttendanceDto,
  ) {
    return this.service.putRecords(user.id, classOfferingId, sessionId, input);
  }

  @Post(':sessionId/close') close(
    @CurrentUser() user: PublicUser,
    @Param('classOfferingId', new ParseUUIDPipe()) classOfferingId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.close(user.id, classOfferingId, sessionId);
  }
}

@Roles(UserRole.STUDENT)
@Controller('enrollments/:enrollmentId/attendance')
export class StudentAttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  history(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.studentAttendance(user.id, enrollmentId);
  }

  @Get('open-session')
  open(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.openSession(user.id, enrollmentId);
  }

  @Post(':sessionId/check-in')
  @UseGuards(ThrottlerGuard)
  @Throttle({ attendanceCheckIn: { limit: 8, ttl: 60_000 } })
  checkIn(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() input: CheckInDto,
  ) {
    return this.service.checkIn(user.id, enrollmentId, sessionId, input.accessCode);
  }
}
