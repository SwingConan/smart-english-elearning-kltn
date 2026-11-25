import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { contentDisposition } from '../learning/content-disposition';
import {
  ActivityDto,
  MonthDto,
  OrderDto,
  RevisionDto,
  SectionDto,
  UpdateActivityDto,
  UpdateSectionDto,
} from './class-lms.dto';
import { ClassLmsService } from './class-lms.service';
import { ClassDashboardService } from './class-dashboard.service';
import { ClassProgressService } from './class-progress.service';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/class-lms/classes/:classId')
@Roles('INSTRUCTOR', 'STUDENT')
export class ClassLmsController {
  constructor(
    private readonly service: ClassLmsService,
    private readonly progress: ClassProgressService,
  ) {}
  @Get('progress')
  @Roles('STUDENT')
  @Header('Cache-Control', 'private, no-store')
  learnerProgress(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
  ) {
    return this.progress.read(actor(u, r), c);
  }
  @Post('sections/:id/publish')
  @Roles('INSTRUCTOR')
  publishSection(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: RevisionDto,
  ) {
    return this.service.publishSection(actor(u, r), c, id, b.expectedLockVersion);
  }
  @Get('activities/:id')
  detail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.detail(actor(u, r), c, id);
  }
  @Get() tree(@CurrentUser() u: PublicUser, @Req() r: Request, @Param('classId', uuid) c: string) {
    return this.service.tree(actor(u, r), c);
  }
  @Post('sections') @Roles('INSTRUCTOR') section(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Body() b: SectionDto,
  ) {
    return this.service.section(actor(u, r), c, b);
  }
  @Patch('sections/:id') @Roles('INSTRUCTOR') editSection(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: UpdateSectionDto,
  ) {
    return this.service.section(actor(u, r), c, b, id);
  }
  @Post('sections/reorder') @Roles('INSTRUCTOR') orderSections(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Body() b: OrderDto,
  ) {
    return this.service.reorder(actor(u, r), c, b);
  }
  @Get('sources') @Roles('INSTRUCTOR') sources(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
  ) {
    return this.service.sources(actor(u, r), c);
  }
  @Post('sections/:sectionId/activities') @Roles('INSTRUCTOR') create(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('sectionId', uuid) s: string,
    @Body() b: ActivityDto,
  ) {
    return this.service.saveActivity(actor(u, r), c, s, b);
  }
  @Patch('sections/:sectionId/activities/:id') @Roles('INSTRUCTOR') edit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('sectionId', uuid) s: string,
    @Param('id', uuid) id: string,
    @Body() b: UpdateActivityDto,
  ) {
    return this.service.saveActivity(actor(u, r), c, s, b, id);
  }
  @Post('sections/:sectionId/reorder') @Roles('INSTRUCTOR') orderActivities(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('sectionId', uuid) s: string,
    @Body() b: OrderDto,
  ) {
    return this.service.reorder(actor(u, r), c, b, s);
  }
  @Post('activities/:id/publish') @Roles('INSTRUCTOR') publish(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: RevisionDto,
  ) {
    return this.service.publish(actor(u, r), c, id, b.expectedLockVersion);
  }
  @Post('activities/:id/hide') @Roles('INSTRUCTOR') hide(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: RevisionDto,
  ) {
    return this.service.publish(actor(u, r), c, id, b.expectedLockVersion, true);
  }
  @Delete('sections/:id') @Roles('INSTRUCTOR') deleteSection(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.deleteSection(actor(u, r), c, id);
  }
  @Delete('activities/:id') @Roles('INSTRUCTOR') deleteActivity(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.deleteActivity(actor(u, r), c, id);
  }
  @Post('activities/:id/open') @Roles('STUDENT') open(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.progress(actor(u, r), c, id);
  }
  @Post('activities/:id/complete') @Roles('STUDENT') complete(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.progress(actor(u, r), c, id, true);
  }
  @Post('activities/:id/file')
  @Roles('INSTRUCTOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: RevisionDto,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.service.upload(actor(u, r), c, id, b.expectedLockVersion, file);
  }
  @Get('activities/:id/file') async file(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.download(actor(u, r), c, id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('attachment', f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.stream);
  }
}
@Controller('v2/my')
export class ClassDashboardController {
  constructor(private readonly service: ClassDashboardService) {}
  @Get('classes') classes(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.service.classes(actor(u, r));
  }
  @Get('calendar') month(@CurrentUser() u: PublicUser, @Req() r: Request, @Query() q: MonthDto) {
    return this.service.month(actor(u, r), q.month, q.classId);
  }
  @Get('events/:id') event(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.detail(actor(u, r), id);
  }
}
