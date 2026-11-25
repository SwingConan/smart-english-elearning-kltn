import { Body, Controller, Get, Header, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { OperationsRuntimeService } from './operations-runtime.service';

@Controller('v2/operations')
export class OperationsRuntimeController {
  constructor(private readonly service: OperationsRuntimeService) {}
  @Get('readiness')
  @Header('Cache-Control', 'private, no-store')
  read(@CurrentUser() user: PublicUser, @Req() request: Request) {
    return this.service.readiness({ id: user.id, sessionId: request.sessionID });
  }
  @Post('export')
  @Header('Cache-Control', 'private, no-store')
  export(@CurrentUser() user: PublicUser, @Req() request: Request) {
    return this.service.unavailableAction({ id: user.id, sessionId: request.sessionID });
  }
  @Get('system-config')
  @Header('Cache-Control', 'private, no-store')
  systemConfig(@CurrentUser() user: PublicUser, @Req() request: Request) {
    return this.service.systemConfig({ id: user.id, sessionId: request.sessionID });
  }
  @Post('system-config/proposals')
  @Header('Cache-Control', 'private, no-store')
  proposeConfigChange(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Body() body: { settingCode?: string; proposedState?: string; reason?: string },
  ) {
    return this.service.proposeConfigChange(
      { id: user.id, sessionId: request.sessionID },
      body ?? {},
    );
  }
  @Get('system-audit')
  @Header('Cache-Control', 'private, no-store')
  systemAudit(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Query() query: { action?: string; objectType?: string; search?: string; limit?: string },
  ) {
    return this.service.systemAudit({ id: user.id, sessionId: request.sessionID }, query ?? {});
  }
  @Get('technical-escalations')
  @Header('Cache-Control', 'private, no-store')
  technicalEscalations(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Query() query: { status?: string; search?: string },
  ) {
    return this.service.listTechnicalEscalations(
      { id: user.id, sessionId: request.sessionID },
      query ?? {},
    );
  }
  @Post('technical-escalations/:id/respond')
  @Header('Cache-Control', 'private, no-store')
  respondTechnicalEscalation(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      resolutionNote?: string;
      replyToLearner?: boolean;
    },
  ) {
    return this.service.respondTechnicalEscalation(
      { id: user.id, sessionId: request.sessionID },
      id,
      body ?? {},
    );
  }
}
