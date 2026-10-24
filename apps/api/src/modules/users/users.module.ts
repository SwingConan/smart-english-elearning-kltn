import { Module } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AdminAccountsService],
  exports: [UsersService, AdminAccountsService],
})
export class UsersModule {}
