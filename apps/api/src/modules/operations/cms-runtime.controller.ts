import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { PublicUser } from '../users/user.types';
import { CmsRuntimeService, type CmsAction } from './cms-runtime.service';
import { CmsDraftDto, CmsRevisionCommandDto } from './cms-runtime.dto';
const revisionActions = {
  edit: 'edit',
  revise: 'revise',
  submit: 'submit',
  approve: 'approve',
  reject: 'reject',
  publish: 'publish',
  withdraw: 'withdraw',
};
@Controller('v2/operations/cms')
export class CmsRuntimeController {
  constructor(private readonly cms: CmsRuntimeService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  readiness(@CurrentUser() user: PublicUser, @Req() req: Request) {
    return this.cms.readiness({ id: user.id, sessionId: req.sessionID });
  }
  @Post('drafts')
  @Header('Cache-Control', 'private, no-store')
  create(@CurrentUser() user: PublicUser, @Req() req: Request, @Body() body: CmsDraftDto) {
    return this.cms.create({ id: user.id, sessionId: req.sessionID }, body);
  }
  @Post('revisions/:id/:action')
  @Header('Cache-Control', 'private, no-store')
  command(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action', new ParseEnumPipe(revisionActions)) action: CmsAction,
    @Body() body: CmsRevisionCommandDto,
  ) {
    return this.cms.command({ id: user.id, sessionId: req.sessionID }, id, action, body);
  }
  @Get('revisions/:id')
  @Header('Cache-Control', 'private, no-store')
  revision(
    @CurrentUser() user: PublicUser,
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cms.revision({ id: user.id, sessionId: req.sessionID }, id);
  }
}
@Controller('v2/cms/publications')
@Public()
export class CmsPublicController {
  constructor(private readonly cms: CmsRuntimeService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.cms.publications();
  }
  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  detail(@Param('slug') slug: string) {
    return this.cms.publications(slug);
  }
}
