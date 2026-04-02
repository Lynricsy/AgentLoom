import { Injectable } from '@nestjs/common';

import type { SessionToolProvider } from '../agent/ports/agent-runtime.port';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { SelfEvolutionService } from './self-evolution.service';
import type { SelfEvolutionSessionContext } from './self-evolution.types';

@Injectable()
export class SelfEvolutionToolsProvider {
  constructor(private readonly selfEvolutionService: SelfEvolutionService) {}

  createSessionToolProvider(params: {
    sessionId: string;
    conversationId: string;
    tenantId: string;
    actorUserId: string;
    currentAgentDefinitionId: string;
    currentAgentName: string;
    runtimeConfig?: AgentRuntimeConfig;
  }): SessionToolProvider {
    const context: SelfEvolutionSessionContext = {
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      currentAgentDefinitionId: params.currentAgentDefinitionId,
      currentAgentName: params.currentAgentName,
      selfEvolutionPolicy: params.runtimeConfig?.selfEvolutionPolicy ?? {
        enabled: false,
        resourceManagement: false,
        externalEditing: false,
        sandboxManagement: false,
      },
      runtimeConfig: params.runtimeConfig,
    };

    return this.selfEvolutionService.createSessionToolProvider(context);
  }
}
