/**
 * Agent 工作流任务失败判定策略：只决定 BullMQ 重试、模型回退、运行时恢复重排队或终态失败，
 * 不执行数据库更新、事件广播或队列写入。
 */
import type { SmartRoutingRuntimeContext } from './execution.constants';

export type AgentTaskFailureDecision =
  | { kind: 'retry'; maxAttempts: number }
  | { kind: 'fallback'; nextSmartRouting: SmartRoutingRuntimeContext }
  | { kind: 'requeue_recoverable' }
  | { kind: 'fail'; fallbackExhausted: boolean };

export type AgentTaskFailurePolicyInput = {
  attemptsMade: number;
  configuredAttempts?: number;
  accumulatedAttemptCount: number;
  authenticationFailed: boolean;
  recoverableRuntimeFailure: boolean;
  maxRecoverableRuntimeFailureAttempts: number;
  smartRouting?: SmartRoutingRuntimeContext;
};

export function decideAgentTaskFailure(
  input: AgentTaskFailurePolicyInput,
): AgentTaskFailureDecision {
  const maxAttempts = getAgentTaskMaxAttempts(input.configuredAttempts);
  if (input.attemptsMade + 1 < maxAttempts) {
    return { kind: 'retry', maxAttempts };
  }

  if (!input.authenticationFailed) {
    const nextSmartRouting = getNextAgentTaskSmartRouting(input.smartRouting);
    if (nextSmartRouting) {
      return { kind: 'fallback', nextSmartRouting };
    }
  }

  if (
    input.recoverableRuntimeFailure &&
    input.accumulatedAttemptCount < input.maxRecoverableRuntimeFailureAttempts
  ) {
    return { kind: 'requeue_recoverable' };
  }

  return {
    kind: 'fail',
    fallbackExhausted:
      !input.authenticationFailed &&
      isAgentTaskFallbackChainStrategy(input.smartRouting?.strategy),
  };
}

export function getAgentTaskMaxAttempts(configuredAttempts?: number): number {
  return typeof configuredAttempts === 'number' && configuredAttempts > 0
    ? configuredAttempts
    : 1;
}

export function getNextAgentTaskSmartRouting(
  smartRouting?: SmartRoutingRuntimeContext,
): SmartRoutingRuntimeContext | undefined {
  if (
    !smartRouting ||
    !isAgentTaskFallbackChainStrategy(smartRouting.strategy)
  ) {
    return undefined;
  }

  const nextIndex = smartRouting.currentModelIndex + 1;
  const nextModelId = smartRouting.candidateModelIds[nextIndex];
  if (!nextModelId) {
    return undefined;
  }

  return {
    ...smartRouting,
    currentModelIndex: nextIndex,
    selectedModelId: nextModelId,
  };
}

export function isAgentTaskFallbackChainStrategy(
  strategy?: string,
): boolean {
  return strategy === 'FALLBACK_CHAIN' || strategy === 'fallback_chain';
}
