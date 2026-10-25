import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import {
  PublicContentQueryDto,
  SavePublicContentDto,
  SavePublicContentCategoryDto,
  UpdatePublicContentCategoryDto,
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
  @Get('categories') categories() {
    return this.service.categories(false);
  }
  @Get(':slug') detail(@Param('slug') slug: string) {
    return this.service.publicDetail(slug);
  }
}

@Public()
@Controller('public-content-assets')
export class PublicContentAssetsController {
  constructor(private readonly service: PublicContentService) {}
  @Get(':key')
  async open(@Param('key') key: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.openAsset(key);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.stream);
  }
}

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/public-content/categories')
export class AdminPublicContentCategoriesController {
  constructor(private readonly service: PublicContentService) {}
  @Get() list() {
    return this.service.categories(true);
  }
  @Post() create(@CurrentUser() user: PublicUser, @Body() input: SavePublicContentCategoryDto) {
    return this.service.createCategory(user.id, input);
  }
  @Patch(':id') update(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdatePublicContentCategoryDto,
  ) {
    return this.service.updateCategory(user.id, id, input);
  }
  @Delete(':id') remove(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteCategory(user.id, id);
  }
}

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/public-content/assets')
export class AdminPublicContentAssetsController {
  constructor(private readonly service: PublicContentService) {}
  @Get() list() {
    return this.service.listAssets();
  }
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: PublicUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh.');
    return this.service.uploadAsset(user.id, file);
  }
  @Delete(':id') remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.removeAsset(id);
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
