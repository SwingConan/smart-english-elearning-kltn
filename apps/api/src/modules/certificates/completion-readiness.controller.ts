import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { CompletionReadinessService } from './completion-readiness.service';

@Controller('v2/certificates')
@Roles('STUDENT')
export class CompletionReadinessController {
  constructor(private readonly service: CompletionReadinessService) {}
  @Get('readiness')
  @Header('Cache-Control', 'private, no-store')
  read(@CurrentUser() user: PublicUser, @Req() request: Request) {
    return this.service.read({ id: user.id, sessionId: request.sessionID });
  }
}
