import { Module } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService, AdminAccountsService],
  exports: [UsersService, AdminAccountsService],
})
export class UsersModule {}
