import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { AssignmentDraftDto, AssignmentSubmitDto } from './assignment.dto';
import { AssignmentService } from './assignment.service';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/class-lms/classes/:classId/activities/:activityId/assignment')
@Roles('INSTRUCTOR', 'STUDENT')
export class AssignmentController {
  constructor(private readonly service: AssignmentService) {}
  @Get('mine') @Roles('STUDENT') status(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
  ) {
    return this.service.status(actor(u, r), c, a);
  }
  @Put('mine') @Roles('STUDENT') save(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Body() b: AssignmentDraftDto,
  ) {
    return this.service.save(actor(u, r), c, a, b);
  }
  @Post('mine/file')
  @Roles('STUDENT')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 20 * 1024 * 1024 } }))
  upload(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Body() b: AssignmentDraftDto,
    @UploadedFile() f: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!f) throw new BadRequestException('File required; existing draft retained');
    return this.service.save(actor(u, r), c, a, b, f);
  }
  @Post('mine/submit') @Roles('STUDENT') submit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Body() b: AssignmentSubmitDto,
  ) {
    return this.service.submit(actor(u, r), c, a, b);
  }
  @Get('submissions') @Roles('INSTRUCTOR') list(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
  ) {
    return this.service.list(actor(u, r), c, a);
  }
  @Get('submissions/:id/file') async file(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.download(actor(u, r), c, a, id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('attachment', f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.stream);
  }
}
