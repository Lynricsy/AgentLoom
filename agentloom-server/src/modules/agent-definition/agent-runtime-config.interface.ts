/**
 * Agent 运行时配置类型的唯一来源是 `@agentloom/contracts`。
 *
 * 本文件只做原样 re-export，让既有 import 路径保持不变。
 * 新增或修改字段必须先改 `agentloom-contracts`，不要在这里重新声明。
 */
export type {
  AgentRuntimeMode,
  AgentModelConfig,
  AgentToolBindingBase,
  AgentMcpToolBinding,
  AgentHttpToolBinding,
  AgentCodeToolBinding,
  LegacyAgentToolBinding,
  AgentToolBinding,
  AgentKnowledgeBinding,
  AgentSubAgentOverrides,
  AgentSubAgentExtensions,
  AgentSubAgentRef,
  AgentInputPreprocessor,
  AgentRoutingConfig,
  AgentNativeToolPolicy,
  AgentSelfEvolutionPolicy,
  AgentRuntimeConfig,
} from '@agentloom/contracts';

export {
  AGENT_RUNTIME_MODES,
  AgentRuntimeConfigSchema,
  AgentModelConfigSchema,
  AgentToolBindingSchema,
  AgentKnowledgeBindingSchema,
  AgentRoutingConfigSchema,
  AgentSubAgentRefSchema,
  AgentNativeToolPolicySchema,
  AgentSelfEvolutionPolicySchema,
} from '@agentloom/contracts';
