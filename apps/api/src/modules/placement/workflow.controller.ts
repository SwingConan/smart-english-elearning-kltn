import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { PlacementWorkflowService } from './workflow.service';
import { MicrophoneConfirmDto, MicrophoneUploadDto } from './microphone-check.dto';
import {
  WorkflowAssignDto,
  WorkflowCommandDto,
  WorkflowEvaluationDto,
  WorkflowPolicyDto,
  WorkflowReasonDto,
  WorkflowStartDto,
  WorkflowAnswerDto,
  WorkflowUploadDto,
} from './workflow.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
class WorkflowPrivacy implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const r = context.switchToHttp().getResponse<Response>();
    r.setHeader('Cache-Control', 'private, no-store');
    r.setHeader('Vary', 'Cookie');
    r.setHeader('X-Content-Type-Options', 'nosniff');
    return next.handle();
  }
}
// Current server role/grant/session and attempt ownership are checked inside each transaction.
@Controller('v2/placement/workflow')
@UseInterceptors(WorkflowPrivacy)
export class PlacementWorkflowController {
  constructor(private readonly s: PlacementWorkflowService) {}
  @Get('config') config(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.config(actor(u, r));
  }
  @Get('queue') queue(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.queue(actor(u, r));
  }
  @Get('readiness') readiness(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.readiness(actor(u, r));
  }
  @Post('microphone-checks')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 128 },
    }),
  )
  microphoneCheck(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: MicrophoneUploadDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    return this.s.microphoneCheck(actor(u, r), b, file);
  }
  @Get('microphone-checks/:id') microphoneStatus(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.microphoneStatus(actor(u, r), id);
  }
  @Post('microphone-checks/:id/confirm') confirmMicrophone(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: MicrophoneConfirmDto,
  ) {
    return this.s.confirmMicrophone(actor(u, r), id, b);
  }
  @Get('microphone-checks/:id/audio') async microphoneAudio(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const audio = await this.s.microphoneAudio(actor(u, r), id);
    this.headers(res, 'audio/wav');
    res.setHeader('X-Content-SHA256', audio.sha256);
    return new StreamableFile(audio.body);
  }
  @Post('policies') policy(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: WorkflowPolicyDto,
  ) {
    return this.s.createPolicy(actor(u, r), b);
  }
  @Post('policies/:id/approve') approve(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowReasonDto,
  ) {
    return this.s.approvePolicy(actor(u, r), id, b);
  }
  @Post('attempts') start(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: WorkflowStartDto,
  ) {
    return this.s.start(actor(u, r), b);
  }
  @Get('attempts/:id') exam(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.exam(actor(u, r), id);
  }
  @Post('attempts/:id/commands') command(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowCommandDto,
  ) {
    return this.s.command(actor(u, r), id, b);
  }
  @Post('attempts/:id/answers') answer(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowAnswerDto,
  ) {
    return this.s.answer(actor(u, r), id, b);
  }
  @Post('attempts/:id/assignments') assign(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowAssignDto,
  ) {
    return this.s.assign(actor(u, r), id, b);
  }
  @Get('attempts/:id/review') review(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.review(actor(u, r), id);
  }
  @Post('attempts/:id/evaluations') evaluate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowEvaluationDto,
  ) {
    return this.s.evaluate(actor(u, r), id, b);
  }
  @Post('evaluations/:id/publish') publish(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: WorkflowReasonDto,
  ) {
    return this.s.publish(actor(u, r), id, b);
  }
  @Get('attempts/:id/diagnostic') diagnostic(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.diagnostic(actor(u, r), id, false);
  }
  @Post('attempts/:id/advisory')
  @HttpCode(200)
  advisory(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.diagnostic(actor(u, r), id, true);
  }
  @Get('attempts/:id/recordings/:qid') async recording(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('qid', uuid) qid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = await this.s.recording(actor(u, r), id, qid);
    this.headers(res, m.mimeType);
    res.setHeader('X-Content-SHA256', m.sha256);
    return new StreamableFile(m.body);
  }
  @Get('attempts/:id/stimuli/:sid') async stimulus(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('sid', uuid) sid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = await this.s.stimulus(actor(u, r), id, sid);
    this.headers(res, m.mimeType);
    return new StreamableFile(m.body);
  }
  @Post('attempts/:id/recordings/:qid/begin')
  begin(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('qid', uuid) qid: string,
    @Body() b: WorkflowUploadDto,
  ) {
    return this.s.beginRecording(actor(u, r), id, qid, b);
  }
  @Post('attempts/:id/recordings/:qid')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024 },
    }),
  )
  upload(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('qid', uuid) qid: string,
    @Body() b: WorkflowUploadDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    return this.s.upload(actor(u, r), id, qid, b, file);
  }
  private headers(res: Response, mime: string) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', mime);
  }
}
