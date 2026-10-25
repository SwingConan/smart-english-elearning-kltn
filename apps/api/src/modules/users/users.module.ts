import { Module } from '@nestjs/common';
import { AdminAccountsService } from './admin-accounts.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserAvatarController } from './users.controller';
import { LocalUserAvatarStorage, UserAvatarStorage } from './user-avatar.storage';

@Module({
  controllers: [UsersController, UserAvatarController],
  providers: [
    UsersService,
    AdminAccountsService,
    LocalUserAvatarStorage,
    { provide: UserAvatarStorage, useExisting: LocalUserAvatarStorage },
  ],
  exports: [UsersService, AdminAccountsService],
})
export class UsersModule {}
