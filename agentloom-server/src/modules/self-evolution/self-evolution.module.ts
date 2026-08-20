import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AgentDefinitionModule } from '../agent-definition/agent-definition.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SkillModule } from '../skill/skill.module';
import { WorkflowDefinitionModule } from '../workflow-definition/workflow-definition.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SelfEvolutionPermissionService } from './self-evolution-permission.service';
import { SelfEvolutionService } from './self-evolution.service';
import { SelfEvolutionToolsProvider } from './self-evolution-tools.provider';
import { SelfEvolutionReadService } from './self-evolution-read.service';
import { SelfEvolutionMutationService } from './self-evolution-mutation.service';
import { SelfEvolutionPermissionPolicy } from './self-evolution-permission-policy';
import { SelfEvolutionGraphPatch } from './self-evolution-graph-patch';

@Module({
  imports: [
    DatabaseModule,
    AgentDefinitionModule,
    SkillModule,
    LlmModule,
    McpModule,
    SandboxModule,
    WorkspaceModule,
    WorkflowDefinitionModule,
  ],
  providers: [
    SelfEvolutionPermissionService,
    SelfEvolutionService,
    SelfEvolutionToolsProvider,
    SelfEvolutionReadService,
    SelfEvolutionMutationService,
    SelfEvolutionPermissionPolicy,
    SelfEvolutionGraphPatch,
  ],
  exports: [
    SelfEvolutionPermissionService,
    SelfEvolutionService,
    SelfEvolutionToolsProvider,
  ],
})
export class SelfEvolutionModule {}
