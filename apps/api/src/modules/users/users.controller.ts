import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user name and phone number' })
  update(@CurrentUser() user: PublicUser, @Body() input: UpdateProfileDto) {
    return this.users.updateProfile(user.id, input);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadAvatar(
    @CurrentUser() user: PublicUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh đại diện.');
    return this.users.uploadAvatar(user.id, file);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser() user: PublicUser) {
    return this.users.removeAvatar(user.id);
  }
}

@ApiTags('users')
@Controller('user-assets/avatars')
export class UserAvatarController {
  constructor(private readonly users: UsersService) {}

  @Get(':key')
  async open(@Param('key') key: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.users.openAvatar(key);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.stream);
  }
}
