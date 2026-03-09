import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DRIZZLE } from '../../../database/database.module';
import { NodeSchedulerService } from '../node-scheduler.service';
import { DagResolverService } from '../dag-resolver.service';
import { StepStateMachineService } from '../step-state-machine.service';
import { AGENT_TASK_QUEUE, type InterventionResolution } from '../execution.constants';
import {
  AgentExecutionException,
  InterventionNotAllowedException,
  NodeInputResolutionException,
} from '../execution.exceptions';
import { SandboxService } from '../../sandbox/sandbox.service';
import type { ExecutionStep, ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import type { DagExecutionPlan } from '../dag-resolver.service';

const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';
const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const NOW = new Date('2025-01-01T00:00:00Z');

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    id: '019577a0-0000-7000-8000-step00000001',
    executionId: EXECUTION_ID,
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'pending',
    nodeType: 'agent',
    nodeData: {},
    input: null,
    result: null,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ExecutionStep;
}

function makeNode(
  id: string,
  type = 'agent',
  data: Record<string, unknown> = {},
): ReactFlowNode {
  return { id, type, position: { x: 0, y: 0 }, data } as ReactFlowNode;
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): ReactFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  } as ReactFlowEdge;
}

function makeSnapshot(nodes: ReactFlowNode[], edges: ReactFlowEdge[]) {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 }, metadata: {} };
}

