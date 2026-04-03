import { z } from 'zod';

/** 子代理句柄 — 前缀 'sa_' + 12位随机字符 */
export type SubAgentHandle = `sa_${string}`;

export function generateSubAgentHandle(): SubAgentHandle {
  return `sa_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** 子代理运行状态 */
export enum SubAgentRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

/** 子代理执行结果 */
export interface SubAgentResult {
  /** 子代理最终输出文本 */
  content: string;
  /** 停止原因 */
  stopReason: string;
  /** 子代理做出的决策 (如有) */
  decision?: Record<string, unknown>;
  /** 子代理自身的子代理结果 (递归) */
  subAgents?: Record<SubAgentHandle, SubAgentResult>;
}

/** 子代理运行记录 (内存态，不持久化到独立表) */
export interface SubAgentRunRecord {
  handle: SubAgentHandle;
  alias: string;
  agentDefinitionId: string;
  status: SubAgentRunStatus;
  /** 父代理发起此子代理的 tool_call_id */
  parentToolCallId: string;
  /** 嵌套深度 (从 0 开始，0 = 主 agent) */
  depth: number;
  /** 执行结果 (completed 后填充) */
  result?: SubAgentResult;
  /** 错误信息 (failed/timeout 后填充) */
  error?: string;
  /** AbortController 用于取消 */
  abortController: AbortController;
  /** 完成 Promise 的 resolver */
  resolve: (result: SubAgentResult) => void;
  reject: (error: Error) => void;
  /** 完成 Promise */
  completionPromise: Promise<SubAgentResult>;
  /** 创建时间 */
  startedAt: number;
  /** 完成时间 */
  completedAt?: number;
}

/** 子代理事件装饰 — 附加到每个通过父对话 room 广播的事件上 */
export interface SubAgentEventEnvelope {
  handle: SubAgentHandle;
  alias: string;
  depth: number;
  parentToolCallId: string;
}

/** 父代理执行上下文 — 传递给 SubAgentToolsProvider */
export interface SubAgentParentContext {
  /** 父对话 ID */
  conversationId: string;
  /** 当前嵌套深度 (主 agent 为 0) */
  depth: number;
  /** 租户 ID */
  tenantId: string;
  /** 父级当前是否运行在 sandbox runtime 中 */
  parentUsesSandboxRuntime: boolean;
  /** 父级 AbortSignal（用于级联取消） */
  parentAbortSignal?: AbortSignal;
  /** 已访问的 Agent IDs (用于循环检测) */
  visitedAgentIds: Set<string>;
}

/** 子代理完成通知 (注入到父对话的轻量消息) */
export interface SubAgentCompletionNotice {
  type: 'subagent_completion_notice';
  handle: SubAgentHandle;
  alias: string;
  status: SubAgentRunStatus;
  /** 仅在失败时包含 */
  error?: string;
}

// ===== Zod Schemas (for tool inputSchema) =====

/** 创建动态 alias 枚举，防止 LLM 幻觉 (Metis 要求) */
export function createAliasEnum(aliases: string[]) {
  if (aliases.length === 0) {
    throw new Error('至少需要一个子代理别名');
  }
  return z.enum(aliases as [string, ...string[]]);
}

// 注意: 以下 schema 的 alias 字段在运行时会被替换为 z.enum()
// 这里用 z.string() 作为静态类型定义
export const CallSubAgentInputSchema = z.object({
  alias: z.string().describe('要调用的子代理别名'),
  task: z.string().describe('交给子代理的任务描述'),
  context: z.string().optional().describe('可选的额外上下文信息'),
});

export const SpawnSubAgentInputSchema = z.object({
  alias: z.string().describe('要启动的子代理别名'),
  task: z.string().describe('交给子代理的任务描述'),
  context: z.string().optional().describe('可选的额外上下文信息'),
});

export const WaitForSubAgentsInputSchema = z.object({
  handles: z.array(z.string()).min(1).describe('要等待的子代理句柄列表'),
  timeoutMs: z
    .number()
    .positive()
    .optional()
    .describe('等待超时时间 (ms)，默认使用画布配置的 maxTimeoutMs'),
});

export const GetSubAgentStatusInputSchema = z.object({
  handle: z.string().describe('子代理句柄'),
});
