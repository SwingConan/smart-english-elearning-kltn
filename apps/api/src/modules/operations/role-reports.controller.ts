import { Body, Controller, Get, Header, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import { RoleReportsService } from './role-reports.service';
import { RolePeriodAnalyticsService } from './role-period-analytics.service';
import { RoleReportQuery } from './role-reports.dto';
@Controller('v2/operations/role-reports')
export class RoleReportsController {
  constructor(
    private readonly reports: RoleReportsService,
    private readonly periodAnalytics: RolePeriodAnalyticsService,
  ) {}

  @Get('period-analytics')
  @Header('Cache-Control', 'private, no-store')
  periodReport(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Query() query: { preset?: string; from?: string; to?: string; scopeId?: string },
  ) {
    return this.periodAnalytics.getPeriodReport(
      { id: user.id, sessionId: request.sessionID },
      query ?? {},
    );
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  view(@CurrentUser() user: PublicUser, @Req() request: Request, @Query() query: RoleReportQuery) {
    return this.reports.view({ id: user.id, sessionId: request.sessionID }, query);
  }
  @Get('trend')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  trend(
    @CurrentUser() user: PublicUser,
    @Req() request: Request,
    @Query() query: RoleReportQuery,
  ) {
    return this.reports.trend({ id: user.id, sessionId: request.sessionID }, query, 7);
  }
  @Post('export')
  @Header('Cache-Control', 'private, no-store')
  export(@CurrentUser() user: PublicUser, @Req() request: Request, @Body() query: RoleReportQuery) {
    return this.reports.export({ id: user.id, sessionId: request.sessionID }, query);
  }
}
