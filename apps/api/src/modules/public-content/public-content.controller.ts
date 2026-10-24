import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import {
  PublicContentQueryDto,
  SavePublicContentDto,
  UpdatePublicContentDto,
} from './public-content.dto';
import { PublicContentService } from './public-content.service';

@Public()
@Controller('public-content')
export class PublicContentController {
  constructor(private readonly service: PublicContentService) {}
  @Get() list(@Query() query: PublicContentQueryDto) {
    return this.service.listPublic(query);
  }
  @Get(':slug') detail(@Param('slug') slug: string) {
    return this.service.publicDetail(slug);
  }
}

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/public-content')
export class AdminPublicContentController {
  constructor(private readonly service: PublicContentService) {}
  @Get() list(@Query() query: PublicContentQueryDto) {
    return this.service.listAdmin(query);
  }
  @Post() create(@CurrentUser() user: PublicUser, @Body() input: SavePublicContentDto) {
    return this.service.create(user.id, input);
  }
  @Get(':id') detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.adminDetail(id);
  }
  @Patch(':id') update(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdatePublicContentDto,
  ) {
    return this.service.update(user.id, id, input);
  }
  @Post(':id/publish') publish(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.publish(user.id, id);
  }
  @Post(':id/archive') archive(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.archive(user.id, id);
  }
}
