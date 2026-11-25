import { Body, ConflictException, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AdminAccountsService } from '../users/admin-accounts.service';
import { Permission } from '../authorization/permission.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  AdminAccountQueryDto,
  CreateStaffAccountDto,
  UpdateAccountRoleDto,
  UpdateAccountStatusDto,
} from '../users/dto/admin-account.dto';

@ApiTags('admin accounts')
@Roles(UserRole.ADMIN_COORDINATOR)
@Permission('accounts.manage')
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService, private readonly authority: AuthorizationService) {}

  @Get()
  @ApiOperation({ summary: 'List and summarize sanitized accounts' })
  list(@Query() query: AdminAccountQueryDto) {
    return this.accounts.list(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get sanitized account details and dependencies' })
  detail(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.accounts.getById(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an active staff account' })
  create(@Body() input: CreateStaffAccountDto, @CurrentUser() actor: PublicUser, @Req() req: Request) {
    return this.authority.createAccount({ id: actor.id, sessionId: req.sessionID }, input);
  }

  @Patch(':userId/role')
  @ApiOperation({ summary: 'Safely change a staff account role' })
  updateRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateAccountRoleDto,
    @CurrentUser() actor: PublicUser,
  ) {
    void actor; void userId; void input;
    throw new ConflictException({ code: 'ROLE_DECISION_REQUIRED', message: 'Use authority role request and independent approval' });
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Safely change an account status' })
  updateStatus(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateAccountStatusDto,
    @CurrentUser() actor: PublicUser,
    @Req() req: Request,
  ) {
    return this.authority.updateStatus({ id: actor.id, sessionId: req.sessionID }, userId, input.status, input.reason);
  }
}
