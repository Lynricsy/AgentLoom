/**
 * Agent task 失败策略判定表：覆盖 BullMQ 重试、模型回退、恢复重排队与终态失败优先级。
 */
import { describe, expect, it } from 'vitest';
import { decideAgentTaskFailure } from '../agent-task-failure-policy';
import type { SmartRoutingRuntimeContext } from '../execution.constants';

const fallbackRouting: SmartRoutingRuntimeContext = {
  routingStepId: 'routing-step',
  routingNodeId: 'routing-node',
  strategy: 'FALLBACK_CHAIN',
  candidateModelIds: ['model-1', 'model-2'],
  currentModelIndex: 0,
  selectedModelId: 'model-1',
};

const baseInput = {
  attemptsMade: 0,
  configuredAttempts: 1,
  accumulatedAttemptCount: 1,
  authenticationFailed: false,
  recoverableRuntimeFailure: false,
  maxRecoverableRuntimeFailureAttempts: 5,
};

describe('decideAgentTaskFailure', () => {
  it.each([
    {
      name: 'BullMQ 尚有次数时优先 retry',
      input: { configuredAttempts: 3, smartRouting: fallbackRouting },
      expected: { kind: 'retry', maxAttempts: 3 },
    },
    {
      name: 'BullMQ 耗尽后切换 fallback 候选',
      input: { smartRouting: fallbackRouting },
      expected: {
        kind: 'fallback',
        nextSmartRouting: expect.objectContaining({
          currentModelIndex: 1,
          selectedModelId: 'model-2',
        }),
      },
    },
    {
      name: '认证失败禁止 fallback 并直接失败',
      input: { authenticationFailed: true, smartRouting: fallbackRouting },
      expected: { kind: 'fail', fallbackExhausted: false },
    },
    {
      name: '运行时链路中断在上限前重新排队',
      input: {
        recoverableRuntimeFailure: true,
        accumulatedAttemptCount: 4,
      },
      expected: { kind: 'requeue_recoverable' },
    },
    {
      name: '运行时恢复次数耗尽后终态失败',
      input: {
        recoverableRuntimeFailure: true,
        accumulatedAttemptCount: 5,
      },
      expected: { kind: 'fail', fallbackExhausted: false },
    },
    {
      name: 'fallback 候选耗尽时标识专用终态错误',
      input: {
        smartRouting: { ...fallbackRouting, currentModelIndex: 1 },
      },
      expected: { kind: 'fail', fallbackExhausted: true },
    },
  ])('$name', ({ input, expected }) => {
    expect(
      decideAgentTaskFailure({
        ...baseInput,
        ...input,
      }),
    ).toEqual(expected);
  });

  it('非 fallback 策略保留原始终态错误', () => {
    expect(
      decideAgentTaskFailure({
        ...baseInput,
        smartRouting: {
          ...fallbackRouting,
          strategy: 'QUALITY_FIRST',
          candidateModelIds: ['model-1'],
        },
      }),
    ).toEqual({ kind: 'fail', fallbackExhausted: false });
  });
});
