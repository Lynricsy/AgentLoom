import type { SandboxConfig } from '../../database/schema/sandbox-sessions.schema';

export interface AgentModelConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  customParameters?: Record<string, unknown>;
}

export interface AgentToolBinding {
  toolId: string;
  name: string;
  description?: string;
  parameterOverrides?: Record<string, unknown>;
  enabled: boolean;
}

export interface AgentKnowledgeBinding {
  knowledgeBaseId: string;
  topK?: number;
  similarityThreshold?: number;
  enabled: boolean;
}

export interface AgentSubAgentRef {
  agentDefinitionId: string;
  agentVersionId?: string;
  alias?: string;
}

export interface AgentInputPreprocessor {
  type: string;
  config?: Record<string, unknown>;
}

export interface AgentRoutingConfig {
  strategy: string;
  candidateModelIds?: string[];
  fallbackModelId?: string;
}

export interface AgentRuntimeConfig {
  modelConfig?: AgentModelConfig;
  tools?: AgentToolBinding[];
  knowledgeBindings?: AgentKnowledgeBinding[];
  subAgents?: AgentSubAgentRef[];
  inputPreprocessors?: AgentInputPreprocessor[];
  sandboxConfig?: SandboxConfig;
  routingConfig?: AgentRoutingConfig;
}
