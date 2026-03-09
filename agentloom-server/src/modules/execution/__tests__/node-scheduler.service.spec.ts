import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DRIZZLE } from '../../../database/database.module';
import { NodeSchedulerService } from '../node-scheduler.service';
import { DagResolverService } from '../dag-resolver.service';
import {
  StepStateMachineService,
  COMPLETED_STEP_STATUSES,
} from '../step-state-machine.service';
import { AGENT_TASK_QUEUE } from '../execution.constants';
import {
  NodeInputResolutionException,
  InterventionNotAllowedException,
  AgentExecutionException,
} from '../execution.exceptions';
import type { ExecutionStep } from '../../../database/schema';
import type { ReactFlowEdge, ReactFlowNode } from '../../../database/schema';
import type { DagExecutionPlan } from '../dag-resolver.service';

// ── 常量 ──────────────────────────────────────────────────────

const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';
const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const NOW = new Date('2025-01-01T00:00:00Z');

// ── 辅助工厂 ──────────────────────────────────────────────────

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
): ReactFlowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  } as ReactFlowEdge;
}

function makeSnapshot(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
) {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 }, metadata: {} };
}

function makePlan(
  layers: string[][],
  adjacencyMap: Map<string, string[]>,
  inDegreeMap: Map<string, number>,
): DagExecutionPlan {
  return { layers, adjacencyMap, inDegreeMap };
}

/** select().from().where() 链 */
function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

/** update().set().where() 链（void） */
function createUpdateChainVoid() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

// ── 测试 ──────────────────────────────────────────────────────

