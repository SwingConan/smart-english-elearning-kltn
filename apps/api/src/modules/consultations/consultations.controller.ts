import { Body, Controller, Get, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { ConsultationCommandDto } from './consultation.dto';
import { ConsultationsService } from './consultations.service';
@Controller('v2/consultations')
@Roles('STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER')
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}
  @Post('commands') command(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: ConsultationCommandDto,
  ) {
    return this.service.command({ id: u.id, sessionId: r.sessionID }, b);
  }
  @Get('profiles') profiles(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.profiles({ id: u.id, sessionId: r.sessionID });
  }
  @Get('slots') slots(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Query('teacherId', new ParseUUIDPipe()) t: string,
  ) {
    return this.service.slots({ id: u.id, sessionId: r.sessionID }, t);
  }
  @Get('bookings') bookings(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Query('month') m?: string,
  ) {
    return this.service.bookings({ id: u.id, sessionId: r.sessionID }, m);
  }
  @Get('workspace') workspace(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.workspace({ id: u.id, sessionId: r.sessionID });
  }
  @Get('notifications') notifications(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.notifications({ id: u.id, sessionId: r.sessionID });
  }
}
