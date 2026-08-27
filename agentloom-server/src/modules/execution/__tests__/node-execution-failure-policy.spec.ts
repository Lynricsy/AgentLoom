/**
 * 节点失败策略规格：验证唯一重抛例外与其余错误的失败推进语义。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionStep } from '../../../database/schema';
import { InvalidStepTransitionException } from '../execution.exceptions';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import type { StepStateMachineService } from '../step-state-machine.service';

function makeStep(): ExecutionStep {
  return {
    id: 'step-1',
    executionId: 'execution-1',
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'running',
    nodeType: 'code-tool',
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as ExecutionStep;
}

describe('NodeExecutionFailurePolicy', () => {
  it('只重抛 InvalidStepTransitionException，不二次写 failed', async () => {
    const updateStepStatus = vi.fn();
    const policy = new NodeExecutionFailurePolicy({ updateStepStatus } as unknown as StepStateMachineService);
    const onNodeFailed = vi.fn();
    const error = new InvalidStepTransitionException('running', 'completed');

    await expect(policy.handle(error, {
      tenantId: 'tenant-1',
      executionId: 'execution-1',
      step: makeStep(),
      onNodeFailed,
    })).rejects.toBe(error);

    expect(updateStepStatus).not.toHaveBeenCalled();
    expect(onNodeFailed).not.toHaveBeenCalled();
  });

  it('普通错误结构化落库后吞掉并推进 workflow failure', async () => {
    const updateStepStatus = vi.fn().mockResolvedValue(undefined);
    const policy = new NodeExecutionFailurePolicy({ updateStepStatus } as unknown as StepStateMachineService);
    const onNodeFailed = vi.fn().mockResolvedValue(undefined);
    const step = makeStep();

    await expect(policy.handle(new Error('runner failed'), {
      tenantId: 'tenant-1',
      executionId: 'execution-1',
      step,
      onNodeFailed,
    })).resolves.toBeUndefined();

    expect(updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      step.id,
      'failed',
      {
        errorMessage: expect.objectContaining({
          message: 'runner failed',
          nodeId: step.nodeId,
          stack: expect.any(String),
        }),
      },
    );
    expect(onNodeFailed).toHaveBeenCalledWith(
      'execution-1',
      step.id,
      'tenant-1',
    );
  });

  it('透传诊断 result 到 failed 落库', async () => {
    const updateStepStatus = vi.fn().mockResolvedValue(undefined);
    const policy = new NodeExecutionFailurePolicy({ updateStepStatus } as unknown as StepStateMachineService);
    const onNodeFailed = vi.fn().mockResolvedValue(undefined);
    const step = makeStep();

    await policy.handle(new Error('boom'), {
      tenantId: 'tenant-1',
      executionId: 'execution-1',
      step,
      onNodeFailed,
      result: { stdout: 'partial', 'exec-out': { success: false } },
    });

    expect(updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      step.id,
      'failed',
      expect.objectContaining({
        result: { stdout: 'partial', 'exec-out': { success: false } },
      }),
    );
  });
});