function makeExecution(snapshot: ReturnType<typeof makeSnapshot>, status = 'running') {
  return {
    id: EXECUTION_ID,
    workflowDefinitionId: 'workflow-001',
    workflowVersionId: 'workflow-version-001',
    tenantId: TENANT_ID,
    status,
    triggerType: 'manual',
    inputParams: {},
    definitionSnapshot: snapshot,
    createdBy: 'user-001',
    completedSteps: 0,
    completedAt: null,
    failedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePlan(
  layers: string[][],
  adjacencyMap: Map<string, string[]>,
  inDegreeMap: Map<string, number>,
): DagExecutionPlan {
  return { layers, adjacencyMap, inDegreeMap };
}

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe('NodeSchedulerService', () => {
  let service: NodeSchedulerService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockDagResolver: { resolveDag: ReturnType<typeof vi.fn> };
  let mockStateMachine: {
    updateStepStatus: ReturnType<typeof vi.fn>;
    updateExecutionStatus: ReturnType<typeof vi.fn>;
    broadcastAgentEvent: ReturnType<typeof vi.fn>;
    markExecutionFailed: ReturnType<typeof vi.fn>;
  };
  let mockQueue: { add: ReturnType<typeof vi.fn> };
  let mockSandboxService: {
    createSandboxSession: ReturnType<typeof vi.fn>;
    getSandboxSession: ReturnType<typeof vi.fn>;
    destroySandbox: ReturnType<typeof vi.fn>;
  };

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    };

    mockDagResolver = { resolveDag: vi.fn() };
    mockStateMachine = {
      updateStepStatus: vi.fn().mockResolvedValue(undefined),
      updateExecutionStatus: vi.fn().mockResolvedValue(undefined),
      broadcastAgentEvent: vi.fn(),
      markExecutionFailed: vi.fn().mockResolvedValue(undefined),
    };
    mockQueue = { add: vi.fn().mockResolvedValue(undefined) };
    mockSandboxService = {
      createSandboxSession: vi.fn().mockResolvedValue({
        id: '019577a0-0000-7000-8000-sandbox00001',
        status: 'creating',
      }),
      getSandboxSession: vi.fn().mockResolvedValue(null),
      destroySandbox: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        NodeSchedulerService,
        { provide: DRIZZLE, useValue: db },
        { provide: DagResolverService, useValue: mockDagResolver },
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: getQueueToken(AGENT_TASK_QUEUE), useValue: mockQueue },
        { provide: SandboxService, useValue: mockSandboxService },
      ],
    }).compile();

    service = module.get(NodeSchedulerService);
  });

  describe('resolveNodeInput', () => {
    it('根节点应返回空对象', () => {
      expect(service.resolveNodeInput('node-1', [], [])).toEqual({});
    });

    it('会按 sourceHandle/targetHandle 映射聚合输入，并保留旧的 source 节点聚合兼容性', () => {
      const edges = [
        makeEdge('node-a', 'node-c', 'payload.answer', 'review.answer'),
        makeEdge('node-b', 'node-c', undefined, 'metadata.upstream'),
        makeEdge('node-d', 'node-c', 'payload.rating'),
        makeEdge('node-e', 'node-c'),
      ];
      const steps = [
        makeStep({
          nodeId: 'node-a',
          status: 'completed',
          result: { payload: { answer: 42 } },
        }),
        makeStep({
          nodeId: 'node-b',
          status: 'completed',
          result: { raw: true },
        }),
        makeStep({
          nodeId: 'node-d',
          status: 'completed',
          result: { payload: { rating: 5 } },
        }),
        makeStep({
          nodeId: 'node-e',
          status: 'completed',
          result: { legacy: 'keep-source-node-id' },
        }),
      ];

      expect(service.resolveNodeInput('node-c', edges, steps)).toEqual({
        review: { answer: 42 },
        metadata: { upstream: { raw: true } },
        payload: { rating: 5 },
        'node-e': { legacy: 'keep-source-node-id' },
      });
    });

    it('缺少源节点或结果时会抛出 NodeInputResolutionException', () => {
      const edges = [makeEdge('node-a', 'node-c')];

      expect(() => service.resolveNodeInput('node-c', edges, [])).toThrow(
        NodeInputResolutionException,
      );
      expect(() =>
        service.resolveNodeInput('node-c', edges, [
          makeStep({ nodeId: 'node-a', status: 'completed', result: null }),
        ]),
      ).toThrow(NodeInputResolutionException);
    });
  });

  describe('startExecution', () => {
    it('会调度首层节点，并把 input 与 nodeData 一并入队', async () => {
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);
      const steps = [
        makeStep({ id: 'step-a', nodeId: 'A', nodeData: { agentId: 'agent-a' } }),
        makeStep({ id: 'step-b', nodeId: 'B', nodeData: { agentId: 'agent-b' } }),
        makeStep({ id: 'step-c', nodeId: 'C' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update.mockReturnValue(createUpdateChainVoid());
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([['A', ['C']], ['B', ['C']], ['C', []]]),
          new Map([['A', 0], ['B', 0], ['C', 2]]),
        ),
      );

      await service.startExecution(EXECUTION_ID, TENANT_ID);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'queued',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'queued',
      );
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-a',
        tenantId: TENANT_ID,
        input: {},
        nodeData: { agentId: 'agent-a' },
        hasSandbox: false,
      });
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-b',
        tenantId: TENANT_ID,
        input: {},
        nodeData: { agentId: 'agent-b' },
        hasSandbox: false,
      });
    });

    it('空图时直接更新 execution 状态', async () => {
      const snapshot = makeSnapshot([], []);

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain([]));
      mockDagResolver.resolveDag.mockReturnValue(makePlan([], new Map(), new Map()));

      await service.startExecution(EXECUTION_ID, TENANT_ID);

      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('scheduleNode', () => {
    it('agent 节点会保存 input 后进入队列，并携带 nodeData', async () => {
      const snapshot = makeSnapshot([makeNode('A'), makeNode('B')], [makeEdge('A', 'B')]);
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          result: { answer: 'hello' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          status: 'pending',
          nodeType: 'agent',
          nodeData: { agentId: 'agent-b' },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'B', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'queued',
      );
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-b',
        tenantId: TENANT_ID,
        input: { A: { answer: 'hello' } },
        nodeData: { agentId: 'agent-b' },
        hasSandbox: false,
      });
    });

    it('data_transform 节点会直接内联执行，不进入 queued', async () => {
      const snapshot = makeSnapshot([makeNode('A'), makeNode('B', 'data_transform')], [makeEdge('A', 'B')]);
      const executeDataTransform = vi
        .spyOn(service, 'executeDataTransform')
        .mockResolvedValue(undefined);
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          result: { answer: 'hello' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          status: 'pending',
          nodeType: 'data_transform',
          nodeData: { mapping: { value: 'A.answer' } },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'B', TENANT_ID, snapshot, steps);

      expect(executeDataTransform).toHaveBeenCalledWith(
        steps[1],
        { A: { answer: 'hello' } },
        TENANT_ID,
        EXECUTION_ID,
      );
      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'queued',
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('sandbox 节点会创建沙箱会话并自动完成', async () => {
      const snapshot = makeSnapshot(
        [makeNode('S', 'sandbox', { cpu: 2, memory: 1024, disk: 5, timeout: 4 })],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'pending',
          nodeType: 'sandbox',
          nodeData: { cpu: 2, memory: 1024, disk: 5, timeout: 4 },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'S', TENANT_ID, snapshot, steps);

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith(
        EXECUTION_ID,
        'S',
        { cpu: 2, memory: 1024, disk: 5, timeout: 4 },
        TENANT_ID,
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-s',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-s',
        'completed',
        {
          result: {
            sessionId: '019577a0-0000-7000-8000-sandbox00001',
            status: 'creating',
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(EXECUTION_ID, 'step-s', TENANT_ID);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('agent 节点上游有 sandbox 时 job 数据应包含 hasSandbox: true', async () => {
      const snapshot = makeSnapshot(
        [makeNode('S', 'sandbox'), makeNode('A', 'agent')],
        [makeEdge('S', 'A')],
      );
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'completed',
          nodeType: 'sandbox',
          result: { sessionId: 'sandbox-session-001', status: 'ready' },
        }),
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'pending',
          nodeType: 'agent',
          nodeData: { agentId: 'agent-1' },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'A', TENANT_ID, snapshot, steps);

      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-a',
        tenantId: TENANT_ID,
        input: { S: { sessionId: 'sandbox-session-001', status: 'ready' } },
        nodeData: { agentId: 'agent-1' },
        hasSandbox: true,
      });
    });

    it('agent 节点无 sandbox 上游时 hasSandbox 应为 false', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B')],
      );
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          result: { answer: 'hello' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          status: 'pending',
          nodeType: 'agent',
          nodeData: { agentId: 'agent-b' },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'B', TENANT_ID, snapshot, steps);

      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-b',
        tenantId: TENANT_ID,
        input: { A: { answer: 'hello' } },
        nodeData: { agentId: 'agent-b' },
        hasSandbox: false,
      });
    });
  });

  describe('onNodeCompleted', () => {
    it('execution 已失败时直接返回，不再调度后继', async () => {
      const snapshot = makeSnapshot([makeNode('A'), makeNode('B')], [makeEdge('A', 'B')]);
      const completedStep = makeStep({ id: 'step-a', nodeId: 'A', status: 'completed', result: { ok: true } });
      const steps = [completedStep, makeStep({ id: 'step-b', nodeId: 'B', status: 'pending' })];

      db.select
        .mockReturnValueOnce(createSelectChain([completedStep]))
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot, 'failed')]))
        .mockReturnValueOnce(createSelectChain(steps));

      await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).not.toHaveBeenCalled();
      expect(mockDagResolver.resolveDag).not.toHaveBeenCalled();
    });
  });

  describe('cleanupSandboxIfTerminal', () => {
    it('execution 为 completed 时应触发 destroySandbox', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ status: 'completed' }]));

      await service.cleanupSandboxIfTerminal(EXECUTION_ID, TENANT_ID);

      expect(mockSandboxService.destroySandbox).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
    });

    it('execution 为 running 时不应触发 destroySandbox', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ status: 'running' }]));

      await service.cleanupSandboxIfTerminal(EXECUTION_ID, TENANT_ID);

      expect(mockSandboxService.destroySandbox).not.toHaveBeenCalled();
    });

    it('destroySandbox 异常时应 warn 而非抛出', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ status: 'failed' }]));
      mockSandboxService.destroySandbox.mockRejectedValueOnce(new Error('container not found'));

      await expect(
        service.cleanupSandboxIfTerminal(EXECUTION_ID, TENANT_ID),
      ).resolves.toBeUndefined();
    });
  });

  describe('executeDataTransform', () => {
    it('优先执行 expression，并将对象结果写入 completed result', async () => {
      const step = makeStep({
        id: 'step-transform',
        nodeId: 'B',
        nodeType: 'data_transform',
        nodeData: {
          expression: "({ summary: input.A.answer.toUpperCase(), length: input.A.answer.length })",
        },
      });
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.executeDataTransform(
        step,
        { A: { answer: 'hello' } },
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenNthCalledWith(
        1,
        TENANT_ID,
        'step-transform',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenNthCalledWith(
        2,
        TENANT_ID,
        'step-transform',
        'completed',
        {
          result: {
            summary: 'HELLO',
            length: 5,
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-transform',
        TENANT_ID,
      );
    });
  });

  describe('executeConditional', () => {
    it('优先执行 expression 决定分支', async () => {
      const step = makeStep({
        id: 'step-conditional',
        nodeId: 'C',
        nodeType: 'conditional',
        nodeData: {
          expression: 'input.A.score >= 80',
        },
      });
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.executeConditional(
        step,
        { A: { score: 92 } },
        TENANT_ID,
        EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenNthCalledWith(
        1,
        TENANT_ID,
        'step-conditional',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenNthCalledWith(
        2,
        TENANT_ID,
        'step-conditional',
        'completed',
        {
          result: {
            branch: 'true',
            expression: 'input.A.score >= 80',
            evaluatedValue: true,
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-conditional',
        TENANT_ID,
      );
    });
  });

  describe('resolveIntervention', () => {
    const STEP_ID = '019391d4-0000-7000-0000-000000000099';
    const SESSION_ID = 'session-abc-123';

    it('会校验 waiting_intervention 并把结构化 resolution 入队', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        input: { upstream: { draft: '初稿' } },
        nodeData: { agentId: 'agent-001', autonomyMode: 'LLM_SUGGEST' },
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '之前的内容',
          stopReason: 'intervention_required',
        },
      });
      const resolution: InterventionResolution = {
        action: 'modify',
        modifiedContent: '人工修订后的内容',
        feedback: '请按这个版本提交',
      };

      db.select.mockReturnValueOnce(createSelectChain([step]));

      await service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, resolution);

      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        input: { upstream: { draft: '初稿' } },
        nodeData: { agentId: 'agent-001', autonomyMode: 'LLM_SUGGEST' },
        resumeSessionId: SESSION_ID,
        intervention: resolution,
      });
    });

    it('状态非法时抛出 InterventionNotAllowedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([makeStep({ id: STEP_ID, status: 'running' })]),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(InterventionNotAllowedException);
    });

    it('检查点缺少 sessionId 时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          makeStep({ id: STEP_ID, status: 'waiting_intervention', checkpointData: {} }),
        ]),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(AgentExecutionException);
    });

    it('step 不属于 execution 时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          makeStep({
            id: STEP_ID,
            executionId: '019391d4-d000-7000-0000-000000009999',
            status: 'waiting_intervention',
            checkpointData: { sessionId: SESSION_ID },
          }),
        ]),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(AgentExecutionException);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onNodeFailed', () => {
    it('会取消 execution 内可取消步骤，并强制 execution 进入 failed', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')],
        [makeEdge('A', 'B'), makeEdge('A', 'C'), makeEdge('C', 'D')],
      );
      const failedStep = makeStep({
        id: 'step-a',
        nodeId: 'A',
        status: 'failed',
        errorMessage: { message: '节点执行失败' },
      });
      const steps = [
        failedStep,
        makeStep({ id: 'step-b', nodeId: 'B', status: 'pending' }),
        makeStep({ id: 'step-c', nodeId: 'C', status: 'queued' }),
        makeStep({ id: 'step-d', nodeId: 'D', status: 'waiting_intervention' }),
        makeStep({ id: 'step-e', nodeId: 'E', status: 'completed' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([failedStep]))
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain(steps))
        .mockReturnValueOnce(createSelectChain([{ status: 'failed' }]));

      await service.onNodeFailed(EXECUTION_ID, 'step-a', TENANT_ID);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'cancelled',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-c',
        'cancelled',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-d',
        'cancelled',
      );
      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalledWith(
        TENANT_ID,
        'step-e',
        'cancelled',
      );
      expect(mockStateMachine.markExecutionFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
        { message: '节点执行失败' },
      );
    });

    it('步骤不存在时静默返回', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await service.onNodeFailed(EXECUTION_ID, 'step-ghost', TENANT_ID);

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockStateMachine.markExecutionFailed).not.toHaveBeenCalled();
    });
  });
});
