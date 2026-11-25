import {
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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { PlacementIntegrationService } from './integration.service';
import {
  PlacementPreviewAnswerDto,
  PlacementPreviewCommandDto,
  PlacementPreviewMarkDto,
  PlacementPreviewStartDto,
} from './integration.dto';
const uuid = new ParseUUIDPipe();
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/placement')
@Roles('STUDENT')
export class PlacementIntegrationController {
  constructor(private readonly s: PlacementIntegrationService) {}
  @Get('config') config(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.config(actor(u, r));
  }
  @Get('history') history(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.history(actor(u, r));
  }
  @Post('previews') start(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: PlacementPreviewStartDto,
  ) {
    return this.s.start(actor(u, r), b);
  }
  @Get('attempts/:id/exam') exam(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.exam(actor(u, r), id);
  }
  @Put('attempts/:id/answers/:qid') answer(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('qid', uuid) qid: string,
    @Body() b: PlacementPreviewAnswerDto,
  ) {
    return this.s.write(actor(u, r), id, qid, b, 'ANSWER');
  }
  @Put('attempts/:id/marks/:qid') mark(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('qid', uuid) qid: string,
    @Body() b: PlacementPreviewMarkDto,
  ) {
    return this.s.write(actor(u, r), id, qid, b, 'MARK');
  }
  @Post('attempts/:id/complete') complete(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: PlacementPreviewCommandDto,
  ) {
    return this.s.write(actor(u, r), id, undefined, b, 'COMPLETE');
  }
  @Get('attempts/:id/diagnostic') diagnostic(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.diagnostic(actor(u, r), id);
  }
  @Get('attempts/:id/stimuli/:sid') async media(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('sid', uuid) sid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const m = await this.s.stimulus(actor(u, r), id, sid);
    res.setHeader('Content-Type', m.mimeType ?? 'application/octet-stream');
    return new StreamableFile(m.body);
  }
}
