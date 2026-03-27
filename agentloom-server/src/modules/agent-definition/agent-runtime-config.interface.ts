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

export interface AgentToolBindingBase {
  toolId: string;
  name: string;
  description?: string;
  parameterOverrides?: Record<string, unknown>;
  enabled: boolean;
}

export interface AgentMcpToolBinding extends AgentToolBindingBase {
  toolType: 'mcp';
  mcpToolDefinitionId?: string;
  mcpServerConfigId?: string;
  toolName?: string;
  inputSchema?: Record<string, unknown>;
  portMapping?: Record<string, unknown>;
}

export interface AgentHttpToolBinding extends AgentToolBindingBase {
  toolType: 'http';
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

export interface AgentCodeToolBinding extends AgentToolBindingBase {
  toolType: 'code';
  language: 'typescript' | 'javascript' | 'python' | 'bash';
  code?: string;
  /** 执行超时时间（秒） */
  timeout?: number;
}

export type LegacyAgentToolBinding = AgentToolBindingBase & {
  toolType?: undefined;
  mcpToolDefinitionId?: string;
  mcpServerConfigId?: string;
  toolName?: string;
  inputSchema?: Record<string, unknown>;
  portMapping?: Record<string, unknown>;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  language?: 'typescript' | 'javascript' | 'python' | 'bash';
  code?: string;
};

export type AgentToolBinding =
  | AgentMcpToolBinding
  | AgentHttpToolBinding
  | AgentCodeToolBinding
  | LegacyAgentToolBinding;

export interface AgentKnowledgeBinding {
  knowledgeBaseId: string;
  topK?: number;
  similarityThreshold?: number;
  enabled: boolean;
}

export interface AgentSubAgentRef {
  agentDefinitionId: string;
  agentVersionId?: string;
  /** 必填唯一别名，用于工具名称中的标识 */
  alias: string;
  /** 画布端配置的最大超时时间 (ms)，默认 300_000 (5分钟) */
  maxTimeoutMs?: number;
  /** 子代理描述，用于工具 description 生成 */
  description?: string;
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
  memoryInstanceIds?: string[];
  skillIds?: string[];
}
