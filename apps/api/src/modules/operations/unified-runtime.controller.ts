import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { verifyUnifiedTarget } from './unified-runtime.guard';
@Controller('v2/runtime')
export class UnifiedRuntimeController {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
  ) {}
  @Get('identity')
  @Header('Cache-Control', 'private, no-store')
  identity(@CurrentUser() user: PublicUser, @Req() request: Request) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
      const actor = await this.lms.context(tx, { id: user.id, sessionId: request.sessionID });
      const binding = await verifyUnifiedTarget(tx);
      return {
        ...binding,
        viewerId: actor.id,
        mode: 'SINGLE_INTEGRATED_QA',
        releaseFlags: { MEDIA_QA_PASS: false, ACADEMIC_APPROVED: false, PUBLISHED: false },
      };
    });
  }
}
