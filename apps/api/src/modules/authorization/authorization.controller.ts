import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { AuthorizationService } from './authorization.service';
import { GrantRequestDto, ReasonDto, RoleRequestDto } from './authority.dto';
import { Permission } from './permission.decorator';

@Controller('authority')
@Permission('accounts.manage')
export class AuthorizationController {
  constructor(private readonly authority: AuthorizationService) {}
  @Get() overview() {
    return this.authority.overview();
  }
  @Get('me')
  @Permission('accounts.manage')
  async me(@CurrentUser() user: PublicUser) {
    return { canApprove: await this.authority.permits(user.id, 'authority.approve') };
  }
  @Post('grants')
  requestGrant(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Body() input: GrantRequestDto,
  ) {
    return this.authority.requestGrant({ id: user.id, sessionId: req.sessionID }, input);
  }
  @Post('grants/:id/approve')
  @Permission('authority.approve')
  approveGrant(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.authority.approveGrant({ id: user.id, sessionId: req.sessionID }, id);
  }
  @Post('grants/:id/revoke')
  revokeGrant(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.authority.revokeGrant({ id: user.id, sessionId: req.sessionID }, id, input.reason);
  }
  @Post('roles')
  requestRole(@CurrentUser() user: PublicUser, @Req() req: Request, @Body() input: RoleRequestDto) {
    return this.authority.requestRole(
      { id: user.id, sessionId: req.sessionID },
      input.userId,
      input.nextRole,
      input.reason,
    );
  }
  @Post('recovery-permissions/:id/revoke')
  revokeRecovery(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReasonDto,
  ) {
    return this.authority.revokeRecovery(
      { id: user.id, sessionId: req.sessionID },
      id,
      input.reason,
    );
  }
  @Post('roles/:id/approve')
  @Permission('authority.approve')
  approveRole(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.authority.approveRole({ id: user.id, sessionId: req.sessionID }, id);
  }
}
