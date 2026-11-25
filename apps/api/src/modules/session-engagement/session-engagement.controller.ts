import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { W06PrivacyInterceptor } from './session-engagement.interceptor';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { SessionEngagementService } from './session-engagement.service';
import {
  W06CheckinDto,
  W06Command,
  W06CorrectionDto,
  W06DecisionDto,
  W06ExceptionDto,
  W06MeetDto,
} from './session-engagement.dto';
const uuid = new ParseUUIDPipe();
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/session-engagement')
@Roles('STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER', 'TEACHING_INSPECTOR')
@UseInterceptors(W06PrivacyInterceptor)
export class SessionEngagementController {
  constructor(private readonly service: SessionEngagementService) {}
  @Get('sessions/:id') view(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.view(actor(u, r), id);
  }
  @Get('classes/:id') classes(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.classSessions(actor(u, r), id);
  }
  @Post('sessions/:id/attendance') configure(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.configure(actor(u, r), id);
  }
  @Get('sessions/:id/exception-options') options(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.exceptionOptions(actor(u, r), id);
  }
  @Post('sessions/:id/meet') meet(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06MeetDto,
  ) {
    return this.service.proposeMeet(actor(u, r), id, b);
  }
  @Post('sessions/:id/code') code(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06Command,
  ) {
    return this.service.rotate(actor(u, r), id, b);
  }
  @Post('sessions/:id/checkin') checkin(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06CheckinDto,
  ) {
    return this.service.checkin(actor(u, r), id, b);
  }
  @Get('sessions/:id/roster') roster(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.roster(actor(u, r), id);
  }
  @Post('sessions/:id/corrections') correction(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06CorrectionDto,
  ) {
    return this.service.correction(actor(u, r), id, b);
  }
  @Get('sessions/:id/history') history(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.history(actor(u, r), id);
  }
  @Post('sessions/:id/exceptions') exception(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06ExceptionDto,
  ) {
    return this.service.exception(actor(u, r), id, b);
  }
  @Get('reviews') reviews(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.reviewQueue(actor(u, r));
  }
  @Get('reviews/meet/:id') meetDetail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.reviewDetail(actor(u, r), 'meet', id);
  }
  @Get('reviews/correction/:id') correctionDetail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.reviewDetail(actor(u, r), 'correction', id);
  }
  @Get('reviews/exception/:id') exceptionDetail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.reviewDetail(actor(u, r), 'exception', id);
  }
  @Post('reviews/meet/:id') decideMeet(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06DecisionDto,
  ) {
    return this.service.decide(actor(u, r), 'meet', id, b);
  }
  @Post('reviews/correction/:id') decideCorrection(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06DecisionDto,
  ) {
    return this.service.decide(actor(u, r), 'correction', id, b);
  }
  @Post('reviews/exception/:id') route(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W06DecisionDto,
  ) {
    return this.service.routeException(actor(u, r), id, b);
  }
  @Get('notifications') notifications(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.notifications(actor(u, r));
  }
}
