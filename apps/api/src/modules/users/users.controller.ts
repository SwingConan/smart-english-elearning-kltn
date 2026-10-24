import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from './user.types';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@Controller('users/me/profile')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user public profile' })
  profile(@CurrentUser() user: PublicUser) {
    return user;
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user name and phone number' })
  update(@CurrentUser() user: PublicUser, @Body() input: UpdateProfileDto) {
    return this.users.updateProfile(user.id, input);
  }
}
