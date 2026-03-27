import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DRIZZLE } from '../../../database/database.module';
import { NodeSchedulerService } from '../node-scheduler.service';
import { DagResolverService } from '../dag-resolver.service';
import { StepStateMachineService } from '../step-state-machine.service';
import { EventBridgeService } from '../services/event-bridge.service';
import {
  AGENT_TASK_QUEUE,
  MAX_ESCALATION_ATTEMPTS,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type InterventionResolution,
  type ToolPermissionResolution,
} from '../execution.constants';
import {
  AgentExecutionException,
  InvalidStepTransitionException,
  InterventionNotAllowedException,
  NodeInputResolutionException,
  InterventionPermissionDeniedException,
  ToolPermissionResolutionNotAllowedException,
  ToolCallNotFoundException,
} from '../execution.exceptions';
import { SandboxService } from '../../sandbox/sandbox.service';
import { CheckpointService } from '../checkpoint.service';
import { InterventionPolicyService } from '../../intervention-policy/intervention-policy.service';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { RouterRegistry } from '../../smart-routing/core/router-registry';
import { HealthMonitorService } from '../../smart-routing/circuit-breaker/health-monitor.service';
import { EmbeddingIntegrationService } from '../../smart-routing/embedding/embedding.service';
import { RbacCacheService } from '../../../common/services/rbac-cache.service';
import { PluginService } from '../../plugin/plugin.service';
import { PLUGIN_EXECUTION_QUEUE } from '../../plugin/plugin.constants';
import { AgentAdapterFactory } from '../adapters/agent-adapter-factory';
import { SharedResourceRegistry } from '../../shared-resources/shared-resource-registry';
import { McpService } from '../../mcp/mcp.service';
import type {
  ExecutionStep,
  ReactFlowEdge,
  ReactFlowNode,
} from '../../../database/schema';
import type { DagExecutionPlan } from '../dag-resolver.service';

const EXECUTION_ID = '019577a0-0000-7000-8000-000000000001';
const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const USER_ID = '019577a0-0000-7000-8000-000000000100';
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

