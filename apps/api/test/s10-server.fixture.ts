// Contract experiment only. Never register this controller in PlacementModule.
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { UserRole } from '../src/generated/prisma/client';
import { CurrentUser } from '../src/modules/auth/decorators/current-user.decorator';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import type { PublicUser } from '../src/modules/users/user.types';
import { PlacementService } from '../src/modules/placement/placement.service';
import {
  S10ContractError,
  S10LedgerPrototype,
  type S10Actor,
  type S10Command,
} from '../src/modules/placement/s10-ledger.prototype';
import { createMediaPilotFixture, fixtureIds } from './se-sw-media.fixture';

@Controller('fixture/s10/:attemptId/:questionId')
@Roles(UserRole.STUDENT)
class S10FixtureController {
  constructor(
    @Inject('S10_TEST_LEDGER') private readonly ledger: S10LedgerPrototype,
    private readonly placement: PlacementService,
  ) {}
  private actor(user: PublicUser, req: Request): S10Actor {
    return { learnerId: user.id, sessionId: req.sessionID };
  }
  private async access(user: PublicUser, attemptId: string, questionId: string) {
    const exam = await this.placement.getExam(user.id, attemptId);
    if (
      exam.state !== 'IN_PROGRESS' ||
      attemptId !== fixtureIds.attempt ||
      questionId !== fixtureIds.question
    )
      throw new S10ContractError('TASK_NOT_FOUND', 404);
  }
  @Get('state')
  async state(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
  ) {
    await this.access(user, attemptId, questionId);
    return this.ledger.state(this.actor(user, req));
  }
  @Post('events')
  async event(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Body() command: S10Command,
  ) {
    await this.access(user, attemptId, questionId);
    if (command?.action === 'UPLOAD_BEGIN')
      throw new BadRequestException('Use the multipart answer operation');
    return this.ledger.command(this.actor(user, req), command);
  }
  @Get('media')
  async media(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Vary', 'Cookie');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    await this.access(user, attemptId, questionId);
    const actor = this.actor(user, req);
    const tabId = String(req.headers['x-s10-tab'] ?? ''),
      leaseToken = String(req.headers['x-s10-lease'] ?? ''),
      nonce = String(req.headers['x-s10-nonce'] ?? '');
    this.ledger.readMedia(actor, tabId, leaseToken, nonce);
    try {
      const media = await this.placement.openStimulusMedia(user.id, attemptId, fixtureIds.audio);
      if (createHash('sha256').update(media.body).digest('hex') !== this.ledger.binding.mediaSha256)
        throw new Error('media version changed');
      response.setHeader('Content-Type', media.mimeType);
      return new StreamableFile(media.body);
    } catch {
      this.ledger.command(actor, {
        action: 'INTERRUPT',
        key: randomUUID(),
        epoch: this.ledger.epoch,
        revision: this.ledger.state(actor).revision,
        tabId,
        leaseToken,
      });
      throw new S10ContractError('MEDIA_UNAVAILABLE_BLOCKED', 503);
    }
  }
  @Post('answer')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async answer(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('attemptId') attemptId: string,
    @Param('questionId') questionId: string,
    @Body('command') serialized: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    await this.access(user, attemptId, questionId);
    if (!file?.buffer.length) throw new BadRequestException('Audio required');
    let command: S10Command;
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('invalid');
      command = parsed as S10Command;
    } catch {
      throw new BadRequestException('Invalid event');
    }
    command.digest = createHash('sha256').update(file.buffer).digest('hex');
    return this.ledger.upload(this.actor(user, req), command, async () => {
      await this.placement.uploadAudio(user.id, attemptId, questionId, file);
    });
  }
}

export async function createS10ServerFixture(
  bytes: Buffer,
  durationMs: number,
  clock: { now: () => number },
  configure?: Parameters<typeof createMediaPilotFixture>[2],
) {
  const ledger = new S10LedgerPrototype(
    {
      learnerId: 'fixture-owner',
      attemptId: fixtureIds.attempt,
      questionId: fixtureIds.question,
      contentVersion: 'v01',
      assetVersion: 'v01',
      mediaSha256: createHash('sha256').update(bytes).digest('hex'),
      durationMs,
    },
    clock.now,
    120000,
  );
  const fixture = await createMediaPilotFixture(
    bytes,
    undefined,
    (app) => {
      app.useGlobalFilters({
        catch(error: unknown, host) {
          const response = host.switchToHttp().getResponse<Response>();
          if (error instanceof S10ContractError) {
            response.status(error.status).json({ code: error.code });
            return;
          }
          const known = error as { getStatus?: () => number; getResponse?: () => unknown };
          response
            .status(known.getStatus?.() ?? 500)
            .json(known.getResponse?.() ?? { code: 'FIXTURE_ERROR' });
        },
      });
      configure?.(app);
    },
    {
      controllers: [S10FixtureController],
      providers: [{ provide: 'S10_TEST_LEDGER', useValue: ledger }],
    },
  );
  return {
    ...fixture,
    ledger,
    base: `/api/fixture/s10/${fixtureIds.attempt}/${fixtureIds.question}`,
  };
}
