/**
 * Agent token 用量的求和与遥测换算。
 *
 * 计数互不重叠（与 pi-ai `Usage`、dsh `TokenUsage` 一致）：`inputTokens` 是未缓存输入，
 * `cacheReadTokens`/`cacheWriteTokens` 单独计数，`totalTokens` 是上游给出的四者之和。
 */
import type { AgentUsage } from '../types/agent-event.types';

/** 单次调用的完整 prompt tokens：未缓存输入 + 缓存读 + 缓存写 */
export function promptTokensOf(usage: AgentUsage): number {
  return (
    usage.inputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0)
  );
}

/** 多次调用的用量逐字段求和；缓存字段全部缺失时保持缺失，无调用时为 undefined */
export function sumAgentUsage(
  calls: readonly AgentUsage[],
): AgentUsage | undefined {
  if (calls.length === 0) {
    return undefined;
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  for (const usage of calls) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    totalTokens += usage.totalTokens;
    if (usage.cacheReadTokens !== undefined) {
      cacheReadTokens = (cacheReadTokens ?? 0) + usage.cacheReadTokens;
    }
    if (usage.cacheWriteTokens !== undefined) {
      cacheWriteTokens = (cacheWriteTokens ?? 0) + usage.cacheWriteTokens;
    }
  }
  return {
    inputTokens,
    outputTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    totalTokens,
  };
}

/**
 * 步骤结果的遥测字段（执行记录读取）：`promptTokens` 含缓存输入，
 * `completionTokens` 为输出，`totalTokens` 为上游 totalTokens 之和。
 */
export function toUsageTelemetryFields(usage: AgentUsage): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  return {
    promptTokens: promptTokensOf(usage),
    completionTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}
