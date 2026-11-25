import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { S10DurableService, type DurableCommand } from './s10-durable.service';

@Controller('placement/attempts/:attemptId/tasks/:questionId/s10')
export class S10DurableController {
  constructor(private readonly service: S10DurableService) {}
  private actor(user: PublicUser, req: Request) {
    return { id: user.id, role: user.role, sessionId: req.sessionID };
  }
  @Roles(UserRole.STUDENT)
  @Get()
  state(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.headers(res);
    return this.service.state(this.actor(user, req), a, q);
  }
  @Roles(UserRole.STUDENT)
  @Post('commands')
  command(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.headers(res);
    return this.service.command(this.actor(user, req), a, q, body);
  }
  @Roles(UserRole.STUDENT)
  @Post('media')
  async media(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Body() body: DurableCommand,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.headers(res);
    const media = await this.service.readMedia(
      this.actor(user, req),
      a,
      q,
      body,
      req.headers.range,
    );
    if (!('body' in media)) return media;
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Accept-Ranges', 'none');
    return new StreamableFile(media.body);
  }
  @Roles(UserRole.STUDENT)
  @Post('answer')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, fields: 1, fieldSize: 4096, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Body('command') command: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    let input: unknown;
    try {
      input = JSON.parse(command);
    } catch {
      input = null;
    }
    return this.service.upload(this.actor(user, req), a, q, input, file);
  }
  @Roles(UserRole.ACADEMIC_MANAGER)
  @Post('recovery')
  reset(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Body() body: { key?: string; epoch?: string; reason?: string },
  ) {
    return this.service.reset(this.actor(user, req), a, q, body);
  }
  @Roles(UserRole.ACADEMIC_MANAGER)
  @Get('recovery')
  review(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.headers(res);
    return this.service.review(this.actor(user, req), a, q);
  }
  @Roles(UserRole.STUDENT, UserRole.INSTRUCTOR, UserRole.ACADEMIC_MANAGER)
  @Post('incidents')
  incident(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId', new ParseUUIDPipe()) a: string,
    @Param('questionId', new ParseUUIDPipe()) q: string,
    @Body('reason') reason: unknown,
  ) {
    return this.service.incident(this.actor(user, req), a, q, reason);
  }
  private headers(res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
