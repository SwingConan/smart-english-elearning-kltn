import { Module } from '@nestjs/common';
import { ClassLmsModule } from '../class-lms/class-lms.module';
import { CertificatesWorkspaceController } from './certificates-workspace.controller';
import { CertificatesWorkspaceService } from './certificates-workspace.service';
import { CompletionReadinessController } from './completion-readiness.controller';
import { CompletionReadinessService } from './completion-readiness.service';

@Module({
  imports: [ClassLmsModule],
  controllers: [CompletionReadinessController, CertificatesWorkspaceController],
  providers: [CompletionReadinessService, CertificatesWorkspaceService],
  exports: [CompletionReadinessService, CertificatesWorkspaceService],
})
export class CertificatesModule {}
