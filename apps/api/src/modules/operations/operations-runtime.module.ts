import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { AdmissionsFinanceModule } from '../admissions-finance/admissions-finance.module';
import { InspectionModule } from '../inspection/inspection.module';
import { RoleReportAdapters } from './role-report-adapters.service';
import { ClassLmsModule } from '../class-lms/class-lms.module';
import { OperationsRuntimeService } from './operations-runtime.service';
import { OperationsRuntimeController } from './operations-runtime.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoleReportsService } from './role-reports.service';
import { RolePeriodAnalyticsService } from './role-period-analytics.service';
import { RoleReportsController } from './role-reports.controller';
import { CmsRuntimeService } from './cms-runtime.service';
import { CmsRuntimeController, CmsPublicController } from './cms-runtime.controller';
import { UnifiedRuntimeController } from './unified-runtime.controller';

@Module({
  imports: [
    ClassLmsModule,
    AuthorizationModule,
    SupportModule,
    AdmissionsFinanceModule,
    InspectionModule,
  ],
  providers: [OperationsRuntimeService, RoleReportsService, RoleReportAdapters, RolePeriodAnalyticsService, CmsRuntimeService],
  controllers: [
    OperationsRuntimeController,
    RoleReportsController,
    CmsRuntimeController,
    CmsPublicController,
    UnifiedRuntimeController,
  ],
})
export class OperationsRuntimeModule {}
