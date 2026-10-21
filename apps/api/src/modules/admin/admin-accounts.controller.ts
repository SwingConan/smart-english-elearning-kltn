import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AdminAccountsService } from '../users/admin-accounts.service';
import {
  AdminAccountQueryDto,
  CreateStaffAccountDto,
  UpdateAccountRoleDto,
  UpdateAccountStatusDto,
} from '../users/dto/admin-account.dto';

@ApiTags('admin accounts')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/accounts')
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

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
  create(@Body() input: CreateStaffAccountDto) {
    return this.accounts.create(input);
  }

  @Patch(':userId/role')
  @ApiOperation({ summary: 'Safely change a staff account role' })
  updateRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateAccountRoleDto,
    @CurrentUser() actor: PublicUser,
  ) {
    return this.accounts.updateRole(actor.id, userId, input.role);
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Safely change an account status' })
  updateStatus(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateAccountStatusDto,
    @CurrentUser() actor: PublicUser,
  ) {
    return this.accounts.updateStatus(actor.id, userId, input.status);
  }
}
