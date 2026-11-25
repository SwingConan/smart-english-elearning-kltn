import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { InspectionService } from './inspection.service';
import { InspectionCommand, InspectionQuery } from './inspection.dto';
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/inspection')
@Roles('ACADEMIC_MANAGER', 'TEACHING_INSPECTOR', 'INSTRUCTOR')
export class InspectionController {
  constructor(private readonly service: InspectionService) {}
  @Get() list(@CurrentUser() u: PublicUser, @Req() r: Request, @Query() q: InspectionQuery) {
    return this.service.dashboard(actor(u, r), q);
  }
  @Get('assignments/:id') view(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.view(actor(u, r), id);
  }
  @Post('assignments') dispatch(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: InspectionCommand,
  ) {
    return this.service.command(actor(u, r), null, b);
  }
  @Post('assignments/:id/commands') command(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: InspectionCommand,
  ) {
    return this.service.command(actor(u, r), id, b);
  }
}
