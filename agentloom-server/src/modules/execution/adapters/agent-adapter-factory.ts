import type { DrizzleDB } from '../../../database/database.module';
import type { SandboxConfig } from '../../../database/schema';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import type { IAgentAdapterFactory as RuntimeAdapterFactory } from '../../agent/agent-adapter.factory';
import { AgentDefinitionService } from '../../agent-definition/agent-definition.service';
import { SubAgentToolsProvider } from '../../agent-execution/subagent';
import { SandboxService } from '../../sandbox/sandbox.service';
import { SkillResolverService } from '../../skill/skill-resolver.service';
import { WorkflowAgentAdapter } from '../workflow-agent-adapter';
import { EventBridgeService } from '../services/event-bridge.service';

export class AgentAdapterFactory {
  constructor(
    private readonly db: DrizzleDB,
    private readonly agentRuntime: IAgentRuntime,
    private readonly runtimeAdapterFactory: RuntimeAdapterFactory,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly sandboxService: SandboxService,
    private readonly eventBridge: EventBridgeService,
    private readonly subAgentToolsProvider?: SubAgentToolsProvider,
    private readonly skillResolverService?: SkillResolverService,
  ) {}

  createFromAgentDefinition(
    agentDefinitionId: string,
    sandboxConfig?: SandboxConfig,
  ): WorkflowAgentAdapter {
    return new WorkflowAgentAdapter(
      {
        db: this.db,
        agentRuntime: this.agentRuntime,
        runtimeAdapterFactory: this.runtimeAdapterFactory,
        agentDefinitionService: this.agentDefinitionService,
        sandboxService: this.sandboxService,
        eventBridge: this.eventBridge,
        subAgentToolsProvider: this.subAgentToolsProvider,
        skillResolverService: this.skillResolverService,
      },
      {
        agentDefinitionId,
        ...(sandboxConfig ? { sandboxConfig } : {}),
      },
    );
  }
}
