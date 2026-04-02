import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AgentDefinitionModule } from '../agent-definition/agent-definition.module';
import { LlmModule } from '../llm/llm.module';
import { McpModule } from '../mcp/mcp.module';
import { SkillModule } from '../skill/skill.module';
import { WorkflowDefinitionModule } from '../workflow-definition/workflow-definition.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SelfEvolutionPermissionService } from './self-evolution-permission.service';
import { SelfEvolutionService } from './self-evolution.service';
import { SelfEvolutionToolsProvider } from './self-evolution-tools.provider';

@Module({
  imports: [
    DatabaseModule,
    AgentDefinitionModule,
    SkillModule,
    LlmModule,
    McpModule,
    WorkspaceModule,
    WorkflowDefinitionModule,
  ],
  providers: [
    SelfEvolutionPermissionService,
    SelfEvolutionService,
    SelfEvolutionToolsProvider,
  ],
  exports: [
    SelfEvolutionPermissionService,
    SelfEvolutionService,
    SelfEvolutionToolsProvider,
  ],
})
export class SelfEvolutionModule {}
