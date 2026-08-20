/**
 * Compound 执行服务规格：验证公开上下文构建边界与迭代输入语义。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionStep, ReactFlowNode } from '../../../database/schema';
import { CompoundExecutionService } from '../compound-execution.service';
import type { DagResolverService } from '../dag-resolver.service';
import type { EventBridgeService } from '../services/event-bridge.service';
import type { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import type { StepStateMachineService } from '../step-state-machine.service';
import type { DrizzleDB } from '../../../database/database.module';

function makeStep(nodeType: string, nodeData: Record<string, unknown>): ExecutionStep {
  return {
    id: 'step-parent', executionId: 'execution-1', nodeId: 'iteration-1',
    stepOrder: 0, status: 'pending', nodeType, nodeData, input: null,
    result: null, checkpointData: null, errorMessage: null, startedAt: null,
    completedAt: null, createdAt: new Date(0), updatedAt: new Date(0),
  } as ExecutionStep;
}

describe('CompoundExecutionService', () => {
  it('公开 createCompoundContext 保留迭代顺序、snake_case 配置与内部节点顺序', () => {
    const dagResolver = {
      resolveDag: vi.fn().mockReturnValue({
        layers: [['start'], ['result']],
        adjacencyMap: new Map(),
        inDegreeMap: new Map(),
      }),
    };
    const service = new CompoundExecutionService(
      {} as DrizzleDB,
      dagResolver as unknown as DagResolverService,
      {} as StepStateMachineService,
      {} as EventBridgeService,
      {} as NodeExecutionFailurePolicy,
    );
    const nodes = [
      { id: 'iteration-1', type: 'iteration', position: { x: 0, y: 0 }, data: {} },
      { id: 'start', type: 'iteration-start', position: { x: 0, y: 0 }, data: {}, parent_id: 'iteration-1' },
      { id: 'result', type: 'result', position: { x: 0, y: 0 }, data: {}, parent_id: 'iteration-1' },
    ] as ReactFlowNode[];

    const context = service.createCompoundContext(
      makeStep('iteration', { config: { output_mode: 'collect-array' } }),
      { 'items-in': ['spec', 'qa', 'release'] },
      'tenant-1',
      'execution-1',
      { nodes, edges: [] },
      'iteration',
    );

    expect(context.iterationItems).toEqual(['spec', 'qa', 'release']);
    expect(context.outputMode).toBe('collect-array');
    expect(context.internalNodes.map((node) => node.id)).toEqual(['start', 'result']);
    expect(context.orderedNodeIds).toEqual(['start', 'result']);
  });

  it('break 命中且 result 已就绪时优先公开调度 result 节点', async () => {
    const updateStepStatus = vi.fn().mockResolvedValue(undefined);
    const service = new CompoundExecutionService(
      {} as DrizzleDB,
      {
        resolveDag: vi.fn().mockReturnValue({
          layers: [['result', 'agent']],
          adjacencyMap: new Map(),
          inDegreeMap: new Map(),
        }),
      } as unknown as DagResolverService,
      { updateStepStatus } as unknown as StepStateMachineService,
      {} as EventBridgeService,
      {} as NodeExecutionFailurePolicy,
    );
    const resultStep = {
      ...makeStep('result', {}),
      id: 'step-result',
      nodeId: 'result',
    };
    const agentStep = {
      ...makeStep('agent', {}),
      id: 'step-agent',
      nodeId: 'agent',
    };
    const context = service.createCompoundContext(
      { ...makeStep('loop', {}), nodeId: 'loop-1' },
      {},
      'tenant-1',
      'execution-1',
      {
        nodes: [
          {
            id: 'result',
            type: 'result',
            position: { x: 0, y: 0 },
            data: {},
            parentId: 'loop-1',
          },
          {
            id: 'agent',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {},
            parentId: 'loop-1',
          },
        ] as ReactFlowNode[],
        edges: [],
      },
      'loop',
    );
    context.breakRequested = true;
    const runtime = {
      loadExecutionContext: vi.fn().mockResolvedValue({
        execution: {},
        snapshot: { nodes: [], edges: [] },
        steps: [agentStep, resultStep],
      }),
      getSchedulingDecision: vi.fn().mockReturnValue('schedule'),
      scheduleNode: vi.fn().mockResolvedValue(undefined),
      onNodeCompleted: vi.fn(),
      onNodeFailed: vi.fn(),
    };

    await service.scheduleNextCompoundNode(context, 'tenant-1', runtime);

    expect(runtime.scheduleNode).toHaveBeenCalledWith(
      'execution-1',
      'result',
      'tenant-1',
      { nodes: context.internalNodes, edges: context.internalEdges },
      [agentStep, resultStep],
      { skipLatestState: true },
    );
    expect(updateStepStatus).not.toHaveBeenCalledWith(
      'tenant-1',
      'step-agent',
      'skipped',
    );
  });

  it('break 命中但 result 未就绪时跳过剩余节点并公开完成父节点', async () => {
    const updateStepStatus = vi.fn().mockResolvedValue(undefined);
    const service = new CompoundExecutionService(
      {} as DrizzleDB,
      {
        resolveDag: vi.fn().mockReturnValue({
          layers: [['agent'], ['result']],
          adjacencyMap: new Map(),
          inDegreeMap: new Map(),
        }),
      } as unknown as DagResolverService,
      { updateStepStatus } as unknown as StepStateMachineService,
      {} as EventBridgeService,
      {} as NodeExecutionFailurePolicy,
    );
    const agentStep = {
      ...makeStep('agent', {}),
      id: 'step-agent',
      nodeId: 'agent',
    };
    const resultStep = {
      ...makeStep('result', {}),
      id: 'step-result',
      nodeId: 'result',
    };
    const context = service.createCompoundContext(
      { ...makeStep('loop', {}), nodeId: 'loop-1', id: 'step-loop' },
      {},
      'tenant-1',
      'execution-1',
      {
        nodes: [
          {
            id: 'agent',
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {},
            parentId: 'loop-1',
          },
          {
            id: 'result',
            type: 'result',
            position: { x: 0, y: 0 },
            data: {},
            parentId: 'loop-1',
          },
        ] as ReactFlowNode[],
        edges: [],
      },
      'loop',
    );
    context.breakRequested = true;
    context.roundOutputs = { review: 'approved' };
    const runtime = {
      loadExecutionContext: vi.fn().mockResolvedValue({
        execution: {},
        snapshot: { nodes: [], edges: [] },
        steps: [agentStep, resultStep],
      }),
      getSchedulingDecision: vi.fn().mockReturnValue('wait'),
      scheduleNode: vi.fn(),
      onNodeCompleted: vi.fn().mockResolvedValue(undefined),
      onNodeFailed: vi.fn(),
    };

    await service.scheduleNextCompoundNode(context, 'tenant-1', runtime);

    expect(updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      'step-agent',
      'skipped',
    );
    expect(updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      'step-result',
      'skipped',
    );
    expect(updateStepStatus).toHaveBeenCalledWith(
      'tenant-1',
      'step-loop',
      'completed',
      expect.objectContaining({
        result: expect.objectContaining({
          review: 'approved',
          compound: expect.objectContaining({ mode: 'loop' }),
        }),
      }),
    );
    expect(runtime.onNodeCompleted).toHaveBeenCalledWith(
      'execution-1',
      'step-loop',
      'tenant-1',
    );
  });

  it('单对象迭代输入包装为数组，loop 优先读取 state-in 并兼容 snake_case', () => {
    const service = new CompoundExecutionService(
      {} as DrizzleDB,
      {
        resolveDag: vi.fn().mockReturnValue({
          layers: [],
          adjacencyMap: new Map(),
          inDegreeMap: new Map(),
        }),
      } as unknown as DagResolverService,
      {} as StepStateMachineService,
      {} as EventBridgeService,
      {} as NodeExecutionFailurePolicy,
    );
    const iteration = service.createCompoundContext(
      makeStep('iteration', { config: { output_mode: 'collect-array' } }),
      { 'items-in': { topic: 'workflow orchestration' } },
      'tenant-1',
      'execution-1',
      { nodes: [], edges: [] },
      'iteration',
    );
    const loop = service.createCompoundContext(
      {
        ...makeStep('loop', {
          config: {
            default_state: { topic: 'fallback' },
            max_iterations: 5,
          },
        }),
        nodeId: 'loop-1',
      },
      { 'state-in': { topic: 'from-input' } },
      'tenant-1',
      'execution-1',
      { nodes: [], edges: [] },
      'loop',
    );

    expect(iteration.iterationItems).toEqual([
      { topic: 'workflow orchestration' },
    ]);
    expect(loop.loopState).toEqual({ topic: 'from-input' });
    expect(loop.maxIterations).toBe(5);
  });
});
