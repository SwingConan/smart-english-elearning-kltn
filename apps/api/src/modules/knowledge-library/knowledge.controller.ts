import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { KnowledgeLibraryService } from './knowledge.service';
import {
  KnowledgeDraftDto,
  KnowledgeLinkDto,
  KnowledgeQueryDto,
  KnowledgeSelfCheckDto,
  KnowledgeTransitionDto,
} from './knowledge.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/knowledge')
export class KnowledgeLibraryController {
  constructor(private readonly service: KnowledgeLibraryService) {}
  @Get('workspace') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') workspace(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
  ) {
    return this.service.workspace(actor(u, r));
  }
  @Get('articles') @Roles('STUDENT') browse(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Query() q: KnowledgeQueryDto,
  ) {
    return this.service.browse(actor(u, r), q);
  }
  @Get('recommendations') @Roles('STUDENT') recommendations(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Query() _q: KnowledgeQueryDto,
  ) {
    return this.service.recommendations(actor(u, r));
  }
  @Get('articles/:slug') @Roles('STUDENT') article(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('slug') s: string,
    @Query() _q: KnowledgeQueryDto,
  ) {
    return this.service.article(actor(u, r), s);
  }
  @Post('articles/:slug/self-check') @Roles('STUDENT') selfCheck(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('slug') s: string,
    @Body() b: KnowledgeSelfCheckDto,
  ) {
    return this.service.selfCheck(actor(u, r), s, b);
  }
  @Get('revisions/:id') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') detail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.service.detail(actor(u, r), id);
  }
  @Post('entries') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') create(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: KnowledgeDraftDto,
  ) {
    return this.service.save(actor(u, r), b);
  }
  @Post('entries/:id/revisions') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') next(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: KnowledgeDraftDto,
  ) {
    return this.service.save(actor(u, r), b, id);
  }
  @Put('revisions/:id') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') edit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: KnowledgeDraftDto,
  ) {
    return this.service.save(actor(u, r), b, undefined, id);
  }
  @Post('revisions/:id/:action') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') transition(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('action') action: string,
    @Body() b: KnowledgeTransitionDto,
  ) {
    if (!['submit', 'review', 'reject', 'publish'].includes(action)) throw new NotFoundException();
    return this.service.transition(
      actor(u, r),
      id,
      action as 'submit' | 'review' | 'reject' | 'publish',
      b,
    );
  }
  @Post('entries/:id/withdraw') @Roles('ACADEMIC_MANAGER') withdraw(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: KnowledgeTransitionDto,
  ) {
    return this.service.withdraw(actor(u, r), id, b);
  }
  @Get('quiz-sources/:classId') @Roles('INSTRUCTOR') sources(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
  ) {
    return this.service.sources(actor(u, r), c);
  }
  @Post('links') @Roles('INSTRUCTOR') link(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: KnowledgeLinkDto,
  ) {
    return this.service.createLink(actor(u, r), b);
  }
  @Post('links/:id/:action') @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER') linkTransition(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Param('action') action: string,
    @Body() b: KnowledgeTransitionDto,
  ) {
    if (!['submit', 'review', 'reject', 'publish', 'withdraw'].includes(action))
      throw new NotFoundException();
    return this.service.linkTransition(
      actor(u, r),
      id,
      action as 'submit' | 'review' | 'reject' | 'publish' | 'withdraw',
      b,
    );
  }
}
