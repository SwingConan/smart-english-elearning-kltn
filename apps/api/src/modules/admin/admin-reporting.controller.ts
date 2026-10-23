import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminReportingService } from './admin-reporting.service';
import { AdminSystemReportQueryDto } from './dto/admin-system-report-query.dto';

@ApiTags('admin reports')
@ApiBearerAuth()
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/reports')
export class AdminReportingController {
  constructor(private readonly service: AdminReportingService) {}

  @Get('system')
  @ApiOperation({ summary: 'Get the aggregate system report' })
  getSystemReport(@Query() query: AdminSystemReportQueryDto) {
    return this.service.getSystemReport(query);
  }
}
