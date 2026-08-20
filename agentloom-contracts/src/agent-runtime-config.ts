import { z } from 'zod';

/**
 * Agent 运行时配置。
 *
 * 逐字段 zod 化 server canonical 定义
 * (`agentloom-server/src/modules/agent-definition/agent-runtime-config.interface.ts`
 * 与 `agentloom-server/src/database/schema/sandbox-sessions.schema.ts` 的 `SandboxConfig`)。
 *
 * canonical 字段名决策：
 * - 知识库检索阈值为 `similarityThreshold`（不是 `scoreThreshold`）
 * - 路由回退为 `fallbackModelId` + `candidateModelIds`（不是 `fallbackChain`）
 * - `modelConfig.modelId` 必需
 * - 子代理 `alias` 必需、`agentVersionId` 可选
 */

const JsonRecordSchema = z.record(z.string(), z.unknown());

export const AGENT_RUNTIME_MODES = ['sandbox', 'no_sandbox'] as const;

export const AgentRuntimeModeSchema = z.enum(AGENT_RUNTIME_MODES);

export const AgentModelConfigSchema = z.object({
  modelId: z.string(),
  provider: z.string().optional(),
  apiProtocol: z.string().nullable().optional(),
  modelName: z.string().optional(),
  apiKeyId: z.string().nullable().optional(),
  endpointUrl: z.string().nullable().optional(),
  authMethod: z.string().nullable().optional(),
  authConfig: JsonRecordSchema.nullable().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  topP: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  customParameters: JsonRecordSchema.optional(),
});

const HttpToolMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const CodeToolLanguageSchema = z.enum([
  'typescript',
  'javascript',
  'python',
  'bash',
]);

const AgentToolBindingBaseShape = {
  toolId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  parameterOverrides: JsonRecordSchema.optional(),
  enabled: z.boolean(),
};

export const AgentToolBindingBaseSchema = z.object(AgentToolBindingBaseShape);

export const AgentMcpToolBindingSchema = z.object({
  ...AgentToolBindingBaseShape,
  toolType: z.literal('mcp'),
  mcpToolDefinitionId: z.string().optional(),
  mcpServerConfigId: z.string().optional(),
  toolName: z.string().optional(),
  inputSchema: JsonRecordSchema.optional(),
  portMapping: JsonRecordSchema.optional(),
});

export const AgentHttpToolBindingSchema = z.object({
  ...AgentToolBindingBaseShape,
  toolType: z.literal('http'),
  url: z.string(),
  method: HttpToolMethodSchema.optional(),
});

export const AgentCodeToolBindingSchema = z.object({
  ...AgentToolBindingBaseShape,
  toolType: z.literal('code'),
  language: CodeToolLanguageSchema,
  code: z.string().optional(),
  /** 执行超时时间（秒） */
  timeout: z.number().optional(),
});

/** 未标注 `toolType` 的历史绑定形状；仍在存量画布数据中出现。 */
export const LegacyAgentToolBindingSchema = z.object({
  ...AgentToolBindingBaseShape,
  toolType: z.undefined().optional(),
  mcpToolDefinitionId: z.string().optional(),
  mcpServerConfigId: z.string().optional(),
  toolName: z.string().optional(),
  inputSchema: JsonRecordSchema.optional(),
  portMapping: JsonRecordSchema.optional(),
  url: z.string().optional(),
  method: HttpToolMethodSchema.optional(),
  language: CodeToolLanguageSchema.optional(),
  code: z.string().optional(),
});

export const AgentToolBindingSchema = z.union([
  AgentMcpToolBindingSchema,
  AgentHttpToolBindingSchema,
  AgentCodeToolBindingSchema,
  LegacyAgentToolBindingSchema,
]);

export const AgentKnowledgeBindingSchema = z.object({
  knowledgeBaseId: z.string(),
  topK: z.number().optional(),
  similarityThreshold: z.number().optional(),
  enabled: z.boolean(),
});

export const AgentRoutingConfigSchema = z.object({
  strategy: z.string(),
  candidateModelIds: z.array(z.string()).optional(),
  fallbackModelId: z.string().optional(),
});

export const AgentInputPreprocessorSchema = z.object({
  type: z.string(),
  config: JsonRecordSchema.optional(),
});

export const SandboxBindingRefSchema = z.object({
  executionId: z.string().optional(),
  agentConversationId: z.string().optional(),
  sandboxNodeId: z.string().optional(),
});

export const SandboxConfigSchema = z.object({
  /** CPU 核数 (0.5-4) */
  cpu: z.number(),
  /** 内存 MB (256-4096) */
  memory: z.number(),
  /** 磁盘 GB (1-10) */
  disk: z.number(),
  /** 持久化路径（可选，指向 MinIO） */
  persistencePath: z.string().optional(),
  /** 基础超时时间（小时，1-24），主要用于持久沙箱和 legacy runtime */
  timeout: z.number(),
  /** Agent runtime 会话级秒数超时；存在时优先于 timeout 小时字段 */
  timeoutSeconds: z.number().optional(),
  /** direct Agent 对话在无运行中任务且保持 idle 后，自动结束对话的分钟数 */
  conversationIdleAutoEndMinutes: z.number().optional(),
  /** 工作区快照 ID（可选，创建时恢复到容器） */
  restoreWorkspaceId: z.string().optional(),
  /** 生命周期模式：session=对话结束时销毁，persistent=保持存活直到过期或手动销毁 */
  lifecycleMode: z.enum(['session', 'persistent']).optional(),
  /** persistent 模式下的过期时间（小时） */
  persistenceExpiryHours: z.number().optional(),
  /** 持久沙箱名称（仅 persistent 模式使用） */
  name: z.string().optional(),
  /** 持久沙箱 session ID（persistent 模式下选择已有沙箱） */
  persistentSandboxId: z.string().optional(),
  /** 服务端维护的活动绑定 */
  activeBindings: z.array(SandboxBindingRefSchema).optional(),
});