describe('NodeSchedulerService', () => {
  let service: NodeSchedulerService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockDagResolver: { resolveDag: ReturnType<typeof vi.fn> };
  let mockStateMachine: {
    updateStepStatus: ReturnType<typeof vi.fn>;
    updateExecutionStatus: ReturnType<typeof vi.fn>;
    broadcastAgentEvent: ReturnType<typeof vi.fn>;
  };
  let mockQueue: { add: ReturnType<typeof vi.fn> };

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
    };

    mockQueue = { add: vi.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        NodeSchedulerService,
        { provide: DRIZZLE, useValue: db },
        { provide: DagResolverService, useValue: mockDagResolver },
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: getQueueToken(AGENT_TASK_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(NodeSchedulerService);
  });

  // ────────────────────────────────────────────────────────────
  // resolveNodeInput
  // ────────────────────────────────────────────────────────────
  describe('resolveNodeInput', () => {
    it('根节点（无入边）应返回空对象', () => {
      const edges: ReactFlowEdge[] = [];
      const steps: ExecutionStep[] = [];

      const input = service.resolveNodeInput('node-1', edges, steps);

      expect(input).toEqual({});
    });

    it('应收集所有入边源节点的 result', () => {
      const edges = [makeEdge('node-a', 'node-c'), makeEdge('node-b', 'node-c')];
      const steps = [
        makeStep({ nodeId: 'node-a', status: 'completed', result: { x: 1 } }),
        makeStep({ nodeId: 'node-b', status: 'completed', result: { y: 2 } }),
        makeStep({ nodeId: 'node-c', status: 'pending' }),
      ];

      const input = service.resolveNodeInput('node-c', edges, steps);

      expect(input).toEqual({
        'node-a': { x: 1 },
        'node-b': { y: 2 },
      });
    });

    it('被跳过的源节点应从输入中排除', () => {
      const edges = [makeEdge('node-a', 'node-c'), makeEdge('node-b', 'node-c')];
      const steps = [
        makeStep({ nodeId: 'node-a', status: 'completed', result: { x: 1 } }),
        makeStep({ nodeId: 'node-b', status: 'skipped' }),
        makeStep({ nodeId: 'node-c', status: 'pending' }),
      ];

      const input = service.resolveNodeInput('node-c', edges, steps);

      expect(input).toEqual({ 'node-a': { x: 1 } });
    });

    it('源节点不存在时应抛出 NodeInputResolutionException', () => {
      const edges = [makeEdge('node-missing', 'node-c')];
      const steps = [makeStep({ nodeId: 'node-c' })];

      expect(() =>
        service.resolveNodeInput('node-c', edges, steps),
      ).toThrow(NodeInputResolutionException);
    });

    it('源节点 result 为 null 时应抛出 NodeInputResolutionException', () => {
      const edges = [makeEdge('node-a', 'node-c')];
      const steps = [
        makeStep({ nodeId: 'node-a', status: 'completed', result: null }),
        makeStep({ nodeId: 'node-c', status: 'pending' }),
      ];

      expect(() =>
        service.resolveNodeInput('node-c', edges, steps),
      ).toThrow(NodeInputResolutionException);
    });
  });

  // ────────────────────────────────────────────────────────────
  // startExecution
  // ────────────────────────────────────────────────────────────
  describe('startExecution', () => {
    it('应解析 DAG 并调度第一层节点', async () => {
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'pending',
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', status: 'pending',
      });
      const stepC = makeStep({
        id: 'step-c', nodeId: 'C', status: 'pending',
      });
      const steps = [stepA, stepB, stepC];

      // loadExecutionContext: 读 execution, 读 steps
      db.select
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain(steps));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([['A', ['C']], ['B', ['C']], ['C', []]]),
          new Map([['A', 0], ['B', 0], ['C', 2]]),
        ),
      );

      // 每次 scheduleNode 需要 update (save input) + updateStepStatus (queued)
      db.update
        .mockReturnValueOnce(createUpdateChainVoid())
        .mockReturnValueOnce(createUpdateChainVoid());

      await service.startExecution(EXECUTION_ID, TENANT_ID);

      // A 和 B 应加入 agent-task 队列
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-a',
        tenantId: TENANT_ID,
      });
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-b',
        tenantId: TENANT_ID,
      });

      // 两个节点都应转为 queued
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledTimes(2);
    });

    it('空图应直接更新执行状态', async () => {
      const snapshot = makeSnapshot([], []);

      db.select
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );

      await service.startExecution(EXECUTION_ID, TENANT_ID);

      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────
  // scheduleNode
  // ────────────────────────────────────────────────────────────
  describe('scheduleNode', () => {
    const snapshot = makeSnapshot(
      [makeNode('A'), makeNode('B')],
      [makeEdge('A', 'B')],
    );

    it('agent 类型节点应加入 agent-task 队列', async () => {
      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { output: 'hello' },
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', nodeType: 'agent', status: 'pending',
      });
      const steps = [stepA, stepB];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(
        EXECUTION_ID, 'B', TENANT_ID, snapshot, steps,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-b', 'queued',
      );
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-b',
        tenantId: TENANT_ID,
      });
    });

    it('data_transform 节点应内联执行', async () => {
      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { value: 42 },
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', nodeType: 'data_transform',
        status: 'pending', nodeData: {},
      });
      const steps = [stepA, stepB];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      // executeDataTransform 内部：running → completed → onNodeCompleted
      // onNodeCompleted 读取数据
      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({
            id: 'step-b', nodeId: 'B', nodeType: 'data_transform',
            status: 'completed', result: { A: { value: 42 } },
          })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([
          stepA,
          makeStep({ id: 'step-b', nodeId: 'B', status: 'completed' }),
        ]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A'], ['B']],
          new Map([['A', ['B']], ['B', []]]),
          new Map([['A', 0], ['B', 1]]),
        ),
      );

      await service.scheduleNode(
        EXECUTION_ID, 'B', TENANT_ID, snapshot, steps,
      );

      // running → completed
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-b', 'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-b', 'completed',
        { result: { A: { value: 42 } } },
      );
      // onNodeCompleted 更新 execution 状态
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalled();
    });

    it('conditional 节点应内联执行', async () => {
      const condSnapshot = makeSnapshot(
        [makeNode('A'), makeNode('COND', 'conditional', {
          conditionField: 'status', expectedValue: 'approved',
        })],
        [makeEdge('A', 'COND')],
      );

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { status: 'approved' },
      });
      const stepCond = makeStep({
        id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
        status: 'pending',
        nodeData: { conditionField: 'status', expectedValue: 'approved' },
      });
      const steps = [stepA, stepCond];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      // executeConditional → onNodeCompleted
      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({
            id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
            status: 'completed',
            result: {
              branch: 'true',
              evaluatedField: 'status',
              actualValue: 'approved',
              expectedValue: 'approved',
            },
          })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: condSnapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([
          stepA,
          makeStep({ id: 'step-cond', nodeId: 'COND', status: 'completed' }),
        ]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A'], ['COND']],
          new Map([['A', ['COND']], ['COND', []]]),
          new Map([['A', 0], ['COND', 1]]),
        ),
      );

      await service.scheduleNode(
        EXECUTION_ID, 'COND', TENANT_ID, condSnapshot, steps,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-cond', 'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-cond', 'completed',
        expect.objectContaining({
          result: expect.objectContaining({ branch: 'true' }),
        }),
      );
    });

    it('nodeId 不存在对应 step 时应静默返回', async () => {
      await service.scheduleNode(
        EXECUTION_ID, 'ghost', TENANT_ID, snapshot, [],
      );

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('未知 nodeType 应按 agent 处理并加入队列', async () => {
      const stepX = makeStep({
        id: 'step-x', nodeId: 'A', nodeType: 'custom_type' as string,
        status: 'pending',
      });

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(
        EXECUTION_ID, 'A', TENANT_ID,
        makeSnapshot([makeNode('A')], []),
        [stepX],
      );

      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-x',
        tenantId: TENANT_ID,
      });
    });
  });

  // ────────────────────────────────────────────────────────────
  // onNodeCompleted
  // ────────────────────────────────────────────────────────────
  describe('onNodeCompleted', () => {
    it('所有前驱完成后应调度后继节点', async () => {
      // A → C, B → C。A 和 B 都完成，应调度 C。
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { x: 1 },
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', status: 'completed',
        result: { y: 2 },
      });
      const stepC = makeStep({
        id: 'step-c', nodeId: 'C', status: 'pending',
      });

      // 1. 读取 completedStep (B)
      db.select.mockReturnValueOnce(
        createSelectChain([stepB]),
      );
      // 2. loadExecutionContext (execution + steps)
      db.select
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(
          createSelectChain([stepA, stepB, stepC]),
        );

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([['A', ['C']], ['B', ['C']], ['C', []]]),
          new Map([['A', 0], ['B', 0], ['C', 2]]),
        ),
      );

      // scheduleNode 为 C 保存 input
      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.onNodeCompleted(EXECUTION_ID, 'step-b', TENANT_ID);

      // C 应加入 agent-task 队列
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-c',
        tenantId: TENANT_ID,
      });
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID, TENANT_ID,
      );
    });

    it('前驱未全部完成时不应调度后继', async () => {
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { x: 1 },
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', status: 'running',
      });
      const stepC = makeStep({
        id: 'step-c', nodeId: 'C', status: 'pending',
      });

      db.select
        .mockReturnValueOnce(createSelectChain([stepA]))
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([stepA, stepB, stepC]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([['A', ['C']], ['B', ['C']], ['C', []]]),
          new Map([['A', 0], ['B', 0], ['C', 2]]),
        ),
      );

      await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

      // C 不应被调度
      expect(mockQueue.add).not.toHaveBeenCalled();
      // 但 execution status 仍应更新
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalled();
    });

    it('终端节点（无后继）完成后应只更新执行状态', async () => {
      const nodes = [makeNode('A')];
      const snapshot = makeSnapshot(nodes, []);

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { done: true },
      });

      db.select
        .mockReturnValueOnce(createSelectChain([stepA]))
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([stepA]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([['A']], new Map([['A', []]]), new Map([['A', 0]])),
      );

      await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID, TENANT_ID,
      );
    });

    it('被跳过节点的后继如果前驱全部被跳过，也应被跳过', async () => {
      // B(skipped) → D。D 的唯一前驱 B 被跳过 → D 也应被跳过。
      const nodes = [makeNode('A'), makeNode('B'), makeNode('D')];
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'D')];
      const snapshot = makeSnapshot(nodes, edges);

      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', status: 'skipped',
      });
      const stepD = makeStep({
        id: 'step-d', nodeId: 'D', status: 'pending',
      });

      // 读取 completedStep (B-skipped)
      db.select.mockReturnValueOnce(createSelectChain([stepB]));
      // loadExecutionContext
      db.select
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([stepB, stepD]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['B'], ['D']],
          new Map([['B', ['D']], ['D', []]]),
          new Map([['B', 0], ['D', 1]]),
        ),
      );

      // skipAndCascade → onNodeCompleted(D) 递归
      // D 被跳过后 onNodeCompleted(D) 读取数据
      const stepDSkipped = makeStep({
        id: 'step-d', nodeId: 'D', status: 'skipped',
      });
      db.select
        .mockReturnValueOnce(createSelectChain([stepDSkipped]))
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(createSelectChain([stepB, stepDSkipped]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['B'], ['D']],
          new Map([['B', ['D']], ['D', []]]),
          new Map([['B', 0], ['D', 1]]),
        ),
      );

      await service.onNodeCompleted(EXECUTION_ID, 'step-b', TENANT_ID);

      // D 应被标记为 skipped
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-d', 'skipped',
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // executeDataTransform
  // ────────────────────────────────────────────────────────────
  describe('executeDataTransform', () => {
    it('无 mapping 配置应透传输入', async () => {
      const step = makeStep({
        id: 'step-dt', nodeId: 'DT', nodeType: 'data_transform',
        nodeData: {},
      });
      const input = { 'node-a': { value: 42 } };

      // onNodeCompleted 读取数据
      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({
            ...step, status: 'completed',
            result: { 'node-a': { value: 42 } },
          })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: makeSnapshot([], []) }]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );

      await service.executeDataTransform(
        step, input, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-dt', 'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-dt', 'completed',
        { result: { 'node-a': { value: 42 } } },
      );
    });

    it('应用 mapping 配置进行转换', async () => {
      const step = makeStep({
        id: 'step-dt', nodeId: 'DT', nodeType: 'data_transform',
        nodeData: {
          mapping: {
            extractedValue: 'node-a.value',
            nested: 'node-a.deep.field',
          },
        },
      });
      const input = { 'node-a': { value: 42, deep: { field: 'hello' } } };

      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({ ...step, status: 'completed' })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: makeSnapshot([], []) }]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );

      await service.executeDataTransform(
        step, input, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-dt', 'completed',
        { result: { extractedValue: 42, nested: 'hello' } },
      );
    });

    it('转换失败应标记为 failed', async () => {
      const step = makeStep({
        id: 'step-dt', nodeId: 'DT', nodeType: 'data_transform',
        nodeData: { mapping: { x: 'invalid' } },
      });

      // running 成功，completed 抛错模拟
      mockStateMachine.updateStepStatus
        .mockResolvedValueOnce(undefined) // running
        .mockRejectedValueOnce(new Error('模拟转换失败')) // 模拟错误
        .mockResolvedValueOnce(undefined); // failed

      // 需要模拟 running 正常, completed 抛错不是 InvalidStepTransitionException
      // 改为让 resolveJsonPath 出错
      mockStateMachine.updateStepStatus.mockReset();
      mockStateMachine.updateStepStatus
        .mockResolvedValueOnce(undefined) // running OK
        .mockImplementationOnce(() => {
          throw new Error('模拟数据库错误');
        });

      await service.executeDataTransform(
        step, { 'node-a': { val: 1 } }, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID, 'step-dt', 'failed',
        { errorMessage: '模拟数据库错误' },
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // executeConditional
  // ────────────────────────────────────────────────────────────
  describe('executeConditional', () => {
    it('条件匹配时应返回 true 分支', async () => {
      const step = makeStep({
        id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
        nodeData: { conditionField: 'status', expectedValue: 'approved' },
      });
      const input = { 'node-a': { status: 'approved', name: 'test' } };

      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({
            ...step, status: 'completed',
            result: { branch: 'true' },
          })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: makeSnapshot([], []) }]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );

      await service.executeConditional(
        step, input, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-cond', 'completed',
        {
          result: {
            branch: 'true',
            evaluatedField: 'status',
            actualValue: 'approved',
            expectedValue: 'approved',
          },
        },
      );
    });

    it('条件不匹配时应返回 false 分支', async () => {
      const step = makeStep({
        id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
        nodeData: { conditionField: 'status', expectedValue: 'approved' },
      });
      const input = { 'node-a': { status: 'rejected' } };

      db.select
        .mockReturnValueOnce(
          createSelectChain([makeStep({
            ...step, status: 'completed',
            result: { branch: 'false' },
          })]),
        )
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: makeSnapshot([], []) }]),
        )
        .mockReturnValueOnce(createSelectChain([]));

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );

      await service.executeConditional(
        step, input, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-cond', 'completed',
        {
          result: {
            branch: 'false',
            evaluatedField: 'status',
            actualValue: 'rejected',
            expectedValue: 'approved',
          },
        },
      );
    });

    it('条件评估失败应标记为 failed', async () => {
      const step = makeStep({
        id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
        nodeData: { conditionField: 'status', expectedValue: 'ok' },
      });

      mockStateMachine.updateStepStatus
        .mockResolvedValueOnce(undefined) // running
        .mockImplementationOnce(() => {
          throw new Error('条件评估异常');
        });

      await service.executeConditional(
        step, {}, TENANT_ID, EXECUTION_ID,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID, 'step-cond', 'failed',
        { errorMessage: '条件评估异常' },
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 条件分支集成场景
  // ────────────────────────────────────────────────────────────
  describe('条件分支集成', () => {
    it('条件节点完成后应调度匹配分支、跳过不匹配分支', async () => {
      // COND --true--> T, COND --false--> F
      const nodes = [
        makeNode('COND', 'conditional'),
        makeNode('T'),
        makeNode('F'),
      ];
      const edges = [
        makeEdge('COND', 'T', 'true'),
        makeEdge('COND', 'F', 'false'),
      ];
      const snapshot = makeSnapshot(nodes, edges);

      const stepCond = makeStep({
        id: 'step-cond', nodeId: 'COND', nodeType: 'conditional',
        status: 'completed',
        result: { branch: 'true' },
      });
      const stepT = makeStep({
        id: 'step-t', nodeId: 'T', status: 'pending',
      });
      const stepF = makeStep({
        id: 'step-f', nodeId: 'F', status: 'pending',
      });

      // 1. 读取 completedStep (COND)
      db.select.mockReturnValueOnce(createSelectChain([stepCond]));
      // 2. loadExecutionContext
      db.select
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(
          createSelectChain([stepCond, stepT, stepF]),
        );

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['COND'], ['T', 'F']],
          new Map([['COND', ['T', 'F']], ['T', []], ['F', []]]),
          new Map([['COND', 0], ['T', 1], ['F', 1]]),
        ),
      );

      // scheduleNode(T) 需要 update (input) + queue.add
      db.update.mockReturnValueOnce(createUpdateChainVoid());

      // skipAndCascade(F) → onNodeCompleted(F)
      // onNodeCompleted(F) 读取数据
      const stepFSkipped = makeStep({
        id: 'step-f', nodeId: 'F', status: 'skipped',
      });
      db.select
        .mockReturnValueOnce(createSelectChain([stepFSkipped]))
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(
          createSelectChain([stepCond, stepT, stepFSkipped]),
        );

      // onNodeCompleted(F) 的 resolveDag 调用
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['COND'], ['T', 'F']],
          new Map([['COND', ['T', 'F']], ['T', []], ['F', []]]),
          new Map([['COND', 0], ['T', 1], ['F', 1]]),
        ),
      );

      await service.onNodeCompleted(EXECUTION_ID, 'step-cond', TENANT_ID);

      // T 应被调度到队列
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-t',
        tenantId: TENANT_ID,
      });

      // F 应被标记为 skipped
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID, 'step-f', 'skipped',
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // getSchedulingDecision（通过 onNodeCompleted 间接测试）
  // ────────────────────────────────────────────────────────────
  describe('调度决策', () => {
    it('混合完成和跳过的前驱应调度后继（至少一个非 skipped）', async () => {
      // A(completed) + B(skipped) → C
      const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);

      const stepA = makeStep({
        id: 'step-a', nodeId: 'A', status: 'completed',
        result: { x: 1 },
      });
      const stepB = makeStep({
        id: 'step-b', nodeId: 'B', status: 'skipped',
      });
      const stepC = makeStep({
        id: 'step-c', nodeId: 'C', status: 'pending',
      });

      db.select
        .mockReturnValueOnce(createSelectChain([stepA]))
        .mockReturnValueOnce(
          createSelectChain([{ definitionSnapshot: snapshot }]),
        )
        .mockReturnValueOnce(
          createSelectChain([stepA, stepB, stepC]),
        );

      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([['A', ['C']], ['B', ['C']], ['C', []]]),
          new Map([['A', 0], ['B', 0], ['C', 2]]),
        ),
      );

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

      // C 应被调度（A completed + B skipped → schedule）
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: 'step-c',
        tenantId: TENANT_ID,
      });
    });
  });

  // ────────────────────────────────────────────────────────────
  // resolveIntervention
  // ────────────────────────────────────────────────────────────
  describe('resolveIntervention', () => {
    const STEP_ID = '019391d4-0000-7000-0000-000000000099';
    const SESSION_ID = 'session-abc-123';

    it('应读取步骤并验证为 waiting_intervention 后排队恢复任务', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '之前的内容',
          stopReason: 'tool_use',
        },
      });
      db.select.mockReturnValue(createSelectChain([step]));

      await service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, '请继续执行');

      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        resumeSessionId: SESSION_ID,
        feedbackContent: '请继续执行',
      });
    });

    it('应在步骤状态非 waiting_intervention 时抛出 InterventionNotAllowedException', async () => {
      const step = makeStep({ id: STEP_ID, status: 'running' });
      db.select.mockReturnValue(createSelectChain([step]));

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, '反馈'),
      ).rejects.toThrow(InterventionNotAllowedException);
    });

    it('应在步骤不存在时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, '反馈'),
      ).rejects.toThrow(AgentExecutionException);
    });

    it('应在检查点缺少 sessionId 时抛出 AgentExecutionException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: { partialContent: '内容' },
      });
      db.select.mockReturnValue(createSelectChain([step]));

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, '反馈'),
      ).rejects.toThrow(AgentExecutionException);
    });

    it('应在步骤无检查点数据时抛出 AgentExecutionException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: null,
      });
      db.select.mockReturnValue(createSelectChain([step]));

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, '反馈'),
      ).rejects.toThrow(AgentExecutionException);
    });
  });
});
