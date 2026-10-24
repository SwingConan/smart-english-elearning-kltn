import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { CertificateQueryDto, CompletionPolicyDto, RevokeCertificateDto } from './certificates.dto';
import { CertificatesService } from './certificates.service';

@Roles(UserRole.STUDENT)
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}
  @Get('my') list(@CurrentUser() user: PublicUser) {
    return this.service.listMine(user.id);
  }
  @Get('enrollments/:enrollmentId/completion') readiness(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.readiness(user.id, enrollmentId);
  }
  @Post('enrollments/:enrollmentId/evaluate') evaluate(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ) {
    return this.service.evaluate(user.id, enrollmentId);
  }
  @Get(':id/download') async download(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: Response,
  ) {
    const body = await this.service.printable(user.id, id);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="certificate-${id}.html"`);
    response.send(body);
  }
  @Get(':id') detail(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getMine(user.id, id);
  }
}

@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin')
export class AdminCertificatesController {
  constructor(private readonly service: CertificatesService) {}
  @Get('class-offerings/:classOfferingId/completion-policy') policy(
    @Param('classOfferingId', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getPolicy(id);
  }
  @Put('class-offerings/:classOfferingId/completion-policy') putPolicy(
    @Param('classOfferingId', new ParseUUIDPipe()) id: string,
    @Body() input: CompletionPolicyDto,
  ) {
    return this.service.putPolicy(id, input);
  }
  @Get('certificates') list(@Query() query: CertificateQueryDto) {
    return this.service.listAdmin(query);
  }
  @Get('certificates/:id') detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.adminDetail(id);
  }
  @Post('certificates/:id/revoke') revoke(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: RevokeCertificateDto,
  ) {
    return this.service.revoke(user.id, id, input.reason);
  }
}
