import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { catchError, throwError } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { SupportService } from './support.service';
import {
  buildSupportContentDisposition,
  MAX_ATTACHMENT_BYTES,
  MAX_TICKET_ATTACHMENTS,
  type UploadedSupportFile,
} from './support-attachment.policy';
import {
  CounselingActionDto,
  CounselingDraftDto,
  SupportActionDto,
  SupportChangeDto,
  SupportConsentDto,
  SupportCreateDto,
  SupportMessageDto,
  SupportReferralDto,
  SupportReferralReplyDto,
  SupportTechnicalEscalationDto,
  SupportTopicDto,
} from './support.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
class SupportPrivacy implements NestInterceptor {
  private readonly logger = new Logger('SupportHTTP');
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const res = ctx.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const req = ctx.switchToHttp().getRequest<Request>(),
      incoming = req.header('X-Request-Id'),
      correlation = incoming && /^[a-f0-9-]{36}$/i.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', correlation);
    return next.handle().pipe(
      catchError((e: unknown) => {
        const status =
          typeof e === 'object' &&
          e !== null &&
          'getStatus' in e &&
          typeof e.getStatus === 'function'
            ? Number(e.getStatus())
            : 500;
        if (status >= 500)
          this.logger.error(
            JSON.stringify({
              family: 'support_http',
              correlation,
              status,
              handler: ctx.getHandler().name,
            }),
          );
        return throwError(() => e);
      }),
    );
  }
}
@Controller('v2/support')
@UseInterceptors(SupportPrivacy)
export class SupportController {
  constructor(private readonly s: SupportService) {}
  @Get('availability') availability(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.availability(actor(u, r));
  }
  @Public() @Get('public/topics') topics() {
    return this.s.publicTopics();
  }
  @Public() @Post('public/tickets') create(@Req() r: Request, @Body() b: SupportCreateDto) {
    if (!r.session?.userId && /(?:^|;\s*)sel\.sid=/.test(r.headers.cookie ?? ''))
      throw new UnauthorizedException('Invalid session is not guest authorization');
    return this.s.create(
      r.session?.userId ? { id: r.session.userId, sessionId: r.sessionID } : null,
      r.ip ?? 'unknown',
      b,
    );
  }
  @Get('config') config(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.config(actor(u, r));
  }
  @Post('topics') topic(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: SupportTopicDto,
  ) {
    return this.s.topic(actor(u, r), b);
  }
  @Post('topics/:id/approve') approve(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportChangeDto,
  ) {
    return this.s.approveTopic(actor(u, r), id, b);
  }
  @Get('tickets') inbox(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Query('state') state?: string,
  ) {
    return this.s.inbox(actor(u, r), state);
  }
  @Get('tickets/:id') detail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.detail(actor(u, r), id);
  }
  @Post('tickets/:id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_TICKET_ATTACHMENTS, {
      limits: { files: MAX_TICKET_ATTACHMENTS, fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  uploadAttachments(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @UploadedFiles() files?: UploadedSupportFile[],
  ) {
    return this.s.uploadAttachments(actor(u, r), id, files ?? []);
  }
  @Get('tickets/:id/attachments/:attachmentId/file')
  async downloadAttachment(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('attachmentId', uuid) attachmentId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.s.downloadAttachment(actor(u, r), id, attachmentId, download === '1');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader(
      'Content-Disposition',
      buildSupportContentDisposition(f.inline ? 'inline' : 'attachment', f.originalName),
    );
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.buffer);
  }
  @Get('tickets/:id/assignable') assignable(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.assignable(actor(u, r), id);
  }
  @Post('tickets/:id/actions') action(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportActionDto,
  ) {
    return this.s.action(actor(u, r), id, b);
  }
  @Post('tickets/:id/messages') message(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportMessageDto,
  ) {
    return this.s.message(actor(u, r), id, b);
  }
  @Post('tickets/:id/consents') consent(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportConsentDto,
  ) {
    return this.s.consent(actor(u, r), id, b);
  }
  @Post('tickets/:id/referrals') referral(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportReferralDto,
  ) {
    return this.s.referral(actor(u, r), id, b);
  }
  @Post('tickets/:id/technical-escalations') escalateTechnical(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportTechnicalEscalationDto,
  ) {
    return this.s.escalateToAdmin(actor(u, r), id, b);
  }
  @Get('referrals') referrals(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.referrals(actor(u, r));
  }
  @Post('referrals/:id/respond') respond(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: SupportReferralReplyDto,
  ) {
    return this.s.replyReferral(actor(u, r), id, b);
  }
  @Post('tickets/:id/applications') draft(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: CounselingDraftDto,
  ) {
    return this.s.draft(actor(u, r), id, b);
  }
  @Get('tickets/:id/interests') interests(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.interests(actor(u, r), id);
  }
  @Get('applications') applications(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.applications(actor(u, r));
  }
  @Post('applications/:id/actions') applicationAction(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: CounselingActionDto,
  ) {
    return this.s.applicationAction(actor(u, r), id, b);
  }
}