function makeExecution(
  snapshot: ReturnType<typeof makeSnapshot>,
  status = 'running',
) {
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
  const limit = vi.fn().mockResolvedValue(result);
  const whereResult = Object.assign(Promise.resolve(result), { limit });
  const joinedChain = {
    where: vi.fn().mockReturnValue(whereResult),
  };

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
      innerJoin: vi.fn().mockReturnValue(joinedChain),
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
  let mockQueue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };
  let mockPluginQueue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
  };
  let mockSandboxService: {
    createSandboxSession: ReturnType<typeof vi.fn>;
    getSandboxSession: ReturnType<typeof vi.fn>;
    destroySandbox: ReturnType<typeof vi.fn>;
  };
  let mockCheckpointService: {
    saveCheckpoint: ReturnType<typeof vi.fn>;
  };
  let mockEventBridge: {
    emitInterventionResolved: ReturnType<typeof vi.fn>;
    emitToolPermissionResolved: ReturnType<typeof vi.fn>;
  };
  let mockInterventionPolicyService: {
    resolvePolicy: ReturnType<typeof vi.fn>;
  };
  let mockSmartRoutingService: {
    recordDecision: ReturnType<typeof vi.fn>;
    getHistoricalMetrics: ReturnType<typeof vi.fn>;
  };
  let mockRouterRegistry: {
    get: ReturnType<typeof vi.fn>;
  };
  let mockHealthMonitorService: {
    filterHealthyCandidates: ReturnType<typeof vi.fn>;
  };
  let mockEmbeddingService: {
    generateEmbedding: ReturnType<typeof vi.fn>;
  };
  let mockRbacCacheService: {
    getUserRole: ReturnType<typeof vi.fn>;
  };
  let mockPluginService: {
    findActiveByPluginId: ReturnType<typeof vi.fn>;
  };
  let mockWorkflowAgentAdapterFactory: {
    createFromAgentDefinition: ReturnType<typeof vi.fn>;
  };
  let mockSharedResourceRegistry: {
    createResource: ReturnType<typeof vi.fn>;
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
    mockQueue = {
      add: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    };
    mockPluginQueue = {
      add: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    };
    mockSandboxService = {
      createSandboxSession: vi.fn().mockResolvedValue({
        id: '019577a0-0000-7000-8000-sandbox00001',
        status: 'creating',
      }),
      getSandboxSession: vi.fn().mockResolvedValue(null),
      destroySandbox: vi.fn().mockResolvedValue(undefined),
    };
    mockCheckpointService = {
      saveCheckpoint: vi.fn().mockResolvedValue(undefined),
    };
    mockEventBridge = {
      emitInterventionResolved: vi.fn(),
      emitToolPermissionResolved: vi.fn(),
    };
    mockInterventionPolicyService = {
      resolvePolicy: vi.fn().mockResolvedValue({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 86400,
        timeoutAction: 'reject',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        source: 'system_default',
      }),
    };
    mockSmartRoutingService = {
      recordDecision: vi.fn().mockResolvedValue('routing-decision-1'),
      getHistoricalMetrics: vi.fn().mockResolvedValue({}),
    };
    mockRouterRegistry = {
      get: vi.fn().mockReturnValue({
        requiresEmbedding: false,
        route: vi.fn().mockResolvedValue({
          selectedModelId: 'model-1',
          scores: [],
          reasoning: 'mock smart routing decision',
          routerType: 'fallback_chain',
          latencyMs: 0,
        }),
      }),
    };
    mockHealthMonitorService = {
      filterHealthyCandidates: vi.fn(
        async (_tenantId, candidates) => candidates,
      ),
    };
    mockEmbeddingService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
    mockRbacCacheService = {
      getUserRole: vi.fn().mockResolvedValue('owner'),
    };
    mockPluginService = {
      findActiveByPluginId: vi.fn().mockResolvedValue({
        id: 'plugin-record-001',
        pluginId: 'com.example.review',
        status: 'active',
      }),
    };
    mockWorkflowAgentAdapterFactory = {
      createFromAgentDefinition: vi.fn(),
    };
    mockSharedResourceRegistry = {
      createResource: vi.fn().mockResolvedValue({
        sessionId: '019577a0-0000-7000-8000-memory000001',
        session: {
          id: '019577a0-0000-7000-8000-memory000001',
          status: 'active',
        },
        memoryInstanceId: '019577a0-0000-7000-8000-memoryinst001',
        tenantId: TENANT_ID,
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        NodeSchedulerService,
        { provide: DRIZZLE, useValue: db },
        { provide: DagResolverService, useValue: mockDagResolver },
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: getQueueToken(AGENT_TASK_QUEUE), useValue: mockQueue },
        {
          provide: getQueueToken(PLUGIN_EXECUTION_QUEUE),
          useValue: mockPluginQueue,
        },
        { provide: SandboxService, useValue: mockSandboxService },
        { provide: CheckpointService, useValue: mockCheckpointService },
        { provide: EventBridgeService, useValue: mockEventBridge },
        {
          provide: InterventionPolicyService,
          useValue: mockInterventionPolicyService,
        },
        { provide: SmartRoutingService, useValue: mockSmartRoutingService },
        { provide: RouterRegistry, useValue: mockRouterRegistry },
        {
          provide: HealthMonitorService,
          useValue: mockHealthMonitorService,
        },
        {
          provide: EmbeddingIntegrationService,
          useValue: mockEmbeddingService,
        },
        { provide: RbacCacheService, useValue: mockRbacCacheService },
        { provide: PluginService, useValue: mockPluginService },
        {
          provide: AgentAdapterFactory,
          useValue: mockWorkflowAgentAdapterFactory,
        },
        {
          provide: SharedResourceRegistry,
          useValue: mockSharedResourceRegistry,
        },
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
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          nodeData: { agentId: 'agent-a' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          nodeData: { agentId: 'agent-b' },
        }),
        makeStep({ id: 'step-c', nodeId: 'C' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain(steps));
      db.update.mockReturnValue(createUpdateChainVoid());
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['A', 'B'], ['C']],
          new Map([
            ['A', ['C']],
            ['B', ['C']],
            ['C', []],
          ]),
          new Map([
            ['A', 0],
            ['B', 0],
            ['C', 2],
          ]),
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
      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-a',
          tenantId: TENANT_ID,
          input: {},
          nodeData: { agentId: 'agent-a' },
        },
        undefined,
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-b',
          tenantId: TENANT_ID,
          input: {},
          nodeData: { agentId: 'agent-b' },
        },
        undefined,
      );
    });

    it('空图时直接更新 execution 状态', async () => {
      const snapshot = makeSnapshot([], []);

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
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

  describe('scheduleNode', () => {
    it('agent 节点会保存 input 后进入队列，并携带 nodeData', async () => {
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

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'queued',
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-b',
          tenantId: TENANT_ID,
          input: { A: { answer: 'hello' } },
          nodeData: { agentId: 'agent-b' },
        },
        undefined,
      );
    });

    it('data_transform 节点会直接内联执行，不进入 queued', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B', 'data_transform')],
        [makeEdge('A', 'B')],
      );
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
        [
          makeNode('S', 'sandbox', {
            config: {
              cpu: 2,
              memory: 1024,
              disk: 5,
              timeout: 4,
              persistencePath: 'outputs/review',
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'pending',
          nodeType: 'sandbox',
          nodeData: {
            config: {
              cpu: 2,
              memory: 1024,
              disk: 5,
              timeout: 4,
              persistencePath: 'outputs/review',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'S', TENANT_ID, snapshot, steps);

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        sandboxNodeId: 'S',
        config: {
          cpu: 2,
          memory: 1024,
          disk: 5,
          timeout: 4,
          persistencePath: 'outputs/review',
        },
        tenantId: TENANT_ID,
      });
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
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-s',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('memory 节点会通过 SharedResourceRegistry 创建 memory session 并自动完成', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('M', 'memory', {
            config: {
              memoryInstanceId: '019577a0-0000-7000-8000-memoryinst001',
              role: 'readonly',
              bootUris: ['system://boot', 'system://index'],
              fusionPriority: 3,
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'pending',
          nodeType: 'memory',
          nodeData: {
            config: {
              memoryInstanceId: '019577a0-0000-7000-8000-memoryinst001',
              role: 'readonly',
              bootUris: ['system://boot', 'system://index'],
              fusionPriority: 3,
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'M', TENANT_ID, snapshot, steps);

      expect(mockSharedResourceRegistry.createResource).toHaveBeenCalledWith(
        'memory',
        {
          memoryInstanceId: '019577a0-0000-7000-8000-memoryinst001',
          role: 'readonly',
          bootUris: ['system://boot', 'system://index'],
          fusionPriority: 3,
          tenantId: TENANT_ID,
          executionId: EXECUTION_ID,
        },
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'completed',
        {
          result: {
            sessionId: '019577a0-0000-7000-8000-memory000001',
            instanceId: '019577a0-0000-7000-8000-memoryinst001',
            role: 'readonly',
            status: 'active',
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-m',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('memory 节点创建 session 失败时应标记 failed 并触发 onNodeFailed', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('M', 'memory', {
            config: {
              memoryInstanceId: '019577a0-0000-7000-8000-memoryinst404',
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'pending',
          nodeType: 'memory',
          nodeData: {
            config: {
              memoryInstanceId: '019577a0-0000-7000-8000-memoryinst404',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      mockSharedResourceRegistry.createResource.mockRejectedValueOnce(
        new Error('Memory instance not found'),
      );
      const onNodeFailed = vi
        .spyOn(service, 'onNodeFailed')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'M', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            message: 'Memory instance not found',
            nodeId: 'M',
          }),
        }),
      );
      expect(onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-m',
        TENANT_ID,
      );
    });

    it('sandbox 节点对历史扁平 nodeData 仍保持兼容', async () => {
      const snapshot = makeSnapshot([makeNode('S', 'sandbox', { cpu: 3 })], []);
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'pending',
          nodeType: 'sandbox',
          nodeData: { cpu: 3, memory: 2048, disk: 8, timeout: 6 },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'S', TENANT_ID, snapshot, steps);

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        sandboxNodeId: 'S',
        config: { cpu: 3, memory: 2048, disk: 8, timeout: 6 },
        tenantId: TENANT_ID,
      });
    });

    it('sandbox 节点应兼容 Agent globalSandboxConfig.sandboxConfig', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('S', 'sandbox', {
            globalSandboxConfig: {
              sandboxConfig: {
                cpu: 4,
                memory: 4096,
                disk: 16,
                timeout: 8,
              },
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'pending',
          nodeType: 'sandbox',
          nodeData: {
            globalSandboxConfig: {
              sandboxConfig: {
                cpu: 4,
                memory: 4096,
                disk: 16,
                timeout: 8,
              },
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'S', TENANT_ID, snapshot, steps);

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        sandboxNodeId: 'S',
        config: { cpu: 4, memory: 4096, disk: 16, timeout: 8 },
        tenantId: TENANT_ID,
      });
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

      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-a',
          tenantId: TENANT_ID,
          input: { S: { sessionId: 'sandbox-session-001', status: 'ready' } },
          nodeData: { agentId: 'agent-1' },
          hasSandbox: true,
        },
        undefined,
      );
    });

    it('plugin 节点会校验插件激活态��投递到 plugin queue', async () => {
      const snapshot = makeSnapshot([makeNode('P', 'plugin')], []);
      const steps = [
        makeStep({
          id: 'step-p',
          nodeId: 'P',
          status: 'pending',
          nodeType: 'plugin',
          nodeData: {
            pluginId: 'com.example.review',
            pluginNodeType: 'review-analyzer',
            orgId: 'org-001',
            pluginConfig: { mode: 'safe' },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'P', TENANT_ID, snapshot, steps);

      expect(mockPluginService.findActiveByPluginId).toHaveBeenCalledWith(
        'com.example.review',
        'org-001',
        TENANT_ID,
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-p',
        'queued',
      );
      expect(mockPluginQueue.add).toHaveBeenCalledWith('execute-plugin-node', {
        tenantId: TENANT_ID,
        executionId: EXECUTION_ID,
        stepId: 'step-p',
        pluginId: 'com.example.review',
        nodeType: 'review-analyzer',
        inputs: {},
        config: { mode: 'safe' },
      });
      expect(mockQueue.add).not.toHaveBeenCalled();
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

      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-b',
          tenantId: TENANT_ID,
          input: { A: { answer: 'hello' } },
          nodeData: { agentId: 'agent-b' },
        },
        undefined,
      );
    });

    it('带 agentDefinitionId 的 agent 节点会内联执行工作流 agent adapter，并复用上游 sandbox', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('S', 'sandbox', {
            config: { cpu: 4, memory: 2048, disk: 8, timeout: 6 },
          }),
          makeNode('A', 'agent', {
            agentDefinitionId: 'agent-def-1',
            agentVersionId: 'agent-version-1',
          }),
        ],
        [makeEdge('S', 'A')],
      );
      const steps = [
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'completed',
          nodeType: 'sandbox',
          nodeData: {
            config: { cpu: 4, memory: 2048, disk: 8, timeout: 6 },
          },
          result: { sessionId: 'sandbox-session-001', status: 'ready' },
        }),
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {
            agentDefinitionId: 'agent-def-1',
            agentVersionId: 'agent-version-1',
          },
        }),
      ];
      const workflowAgentAdapter = {
        execute: vi
          .fn()
          .mockResolvedValue({ content: 'workflow-agent-output' }),
      };
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      mockWorkflowAgentAdapterFactory.createFromAgentDefinition.mockReturnValue(
        workflowAgentAdapter,
      );

      await service.scheduleNode(EXECUTION_ID, 'A', TENANT_ID, snapshot, steps);

      expect(
        mockWorkflowAgentAdapterFactory.createFromAgentDefinition,
      ).toHaveBeenCalledWith('agent-def-1', {
        cpu: 4,
        memory: 2048,
        disk: 8,
        timeout: 6,
      });
      expect(workflowAgentAdapter.execute).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        step: steps[1],
        input: { S: { sessionId: 'sandbox-session-001', status: 'ready' } },
        tenantId: TENANT_ID,
        sandboxBinding: { executionId: EXECUTION_ID },
        agentVersionId: 'agent-version-1',
      });
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'completed',
        { result: { content: 'workflow-agent-output' } },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-a',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('smart-routing 节点会默认使用 FALLBACK_CHAIN，并产出完整运行时 metadata', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('A', 'llm-model'),
          makeNode('B', 'llm-model'),
          makeNode('R', 'smart-routing'),
        ],
        [
          makeEdge('A', 'R', undefined, 'primary'),
          makeEdge('B', 'R', undefined, 'secondary'),
        ],
      );
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          result: { llmModelConfigId: 'model-1' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          status: 'completed',
          result: { llmModelConfigId: 'model-2' },
        }),
        makeStep({
          id: 'step-r',
          nodeId: 'R',
          status: 'pending',
          nodeType: 'smart-routing',
          nodeData: {},
        }),
      ];
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);
      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const route = vi.fn().mockResolvedValue({
        selectedModelId: 'model-2',
        scores: [
          {
            modelId: 'model-2',
            modelName: 'claude-sonnet-4-20250514',
            provider: 'anthropic',
            score: 100,
            reasoning: 'fallback #1',
          },
          {
            modelId: 'model-1',
            modelName: 'gpt-4o',
            provider: 'openai',
            score: 90,
            reasoning: 'fallback #2',
          },
        ],
        reasoning: 'mock smart routing decision',
        routerType: 'fallback_chain',
        latencyMs: 7,
      });
      mockRouterRegistry.get.mockReturnValueOnce({
        requiresEmbedding: true,
        route,
      });
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            {
              id: 'model-1',
              name: 'gpt-4o',
              provider: 'openai',
              modelName: 'gpt-4o',
            },
            {
              id: 'model-2',
              name: 'claude-sonnet-4-20250514',
              provider: 'anthropic',
              modelName: 'claude-sonnet-4-20250514',
            },
          ]),
        )
        .mockReturnValueOnce(
          createSelectChain([
            {
              modelConfigId: 'model-1',
              providerName: 'openai',
              routingMeta: {
                contextWindow: 128000,
                costs: { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 },
                qualityRank: 88,
                avgLatencyMs: 600,
                maxInputTokens: 128000,
              },
              eloRating: 1200,
            },
            {
              modelConfigId: 'model-2',
              providerName: 'anthropic',
              routingMeta: {
                contextWindow: 200000,
                costs: { inputPer1kTokens: 0.02, outputPer1kTokens: 0.04 },
                qualityRank: 92,
                avgLatencyMs: 900,
                maxInputTokens: 200000,
              },
              eloRating: 1300,
            },
          ]),
        );

      await service.scheduleNode(EXECUTION_ID, 'R', TENANT_ID, snapshot, steps);

      expect(mockRouterRegistry.get).toHaveBeenCalledWith('fallback_chain');
      expect(
        mockHealthMonitorService.filterHealthyCandidates,
      ).toHaveBeenCalledWith(
        TENANT_ID,
        expect.arrayContaining([
          expect.objectContaining({ modelConfigId: 'model-1' }),
          expect.objectContaining({ modelConfigId: 'model-2' }),
        ]),
      );
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.any(String),
        TENANT_ID,
      );
      expect(route).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ modelConfigId: 'model-1' }),
          expect.objectContaining({ modelConfigId: 'model-2' }),
        ]),
        expect.objectContaining({
          inputTokenCount: expect.any(Number),
          tenantId: TENANT_ID,
        }),
      );
      expect(mockSmartRoutingService.recordDecision).toHaveBeenCalledWith(
        'step-r',
        TENANT_ID,
        'R',
        expect.objectContaining({
          selectedModelId: 'model-2',
          strategy: 'fallback_chain',
          routerType: 'fallback_chain',
        }),
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-r',
        'completed',
        {
          result: expect.objectContaining({
            selectedModelId: 'model-2',
            llmModelConfigId: 'model-2',
            routingStepId: 'step-r',
            routingNodeId: 'R',
            candidateModelIds: ['model-2', 'model-1'],
            currentModelIndex: 0,
            routerType: 'fallback_chain',
            routingDecisionId: 'routing-decision-1',
            tokenThreshold: 4096,
            inputTokenCount: expect.any(Number),
          }),
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-r',
        TENANT_ID,
      );
    });

    it('HISTORICAL_BEST 会在调度前注入近 30 天历史指标', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A', 'llm-model'), makeNode('R', 'smart-routing')],
        [makeEdge('A', 'R', undefined, 'primary')],
      );
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          result: { llmModelConfigId: 'model-1' },
        }),
        makeStep({
          id: 'step-r',
          nodeId: 'R',
          status: 'pending',
          nodeType: 'smart-routing',
          nodeData: {
            strategy: 'HISTORICAL_BEST',
            modelConfigIds: ['model-1', 'model-2'],
            tokenThreshold: 8192,
          },
        }),
      ];
      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);
      const route = vi.fn().mockResolvedValue({
        selectedModelId: 'model-1',
        scores: [
          {
            modelId: 'model-1',
            modelName: 'gpt-4o',
            provider: 'openai',
            score: 99,
            reasoning: 'historical best',
          },
        ],
        reasoning: 'historical best',
        routerType: 'historical_best',
        latencyMs: 5,
      });
      mockRouterRegistry.get.mockReturnValueOnce({
        requiresEmbedding: false,
        route,
      });
      db.select
        .mockReturnValueOnce(
          createSelectChain([
            {
              id: 'model-1',
              name: 'gpt-4o',
              provider: 'openai',
              modelName: 'gpt-4o',
            },
            {
              id: 'model-2',
              name: 'claude-sonnet-4-20250514',
              provider: 'anthropic',
              modelName: 'claude-sonnet-4-20250514',
            },
          ]),
        )
        .mockReturnValueOnce(createSelectChain([]));
      mockSmartRoutingService.getHistoricalMetrics.mockResolvedValueOnce({
        'model-1': {
          successRate: 0.9,
          avgLatencyMs: 120,
          avgTokenUsage: 0,
          lastUsedAt: '2024-12-31T00:00:00.000Z',
        },
      });

      await service.scheduleNode(EXECUTION_ID, 'R', TENANT_ID, snapshot, steps);

      expect(mockSmartRoutingService.getHistoricalMetrics).toHaveBeenCalledWith(
        TENANT_ID,
        'R',
      );
      expect(mockRouterRegistry.get).toHaveBeenCalledWith('historical_best');
      expect(route).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          historicalMetrics: {
            'model-1': {
              successRate: 0.9,
              avgLatencyMs: 120,
              avgTokenUsage: 0,
              lastUsedAt: '2024-12-31T00:00:00.000Z',
            },
          },
          tenantId: TENANT_ID,
        }),
      );
    });

    it('agent 节点会继承 smart-routing 输出的 llmModelConfigId，并在 FALLBACK_CHAIN 下强制 attempts=1', async () => {
      const routingResult = {
        selectedModelId: 'model-2',
        llmModelConfigId: 'model-2',
        strategy: 'FALLBACK_CHAIN',
        reasoning: 'mock smart routing decision',
        evaluatedModels: [],
        latencyMs: 7,
        routerType: 'fallback_chain',
        routingDecisionId: 'routing-decision-1',
        routingStepId: 'step-r',
        routingNodeId: 'R',
        candidateModelIds: ['model-2', 'model-1'],
        currentModelIndex: 0,
        inputTokenCount: 42,
        tokenThreshold: 4096,
      };
      const snapshot = makeSnapshot(
        [makeNode('R', 'smart-routing'), makeNode('A', 'agent')],
        [makeEdge('R', 'A')],
      );
      const steps = [
        makeStep({
          id: 'step-r',
          nodeId: 'R',
          status: 'completed',
          nodeType: 'smart-routing',
          result: routingResult,
        }),
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'pending',
          nodeType: 'agent',
          nodeData: { agentId: 'agent-a' },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'A', TENANT_ID, snapshot, steps);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          executionId: EXECUTION_ID,
          stepId: 'step-a',
          tenantId: TENANT_ID,
          input: {
            R: expect.objectContaining({
              selectedModelId: 'model-2',
              routingStepId: 'step-r',
              routingNodeId: 'R',
              candidateModelIds: ['model-2', 'model-1'],
              currentModelIndex: 0,
              strategy: 'FALLBACK_CHAIN',
            }),
          },
          nodeData: { agentId: 'agent-a', llmModelConfigId: 'model-2' },
          smartRouting: expect.objectContaining({
            routingStepId: 'step-r',
            routingNodeId: 'R',
            strategy: 'FALLBACK_CHAIN',
            candidateModelIds: ['model-2', 'model-1'],
            currentModelIndex: 0,
            selectedModelId: 'model-2',
          }),
        }),
        { attempts: 1 },
      );
    });

    it('should mark step as failed with typeMismatch when port types are incompatible', async () => {
      const nodeA = makeNode('A', 'agent', {
        portMappingMetadata: {
          outputs: [{ name: 'out-1', dataType: 'text' }],
        },
      });
      const nodeB = makeNode('B', 'agent', {
        portMappingMetadata: {
          inputs: [{ name: 'in-1', dataType: 'image' }],
        },
      });
      const snapshot = makeSnapshot(
        [nodeA, nodeB],
        [makeEdge('A', 'B', 'out-1', 'in-1')],
      );
      const stepA = makeStep({
        id: 'step-a',
        nodeId: 'A',
        status: 'completed',
        result: { answer: 42 },
      });
      const stepB = makeStep({
        id: 'step-b',
        nodeId: 'B',
        status: 'pending',
        nodeType: 'agent',
      });

      vi.spyOn(service as any, 'onNodeFailed').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'B', TENANT_ID, snapshot, [
        stepA,
        stepB,
      ]);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-b',
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            type: 'https://agentloom.dev/errors/node-type-mismatch',
            typeMismatch: expect.objectContaining({
              sourceType: 'text',
              targetType: 'image',
              sourceNodeId: 'A',
              targetNodeId: 'B',
            }),
            nodeId: 'B',
          }),
        }),
      );
      expect(service['onNodeFailed']).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-b',
        TENANT_ID,
      );
    });

    it('mcp-tool 节点会同步完成并产出工具描述符，不入队 agent-task', async () => {
      const snapshot = makeSnapshot([makeNode('M', 'mcp-tool')], []);
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'pending',
          nodeType: 'mcp-tool',
          nodeData: {
            mcpServerConfigId: 'mcp-server-001',
            toolName: 'get_weather',
            portMapping: { input: 'tool-in-0', output: 'tool-out-0' },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'M', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'completed',
        {
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: 'mcp-server-001',
            toolName: 'get_weather',
            portMapping: { input: 'tool-in-0', output: 'tool-out-0' },
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-m',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('mcp-tool 节点缺少 mcpServerConfigId 或 toolName 时应降级完成并带 warning', async () => {
      const snapshot = makeSnapshot([makeNode('M', 'mcp-tool')], []);
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'pending',
          nodeType: 'mcp-tool',
          nodeData: { toolName: 'get_weather' },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'M', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-m',
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            warning: expect.any(String),
            type: 'mcp-tool',
          }),
        }),
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-m',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onNodeCompleted', () => {
    it('execution 已失败时直接返回，不再调度后继', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B')],
      );
      const completedStep = makeStep({
        id: 'step-a',
        nodeId: 'A',
        status: 'completed',
        result: { ok: true },
      });
      const steps = [
        completedStep,
        makeStep({ id: 'step-b', nodeId: 'B', status: 'pending' }),
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([completedStep]))
        .mockReturnValueOnce(
          createSelectChain([makeExecution(snapshot, 'failed')]),
        )
        .mockReturnValueOnce(createSelectChain(steps));

      await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).not.toHaveBeenCalled();
      expect(mockDagResolver.resolveDag).not.toHaveBeenCalled();
    });
  });

  describe('resumeScheduling', () => {
    it('应只调度可继续执行的 pending 节点，并跳过 completed 节点', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B'), makeNode('C')],
        [makeEdge('A', 'B'), makeEdge('B', 'C')],
      );
      const execution = makeExecution(snapshot);
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
        }),
        makeStep({
          id: 'step-c',
          nodeId: 'C',
          status: 'pending',
        }),
      ];
      const plan = makePlan(
        [['A'], ['B'], ['C']],
        new Map([
          ['A', ['B']],
          ['B', ['C']],
          ['C', []],
        ]),
        new Map([
          ['A', 0],
          ['B', 1],
          ['C', 1],
        ]),
      );

      db.select
        .mockReturnValueOnce(createSelectChain([execution]))
        .mockReturnValueOnce(createSelectChain(steps));
      mockDagResolver.resolveDag.mockReturnValue(plan);
      const scheduleNode = vi
        .spyOn(service, 'scheduleNode')
        .mockResolvedValue(undefined);

      await service.resumeScheduling(EXECUTION_ID, TENANT_ID);

      expect(scheduleNode).toHaveBeenCalledTimes(1);
      expect(scheduleNode).toHaveBeenCalledWith(
        EXECUTION_ID,
        'B',
        TENANT_ID,
        snapshot,
        steps,
      );
    });
  });

  describe('cleanupSandboxIfTerminal', () => {
    it('execution 为 completed 时应触发 destroySandbox', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ status: 'completed' }]),
      );

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

    it('execution 为 cancelled 时也应触发 destroySandbox', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([{ status: 'cancelled' }]),
      );

      await service.cleanupSandboxIfTerminal(EXECUTION_ID, TENANT_ID);

      expect(mockSandboxService.destroySandbox).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
    });

    it('destroySandbox 异常时应 warn 而非抛出', async () => {
      db.select.mockReturnValueOnce(createSelectChain([{ status: 'failed' }]));
      mockSandboxService.destroySandbox.mockRejectedValueOnce(
        new Error('container not found'),
      );

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
          expression:
            '({ summary: input.A.answer.toUpperCase(), length: input.A.answer.length })',
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
      const requestedAt = '2024-12-31T23:59:00.000Z';
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        input: { upstream: { draft: '初稿' } },
        nodeData: { agentId: 'agent-001', autonomyMode: 'LLM_SUGGEST' },
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '之前的内容',
          stopReason: 'intervention_required',
          interventionRequestedAt: requestedAt,
          interventionNodeName: '人工审核节点',
        },
      });
      const resolution: InterventionResolution = {
        action: 'modify',
        modifiedContent: '人工修订后的内容',
        feedback: '请按这个版本提交',
      };

      db.select
        .mockReturnValueOnce(createSelectChain([step]))
        .mockReturnValueOnce(
          createSelectChain([{ workflowDefinitionId: 'workflow-001' }]),
        );

      await service.resolveIntervention(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        USER_ID,
        resolution,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'running',
        {
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '之前的内容',
            stopReason: 'intervention_required',
            interventionRequestedAt: requestedAt,
            interventionNodeName: '人工审核节点',
            intervention: {
              requested_at: requestedAt,
              resolved_at: NOW.toISOString(),
              action: 'modify',
              instruction: '人工修订后的内容',
              resolved_by_user_id: USER_ID,
            },
          },
        },
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockInterventionPolicyService.resolvePolicy).toHaveBeenCalledWith(
        TENANT_ID,
        'workflow-001',
        step.nodeId,
      );
      expect(mockRbacCacheService.getUserRole).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );

      expect(mockEventBridge.emitInterventionResolved).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: STEP_ID,
          nodeId: step.nodeId,
          action: 'modify',
          feedback: '请按这个版本提交',
          modifiedContent: '人工修订后的内容',
          resolvedBy: USER_ID,
          resolvedAt: NOW.toISOString(),
        },
      );
      expect(mockQueue.getJob).toHaveBeenCalledWith(
        `intervention-timeout:${STEP_ID}`,
      );
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        input: { upstream: { draft: '初稿' } },
        nodeData: { agentId: 'agent-001', autonomyMode: 'LLM_SUGGEST' },
        resumeSessionId: SESSION_ID,
        intervention: {
          ...resolution,
          requestedAt,
          resolvedAt: NOW.toISOString(),
          resolvedByUserId: USER_ID,
          nodeName: '人工审核节点',
        },
      });
    });

    it('抢占失败时抛出 InterventionNotAllowedException，避免重复解决', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          interventionRequestedAt: '2024-12-31T23:59:00.000Z',
        },
      });

      db.select
        .mockReturnValueOnce(createSelectChain([step]))
        .mockReturnValueOnce(
          createSelectChain([{ workflowDefinitionId: 'workflow-001' }]),
        )
        .mockReturnValueOnce(createSelectChain([{ status: 'running' }]));
      mockStateMachine.updateStepStatus.mockRejectedValueOnce(
        new InvalidStepTransitionException('waiting_intervention', 'running'),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, USER_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(InterventionNotAllowedException);

      expect(mockEventBridge.emitInterventionResolved).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('状态非法时抛出 InterventionNotAllowedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([makeStep({ id: STEP_ID, status: 'running' })]),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, USER_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(InterventionNotAllowedException);
    });

    it('检查点缺少 sessionId 时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          makeStep({
            id: STEP_ID,
            status: 'waiting_intervention',
            checkpointData: {},
          }),
        ]),
      );

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, USER_ID, {
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
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, USER_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(AgentExecutionException);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('角色不在策略允许列表时抛出 InterventionPermissionDeniedException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          interventionRequestedAt: '2024-12-31T23:59:00.000Z',
        },
      });
      db.select
        .mockReturnValueOnce(createSelectChain([step]))
        .mockReturnValueOnce(
          createSelectChain([{ workflowDefinitionId: 'workflow-001' }]),
        );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 600,
        timeoutAction: 'reject',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        source: 'workflow',
      });
      mockRbacCacheService.getUserRole.mockResolvedValueOnce('operator');

      await expect(
        service.resolveIntervention(EXECUTION_ID, STEP_ID, TENANT_ID, USER_ID, {
          action: 'approve',
        }),
      ).rejects.toThrow(InterventionPermissionDeniedException);

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('system_timeout 路径应绕过人工角色校验', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          interventionRequestedAt: '2024-12-31T23:59:00.000Z',
        },
      });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await service.resolveIntervention(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
        {
          action: 'reject',
          feedback: '干预超时，系统自动拒绝',
          timeout: true,
        },
      );

      expect(mockRbacCacheService.getUserRole).not.toHaveBeenCalled();
      expect(
        mockInterventionPolicyService.resolvePolicy,
      ).not.toHaveBeenCalled();
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'running',
        expect.objectContaining({
          checkpointData: expect.objectContaining({
            intervention: expect.objectContaining({
              timeout: true,
              resolved_by_user_id: SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
            }),
          }),
        }),
      );
    });
  });

  describe('resolveToolPermission', () => {
    const STEP_ID = '0195a1c0-0000-7000-8000-000000000010';
    const TOOL_CALL_ID = '0195a1c0-0000-7000-8000-000000000011';
    const SESSION_ID = 'session-tool-permission-001';

    it('approve：会校验 waiting_intervention，并把 toolPermission 入队', async () => {
      const checkpoint = {
        sessionId: SESSION_ID,
        toolCalls: [
          {
            id: TOOL_CALL_ID,
            status: 'awaiting_permission',
          },
        ],
      };
      const step = makeStep({
        id: STEP_ID,
        status: 'running',
        input: { upstream: { draft: 'hello' } },
        nodeData: { agentId: 'agent-001' },
        checkpointData: checkpoint,
      });
      const resolution: ToolPermissionResolution = {
        toolCallId: TOOL_CALL_ID,
        action: 'approve',
      };

      db.select.mockReturnValueOnce(createSelectChain([step]));

      await service.resolveToolPermission(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        TENANT_ID,
        resolution,
      );

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).not.toHaveBeenCalled();
      expect(mockEventBridge.emitToolPermissionResolved).not.toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        input: { upstream: { draft: 'hello' } },
        nodeData: { agentId: 'agent-001' },
        resumeSessionId: SESSION_ID,
        toolPermission: resolution,
      });
    });

    it('deny：会校验 running，并把 toolPermission 入队', async () => {
      const checkpoint = {
        sessionId: SESSION_ID,
        toolCalls: [
          {
            id: TOOL_CALL_ID,
            status: 'awaiting_permission',
          },
        ],
      };
      const step = makeStep({
        id: STEP_ID,
        status: 'running',
        checkpointData: checkpoint,
      });
      const resolution: ToolPermissionResolution = {
        toolCallId: TOOL_CALL_ID,
        action: 'deny',
      };

      db.select.mockReturnValueOnce(createSelectChain([step]));

      await service.resolveToolPermission(
        EXECUTION_ID,
        STEP_ID,
        TOOL_CALL_ID,
        TENANT_ID,
        resolution,
      );

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).not.toHaveBeenCalled();
      expect(mockEventBridge.emitToolPermissionResolved).not.toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('agent-task', {
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        input: {},
        nodeData: {},
        resumeSessionId: SESSION_ID,
        toolPermission: resolution,
      });
    });

    it('步骤不存在时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValueOnce(createSelectChain([]));

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(AgentExecutionException);
    });

    it('step 不属于 execution 时抛出 AgentExecutionException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          makeStep({
            id: STEP_ID,
            executionId: '0195a1c0-0000-7000-8000-000000009999',
            status: 'running',
            checkpointData: { sessionId: SESSION_ID },
          }),
        ]),
      );

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(AgentExecutionException);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockEventBridge.emitToolPermissionResolved).not.toHaveBeenCalled();
    });

    it('步骤不在 running 时抛出 ToolPermissionResolutionNotAllowedException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          makeStep({ id: STEP_ID, status: 'waiting_intervention' }),
        ]),
      );

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(ToolPermissionResolutionNotAllowedException);
    });

    it('检查点找不到 tool call 时抛出 ToolCallNotFoundException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'running',
        checkpointData: {
          sessionId: SESSION_ID,
          toolCalls: [],
        },
      });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(ToolCallNotFoundException);
    });

    it('tool call 不在 awaiting_permission 时抛出 ToolPermissionResolutionNotAllowedException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'running',
        checkpointData: {
          sessionId: SESSION_ID,
          toolCalls: [
            {
              id: TOOL_CALL_ID,
              status: 'completed',
            },
          ],
        },
      });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(ToolPermissionResolutionNotAllowedException);
    });

    it('检查点缺少 sessionId 时抛出 AgentExecutionException', async () => {
      const step = makeStep({
        id: STEP_ID,
        status: 'running',
        checkpointData: {
          toolCalls: [
            {
              id: TOOL_CALL_ID,
              status: 'awaiting_permission',
            },
          ],
        },
      });
      db.select.mockReturnValueOnce(createSelectChain([step]));

      await expect(
        service.resolveToolPermission(
          EXECUTION_ID,
          STEP_ID,
          TOOL_CALL_ID,
          TENANT_ID,
          {
            toolCallId: TOOL_CALL_ID,
            action: 'approve',
          },
        ),
      ).rejects.toThrow(AgentExecutionException);
    });
  });

  describe('enqueueInterventionTimeout', () => {
    it('应使用 resolved policy 的 timeoutSeconds 计算延迟并入队', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          {
            nodeId: 'node-x',
            workflowDefinitionId: 'workflow-timeout-001',
          },
        ]),
      );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner'],
        timeoutSeconds: 900,
        timeoutAction: 'escalate',
        escalateToRole: 'admin',
        notifyChannels: ['in_app', 'push'],
        source: 'node',
      });

      await service.enqueueInterventionTimeout(
        EXECUTION_ID,
        'step-x',
        TENANT_ID,
      );

      expect(mockInterventionPolicyService.resolvePolicy).toHaveBeenCalledWith(
        TENANT_ID,
        'workflow-timeout-001',
        'node-x',
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'intervention-timeout',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-x',
          tenantId: TENANT_ID,
        },
        expect.objectContaining({
          delay: 900 * 1000,
          jobId: 'intervention-timeout:step-x',
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        }),
      );
    });

    it('升级超时时应使用包含 escalationCount 的唯一 jobId', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([
          {
            nodeId: 'node-x',
            workflowDefinitionId: 'workflow-timeout-001',
          },
        ]),
      );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner'],
        timeoutSeconds: 900,
        timeoutAction: 'escalate',
        escalateToRole: 'admin',
        notifyChannels: ['in_app', 'push'],
        source: 'node',
      });

      await service.enqueueInterventionTimeout(
        EXECUTION_ID,
        'step-x',
        TENANT_ID,
        {
          escalated: true,
          escalationCount: 2,
        },
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'intervention-timeout',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-x',
          tenantId: TENANT_ID,
          escalationCount: 2,
        },
        expect.objectContaining({
          jobId: 'intervention-timeout:step-x:escalated:2',
        }),
      );
    });
  });

  describe('removeInterventionTimeout (via resolveIntervention)', () => {
    it('存在普通与全部升级超时任务时应一并移除', async () => {
      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      const escalatedJobs = Array.from(
        { length: MAX_ESCALATION_ATTEMPTS },
        () => ({
          remove: vi.fn().mockResolvedValue(undefined),
        }),
      );
      mockQueue.getJob.mockResolvedValueOnce(mockJob);
      for (const escalatedJob of escalatedJobs) {
        mockQueue.getJob.mockResolvedValueOnce(escalatedJob);
      }

      const step = makeStep({
        id: '019391d4-0000-7000-0000-000000000099',
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: 'session-abc-123',
          interventionRequestedAt: '2025-01-01T00:00:00.000Z',
        },
      });
      db.select
        .mockReturnValueOnce(createSelectChain([step]))
        .mockReturnValueOnce(
          createSelectChain([{ workflowDefinitionId: 'workflow-001' }]),
        );

      await service.resolveIntervention(
        EXECUTION_ID,
        '019391d4-0000-7000-0000-000000000099',
        TENANT_ID,
        USER_ID,
        {
          action: 'approve',
        },
      );

      expect(mockQueue.getJob).toHaveBeenCalledWith(
        'intervention-timeout:019391d4-0000-7000-0000-000000000099',
      );
      for (
        let escalationCount = 1;
        escalationCount <= MAX_ESCALATION_ATTEMPTS;
        escalationCount += 1
      ) {
        expect(mockQueue.getJob).toHaveBeenCalledWith(
          `intervention-timeout:019391d4-0000-7000-0000-000000000099:escalated:${escalationCount}`,
        );
      }
      expect(mockJob.remove).toHaveBeenCalled();
      for (const escalatedJob of escalatedJobs) {
        expect(escalatedJob.remove).toHaveBeenCalled();
      }
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

  describe('MCP server injection', () => {
    const MCP_CONFIG_ID_1 = '019577a0-0000-7000-8000-mcp000000001';
    const MCP_CONFIG_ID_2 = '019577a0-0000-7000-8000-mcp000000002';

    const mockMcpConnection1 = {
      transportType: 'sse' as const,
      url: 'https://mcp-server-1.example.com/sse',
      headers: { Authorization: 'Bearer token1' },
    };
    const mockMcpConnection2 = {
      transportType: 'stdio' as const,
      command: '/usr/bin/mcp-server',
      args: ['--port', '3000'],
    };

    let mcpService: NodeSchedulerService;
    let mcpDb: Record<string, ReturnType<typeof vi.fn>>;
    let mcpMockQueue: {
      add: ReturnType<typeof vi.fn>;
      getJob: ReturnType<typeof vi.fn>;
    };
    let mcpMockStateMachine: {
      updateStepStatus: ReturnType<typeof vi.fn>;
      updateExecutionStatus: ReturnType<typeof vi.fn>;
      broadcastAgentEvent: ReturnType<typeof vi.fn>;
      markExecutionFailed: ReturnType<typeof vi.fn>;
    };
    let mockMcpService: {
      resolveRuntimeConnection: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
      mcpDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        execute: vi.fn(),
      };
      mcpMockQueue = {
        add: vi.fn().mockResolvedValue(undefined),
        getJob: vi.fn().mockResolvedValue(null),
      };
      mcpMockStateMachine = {
        updateStepStatus: vi.fn().mockResolvedValue(undefined),
        updateExecutionStatus: vi.fn().mockResolvedValue(undefined),
        broadcastAgentEvent: vi.fn(),
        markExecutionFailed: vi.fn().mockResolvedValue(undefined),
      };
      mockMcpService = {
        resolveRuntimeConnection: vi.fn(),
      };

      const module = await Test.createTestingModule({
        providers: [
          NodeSchedulerService,
          { provide: DRIZZLE, useValue: mcpDb },
          { provide: DagResolverService, useValue: { resolveDag: vi.fn() } },
          { provide: StepStateMachineService, useValue: mcpMockStateMachine },
          { provide: getQueueToken(AGENT_TASK_QUEUE), useValue: mcpMockQueue },
          {
            provide: getQueueToken(PLUGIN_EXECUTION_QUEUE),
            useValue: { add: vi.fn(), getJob: vi.fn() },
          },
          {
            provide: SandboxService,
            useValue: {
              createSandboxSession: vi.fn(),
              getSandboxSession: vi.fn(),
              destroySandbox: vi.fn(),
            },
          },
          { provide: CheckpointService, useValue: { saveCheckpoint: vi.fn() } },
          {
            provide: EventBridgeService,
            useValue: {
              emitInterventionResolved: vi.fn(),
              emitToolPermissionResolved: vi.fn(),
            },
          },
          {
            provide: InterventionPolicyService,
            useValue: { resolvePolicy: vi.fn() },
          },
          {
            provide: SmartRoutingService,
            useValue: {
              recordDecision: vi.fn(),
              getHistoricalMetrics: vi.fn(),
            },
          },
          { provide: RouterRegistry, useValue: { get: vi.fn() } },
          {
            provide: HealthMonitorService,
            useValue: { filterHealthyCandidates: vi.fn() },
          },
          {
            provide: EmbeddingIntegrationService,
            useValue: { generateEmbedding: vi.fn() },
          },
          { provide: RbacCacheService, useValue: { getUserRole: vi.fn() } },
          {
            provide: PluginService,
            useValue: { findActiveByPluginId: vi.fn() },
          },
          {
            provide: AgentAdapterFactory,
            useValue: { createFromAgentDefinition: vi.fn() },
          },
          {
            provide: SharedResourceRegistry,
            useValue: { createResource: vi.fn() },
          },
          { provide: McpService, useValue: mockMcpService },
        ],
      }).compile();

      mcpService = module.get(NodeSchedulerService);
    });

    it('agent 节点的 input 包含 MCP tool 描述符时注入 mcpServers', async () => {
      mockMcpService.resolveRuntimeConnection.mockResolvedValue(
        mockMcpConnection1,
      );

      const snapshot = makeSnapshot(
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1')],
        [makeEdge('mcp-1', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'search',
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: { agentId: 'agent-001' },
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledWith(
        MCP_CONFIG_ID_1,
        TENANT_ID,
      );
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          workflowContext: {
            mcpServers: {
              [MCP_CONFIG_ID_1]: mockMcpConnection1,
            },
          },
        }),
        undefined,
      );
    });

    it('nested result 结构的 MCP 描述符也能正确提取', async () => {
      mockMcpService.resolveRuntimeConnection.mockResolvedValue(
        mockMcpConnection1,
      );

      const snapshot = makeSnapshot(
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1')],
        [makeEdge('mcp-1', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            result: {
              type: 'mcp-tool',
              mcpServerConfigId: MCP_CONFIG_ID_1,
              toolName: 'fetch',
            },
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {},
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledWith(
        MCP_CONFIG_ID_1,
        TENANT_ID,
      );
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          workflowContext: {
            mcpServers: {
              [MCP_CONFIG_ID_1]: mockMcpConnection1,
            },
          },
        }),
        undefined,
      );
    });

    it('多个 MCP 工具引用同一 configId 时去重', async () => {
      mockMcpService.resolveRuntimeConnection.mockResolvedValue(
        mockMcpConnection1,
      );

      const snapshot = makeSnapshot(
        [
          makeNode('mcp-1', 'mcp-tool'),
          makeNode('mcp-2', 'mcp-tool'),
          makeNode('agent-1'),
        ],
        [makeEdge('mcp-1', 'agent-1'), makeEdge('mcp-2', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp-1',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'search',
          },
        }),
        makeStep({
          id: 'step-mcp-2',
          nodeId: 'mcp-2',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'fetch',
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {},
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      // resolveRuntimeConnection 仅被调用一次（去重）
      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledTimes(1);
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          workflowContext: {
            mcpServers: {
              [MCP_CONFIG_ID_1]: mockMcpConnection1,
            },
          },
        }),
        undefined,
      );
    });

    it('多个不同 configId 的 MCP 工具都被解析', async () => {
      mockMcpService.resolveRuntimeConnection
        .mockResolvedValueOnce(mockMcpConnection1)
        .mockResolvedValueOnce(mockMcpConnection2);

      const snapshot = makeSnapshot(
        [
          makeNode('mcp-1', 'mcp-tool'),
          makeNode('mcp-2', 'mcp-tool'),
          makeNode('agent-1'),
        ],
        [makeEdge('mcp-1', 'agent-1'), makeEdge('mcp-2', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp-1',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'search',
          },
        }),
        makeStep({
          id: 'step-mcp-2',
          nodeId: 'mcp-2',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_2,
            toolName: 'exec',
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {},
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      expect(mockMcpService.resolveRuntimeConnection).toHaveBeenCalledTimes(2);
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          workflowContext: {
            mcpServers: {
              [MCP_CONFIG_ID_1]: mockMcpConnection1,
              [MCP_CONFIG_ID_2]: mockMcpConnection2,
            },
          },
        }),
        undefined,
      );
    });

    it('input 中没有 MCP 工具描述符时不注入 workflowContext', async () => {
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

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'B',
        TENANT_ID,
        snapshot,
        steps,
      );

      expect(mockMcpService.resolveRuntimeConnection).not.toHaveBeenCalled();
      const jobData = mcpMockQueue.add.mock.calls[0]?.[1];
      expect(jobData).not.toHaveProperty('workflowContext');
    });

    it('MCP 配置解析失败时优雅降级（跳过该服务器、记录警告）', async () => {
      mockMcpService.resolveRuntimeConnection.mockRejectedValue(
        new Error('MCP server config not found'),
      );

      const snapshot = makeSnapshot(
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1')],
        [makeEdge('mcp-1', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'search',
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {},
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      // 即使解析失败也不会阻止 agent 任务入队
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.not.objectContaining({ workflowContext: expect.anything() }),
        undefined,
      );
    });

    it('部分 MCP 配置解析失败时，成功的仍然注入', async () => {
      mockMcpService.resolveRuntimeConnection
        .mockResolvedValueOnce(mockMcpConnection1)
        .mockRejectedValueOnce(new Error('Config not found'));

      const snapshot = makeSnapshot(
        [
          makeNode('mcp-1', 'mcp-tool'),
          makeNode('mcp-2', 'mcp-tool'),
          makeNode('agent-1'),
        ],
        [makeEdge('mcp-1', 'agent-1'), makeEdge('mcp-2', 'agent-1')],
      );
      const steps = [
        makeStep({
          id: 'step-mcp-1',
          nodeId: 'mcp-1',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_1,
            toolName: 'search',
          },
        }),
        makeStep({
          id: 'step-mcp-2',
          nodeId: 'mcp-2',
          status: 'completed',
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: MCP_CONFIG_ID_2,
            toolName: 'exec',
          },
        }),
        makeStep({
          id: 'step-agent',
          nodeId: 'agent-1',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {},
        }),
      ];

      mcpDb.update.mockReturnValueOnce(createUpdateChainVoid());

      await mcpService.scheduleNode(
        EXECUTION_ID,
        'agent-1',
        TENANT_ID,
        snapshot,
        steps,
      );

      // 只成功解析的 config 被注入
      expect(mcpMockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          workflowContext: {
            mcpServers: {
              [MCP_CONFIG_ID_1]: mockMcpConnection1,
            },
          },
        }),
        undefined,
      );
    });
  });
});
