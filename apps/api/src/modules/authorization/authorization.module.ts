import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { AuthorizationController } from './authorization.controller';
import { WorkspaceController } from './workspace.controller';
@Global()
@Module({
  providers: [AuthorizationService],
  controllers: [AuthorizationController, WorkspaceController],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
