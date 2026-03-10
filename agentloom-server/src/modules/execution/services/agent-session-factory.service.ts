import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AgentSession,
  McpServerConfig,
  SessionContext,
} from '../../agent/types/agent-session.types';

interface CreateWorkflowSessionParams {
  agentId: string;
  executionId: string;
  stepId: string;
  nodeId: string;
  tenantId: string;
  llmModelConfigId?: string;
  systemPrompt?: string;
  autonomyMode?: string;
  mcpServers?: Readonly<Record<string, McpServerConfig>>;
}

@Injectable()
export class AgentSessionFactory {
  private readonly logger = new Logger(AgentSessionFactory.name);

  createWorkflowSession(params: CreateWorkflowSessionParams): AgentSession {
    const sessionId = randomUUID();
    const now = new Date();

    const context: SessionContext = {
      history: [],
      mcpServers: params.mcpServers,
      workflowState: {
        executionId: params.executionId,
        stepId: params.stepId,
        nodeId: params.nodeId,
      },
    };

    const session: AgentSession = {
      id: sessionId,
      agentId: params.agentId,
      mode: 'workflow',
      context,
      status: 'active',
      tenantId: params.tenantId,
      llmModelConfigId: params.llmModelConfigId,
      systemPrompt: params.systemPrompt,
      autonomyMode: params.autonomyMode,
      createdAt: now,
      updatedAt: now,
    };

    this.logger.debug(
      `Workflow session ${sessionId} created for agent ${params.agentId} (step: ${params.stepId})`,
    );
    return session;
  }
}