export const AgentNativeToolPolicySchema = z.object({
  readEnabled: z.boolean(),
  writeEnabled: z.boolean(),
  editEnabled: z.boolean(),
  terminalEnabled: z.boolean(),
});

export const AgentSelfEvolutionPolicySchema = z.object({
  enabled: z.boolean(),
  resourceManagement: z.boolean(),
  externalEditing: z.boolean(),
  sandboxManagement: z.boolean(),
});

export interface AgentSubAgentOverrides {
  systemPrompt?: string;
  modelConfig?: z.infer<typeof AgentModelConfigSchema>;
  routingConfig?: z.infer<typeof AgentRoutingConfigSchema>;
  outputSchema?: Record<string, unknown>;
}

export interface AgentSubAgentExtensions {
  tools?: z.infer<typeof AgentToolBindingSchema>[];
  knowledgeBindings?: z.infer<typeof AgentKnowledgeBindingSchema>[];
  subAgents?: AgentSubAgentRef[];
  memoryInstanceIds?: string[];
  skillIds?: string[];
}

export interface AgentSubAgentRef {
  agentDefinitionId: string;
  agentVersionId?: string;
  /** 必填唯一别名，用于工具名称中的标识 */
  alias: string;
  /** 画布端配置的最大超时时间 (ms)，默认 300_000 */
  maxTimeoutMs?: number;
  /** 子代理描述，用于工具 description 生成 */
  description?: string;
  /** 当前挂载点对被引用子代理的局部覆盖 */
  overrides?: AgentSubAgentOverrides;
  /** 当前挂载点对被引用子代理的局部扩展 */
  extensions?: AgentSubAgentExtensions;
}

export const AgentSubAgentOverridesSchema: z.ZodType<AgentSubAgentOverrides> =
  z.object({
    systemPrompt: z.string().optional(),
    modelConfig: AgentModelConfigSchema.optional(),
    routingConfig: AgentRoutingConfigSchema.optional(),
    outputSchema: JsonRecordSchema.optional(),
  });

/** 子代理引用可递归嵌套，需要显式类型标注打断类型推导环。 */
export const AgentSubAgentRefSchema: z.ZodType<AgentSubAgentRef> = z.lazy(() =>
  z.object({
    agentDefinitionId: z.string(),
    agentVersionId: z.string().optional(),
    alias: z.string(),
    maxTimeoutMs: z.number().optional(),
    description: z.string().optional(),
    overrides: AgentSubAgentOverridesSchema.optional(),
    extensions: AgentSubAgentExtensionsSchema.optional(),
  }),
);

export const AgentSubAgentExtensionsSchema: z.ZodType<AgentSubAgentExtensions> =
  z.lazy(() =>
    z.object({
      tools: z.array(AgentToolBindingSchema).optional(),
      knowledgeBindings: z.array(AgentKnowledgeBindingSchema).optional(),
      subAgents: z.array(AgentSubAgentRefSchema).optional(),
      memoryInstanceIds: z.array(z.string()).optional(),
      skillIds: z.array(z.string()).optional(),
    }),
  );

export const AgentRuntimeConfigSchema = z.object({
  runtimeMode: AgentRuntimeModeSchema.optional(),
  modelConfig: AgentModelConfigSchema.optional(),
  tools: z.array(AgentToolBindingSchema).optional(),
  knowledgeBindings: z.array(AgentKnowledgeBindingSchema).optional(),
  subAgents: z.array(AgentSubAgentRefSchema).optional(),
  inputPreprocessors: z.array(AgentInputPreprocessorSchema).optional(),
  sandboxConfig: SandboxConfigSchema.optional(),
  routingConfig: AgentRoutingConfigSchema.optional(),
  memoryInstanceIds: z.array(z.string()).optional(),
  skillIds: z.array(z.string()).optional(),
  outputSchema: JsonRecordSchema.optional(),
  nativeToolPolicy: AgentNativeToolPolicySchema.optional(),
  selfEvolutionPolicy: AgentSelfEvolutionPolicySchema.optional(),
});

export type AgentRuntimeMode = z.infer<typeof AgentRuntimeModeSchema>;
export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>;
export type AgentToolBindingBase = z.infer<typeof AgentToolBindingBaseSchema>;
export type AgentMcpToolBinding = z.infer<typeof AgentMcpToolBindingSchema>;
export type AgentHttpToolBinding = z.infer<typeof AgentHttpToolBindingSchema>;
export type AgentCodeToolBinding = z.infer<typeof AgentCodeToolBindingSchema>;
export type LegacyAgentToolBinding = z.infer<
  typeof LegacyAgentToolBindingSchema
>;
export type AgentToolBinding = z.infer<typeof AgentToolBindingSchema>;
export type AgentKnowledgeBinding = z.infer<
  typeof AgentKnowledgeBindingSchema
>;
export type AgentRoutingConfig = z.infer<typeof AgentRoutingConfigSchema>;
export type AgentInputPreprocessor = z.infer<
  typeof AgentInputPreprocessorSchema
>;
export type SandboxBindingRef = z.infer<typeof SandboxBindingRefSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type AgentNativeToolPolicy = z.infer<
  typeof AgentNativeToolPolicySchema
>;
export type AgentSelfEvolutionPolicy = z.infer<
  typeof AgentSelfEvolutionPolicySchema
>;
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>;
