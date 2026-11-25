import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module';
import { SessionEngagementController } from './session-engagement.controller';
import { SessionEngagementService } from './session-engagement.service';
@Module({
  imports: [AcademicModule],
  controllers: [SessionEngagementController],
  providers: [SessionEngagementService],
  exports: [SessionEngagementService],
})
export class SessionEngagementModule {}
