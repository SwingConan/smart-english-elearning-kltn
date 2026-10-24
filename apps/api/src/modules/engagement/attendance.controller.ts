import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AttendanceService } from './attendance.service';
import { BulkAttendanceDto, CreateAttendanceSessionDto } from './attendance.dto';

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
}
