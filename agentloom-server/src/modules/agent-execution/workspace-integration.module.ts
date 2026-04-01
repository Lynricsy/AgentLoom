import { Module } from '@nestjs/common';

import { AgentModule } from '../agent/agent.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { WorkspaceIntegrationService } from './workspace-integration.service';

@Module({
  imports: [AgentModule, SandboxModule, WorkspaceModule],
  providers: [WorkspaceIntegrationService],
  exports: [WorkspaceIntegrationService],
})
export class WorkspaceIntegrationModule {}
