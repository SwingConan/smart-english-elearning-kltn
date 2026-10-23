import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminReportingService } from './admin-reporting.service';
import {
  AdminReportClassesQueryDto,
  AdminReportEnrollmentsQueryDto,
  AdminReportGradingBacklogQueryDto,
  AdminSystemReportQueryDto,
} from './dto/admin-system-report-query.dto';

@ApiTags('admin reports')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/reports')
export class AdminReportingController {
  constructor(private readonly service: AdminReportingService) {}

  @Get('system')
  @ApiOperation({ summary: 'Get the aggregate system report' })
  getSystemReport(@Query() query: AdminSystemReportQueryDto) {
    return this.service.getSystemReport(query);
  }

  @Get('classes')
  @ApiOperation({ summary: 'List exact classes behind report aggregates' })
  listClasses(@Query() query: AdminReportClassesQueryDto) {
    return this.service.listClasses(query);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'List exact enrollments behind report aggregates' })
  listEnrollments(@Query() query: AdminReportEnrollmentsQueryDto) {
    return this.service.listEnrollments(query);
  }

  @Get('grading-backlog')
  @ApiOperation({ summary: 'List productive submissions awaiting final Instructor review' })
  listGradingBacklog(@Query() query: AdminReportGradingBacklogQueryDto) {
    return this.service.listGradingBacklog(query);
  }
}
