import {
  afterAll,
  afterEach,
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
import { CodeExecutionService } from '../../agent/code-execution.service';
import { WorkspaceIntegrationService } from '../../agent-execution/workspace-integration.service';
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
    releaseExecutionSandbox: ReturnType<typeof vi.fn>;
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
  let mockCodeExecutionService: {
    execute: ReturnType<typeof vi.fn>;
  };
  let mockWorkflowAgentAdapterFactory: {
    createFromAgentDefinition: ReturnType<typeof vi.fn>;
  };
  let mockSharedResourceRegistry: {
    createResource: ReturnType<typeof vi.fn>;
  };
  let mockWorkspaceIntegrationService: {
    archiveExecutionStepWorkspace: ReturnType<typeof vi.fn>;
    startExecutionStepFileWatcher: ReturnType<typeof vi.fn>;
    stopExecutionStepFileWatcher: ReturnType<typeof vi.fn>;
  };
  let savedFetch: typeof globalThis.fetch;

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

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  beforeEach(async () => {
    savedFetch = globalThis.fetch;
    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    };
    db.select.mockReturnValue(createSelectChain([]));

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
      releaseExecutionSandbox: vi.fn().mockResolvedValue(undefined),
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
    mockCodeExecutionService = {
      execute: vi.fn(),
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
    mockWorkspaceIntegrationService = {
      archiveExecutionStepWorkspace: vi
        .fn()
        .mockResolvedValue('workspace-snapshot-001'),
      startExecutionStepFileWatcher: vi.fn().mockResolvedValue(undefined),
      stopExecutionStepFileWatcher: vi.fn(),
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
        { provide: CodeExecutionService, useValue: mockCodeExecutionService },
        {
          provide: AgentAdapterFactory,
          useValue: mockWorkflowAgentAdapterFactory,
        },
        {
          provide: SharedResourceRegistry,
          useValue: mockSharedResourceRegistry,
        },
        {
          provide: WorkspaceIntegrationService,
          useValue: mockWorkspaceIntegrationService,
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

    it('兼容 snake_case 的 source_handle/target_handle 端口映射', () => {
      const edges = [
        {
          id: 'node-trigger->node-condition',
          source: 'node-trigger',
          target: 'node-condition',
          source_handle: 'payload-out',
          target_handle: 'input-in',
        } as ReactFlowEdge,
      ];
      const steps = [
        makeStep({
          nodeId: 'node-trigger',
          nodeType: 'manual-trigger',
          status: 'completed',
          result: { payload: { route: 'skip', topic: '验证 skip 分支' } },
        }),
      ];

      expect(service.resolveNodeInput('node-condition', edges, steps)).toEqual({
        'input-in': { route: 'skip', topic: '验证 skip 分支' },
      });
    });

    it('trigger 命名输出端口应读取 payload 中的同名字段', () => {
      const edges = [
        makeEdge('node-trigger', 'node-agent', 'text-in', 'text-in'),
      ];
      const steps = [
        makeStep({
          nodeId: 'node-trigger',
          nodeType: 'manual-trigger',
          status: 'completed',
          result: {
            payload: {
              'text-in': 'WORKFLOW_TRIGGER_FIELD_OK_20260403',
            },
          },
        }),
      ];

      expect(service.resolveNodeInput('node-agent', edges, steps)).toEqual({
        'text-in': 'WORKFLOW_TRIGGER_FIELD_OK_20260403',
      });
    });

    it('text 节点的 text-out 端口应把文本常量传给下游', () => {
      const edges = [
        makeEdge('node-text', 'node-agent', 'text-out', 'text-in'),
      ];
      const steps = [
        makeStep({
          nodeId: 'node-text',
          nodeType: 'text',
          status: 'completed',
          result: {
            content: 'SELF_EVO_TEXT_PAYLOAD_20260408',
            text: 'SELF_EVO_TEXT_PAYLOAD_20260408',
            'text-out': 'SELF_EVO_TEXT_PAYLOAD_20260408',
          },
        }),
      ];

      expect(service.resolveNodeInput('node-agent', edges, steps)).toEqual({
        'text-in': 'SELF_EVO_TEXT_PAYLOAD_20260408',
      });
    });

    it('condition 分支输出应为下游解包单一 input payload', () => {
      const edges = [
        makeEdge(
          'node-condition',
          'node-preprocessor',
          'matched-out',
          'json-in',
        ),
      ];
      const steps = [
        makeStep({
          nodeId: 'node-condition',
          nodeType: 'condition',
          status: 'completed',
          result: {
            'matched-out': {
              input: { route: 'match', topic: '多 Agent 协作' },
            },
            matched: {
              input: { route: 'match', topic: '多 Agent 协作' },
            },
          },
        }),
      ];

      expect(
        service.resolveNodeInput('node-preprocessor', edges, steps),
      ).toEqual({
        'json-in': { route: 'match', topic: '多 Agent 协作' },
      });
    });

    it('同一 targetHandle 多个输入时应聚合为数组而不是后者覆盖前者', () => {
      const edges = [
        makeEdge('skill-1', 'agent-1', 'skill-out', 'skills-in'),
        makeEdge('skill-2', 'agent-1', 'skill-out', 'skills-in'),
      ];
      const steps = [
        makeStep({
          nodeId: 'skill-1',
          nodeType: 'skill',
          status: 'completed',
          result: {
            skills: [{ id: 'skill-a', name: '技能 A', content: 'A' }],
          },
        }),
        makeStep({
          nodeId: 'skill-2',
          nodeType: 'skill',
          status: 'completed',
          result: {
            skills: [{ id: 'skill-b', name: '技能 B', content: 'B' }],
          },
        }),
      ];

      expect(service.resolveNodeInput('agent-1', edges, steps)).toEqual({
        'skills-in': [
          { skills: [{ id: 'skill-a', name: '技能 A', content: 'A' }] },
          { skills: [{ id: 'skill-b', name: '技能 B', content: 'B' }] },
        ],
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

  describe('getSchedulingDecision', () => {
    it('当已连接的必填输入端口全部来自 skipped 前驱时应返回 skip', () => {
      const edges = [
        makeEdge('preprocessor', 'agent-a', 'text-out', 'text-in'),
        makeEdge('sandbox', 'agent-a', 'sandbox-out', 'sandbox-in'),
        makeEdge('memory', 'agent-a', 'memory-out', 'context-in'),
      ];
      const steps = [
        makeStep({
          nodeId: 'preprocessor',
          status: 'skipped',
          nodeType: 'input-preprocessor',
        }),
        makeStep({
          nodeId: 'sandbox',
          status: 'completed',
          nodeType: 'sandbox',
        }),
        makeStep({
          nodeId: 'memory',
          status: 'completed',
          nodeType: 'memory',
        }),
        makeStep({
          nodeId: 'agent-a',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {
            input_ports: [
              { id: 'text-in', required: true },
              { id: 'sandbox-in', required: false },
              { id: 'context-in', required: false },
            ],
          },
        }),
      ];

      expect(service['getSchedulingDecision']('agent-a', edges, steps)).toBe(
        'skip',
      );
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

    it('最新步骤状态已非 pending 时不应重复调度', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B')],
        [makeEdge('A', 'B')],
      );
      const staleSteps = [
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

      db.select
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(
          createSelectChain([
            makeStep({
              id: 'step-b',
              nodeId: 'B',
              status: 'cancelled',
              nodeType: 'agent',
              nodeData: { agentId: 'agent-b' },
            }),
          ]),
        );

      await service.scheduleNode(
        EXECUTION_ID,
        'B',
        TENANT_ID,
        snapshot,
        staleSteps,
      );

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('manual-trigger 节点会内联执行，不进入 agent-task 队列', async () => {
      const snapshot = makeSnapshot([makeNode('T', 'manual-trigger')], []);
      const executeTriggerNode = vi
        .spyOn(service, 'executeTriggerNode')
        .mockResolvedValue(undefined);
      const steps = [
        makeStep({
          id: 'step-t',
          nodeId: 'T',
          status: 'pending',
          nodeType: 'manual-trigger',
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'T', TENANT_ID, snapshot, steps);

      expect(executeTriggerNode).toHaveBeenCalledWith(
        steps[0],
        TENANT_ID,
        EXECUTION_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('text 节点会内联输出 root-level 文本常量，不进入 agent-task 队列', async () => {
      const snapshot = makeSnapshot([makeNode('T', 'text')], []);
      const steps = [
        makeStep({
          id: 'step-t',
          nodeId: 'T',
          status: 'pending',
          nodeType: 'text',
          nodeData: {
            content: 'WORKFLOW_TEXT_NODE_OK_20260408',
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'T', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-t',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-t',
        'completed',
        {
          result: {
            content: 'WORKFLOW_TEXT_NODE_OK_20260408',
            text: 'WORKFLOW_TEXT_NODE_OK_20260408',
            'text-out': 'WORKFLOW_TEXT_NODE_OK_20260408',
          },
        },
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('text 节点会保留显式空字符串配置，不回退 legacy root-level 文本', async () => {
      const snapshot = makeSnapshot([makeNode('T', 'text')], []);
      const steps = [
        makeStep({
          id: 'step-t',
          nodeId: 'T',
          status: 'pending',
          nodeType: 'text',
          nodeData: {
            text: 'LEGACY_TEXT_SHOULD_NOT_RESURRECT',
            config: {
              text: '',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'T', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-t',
        'completed',
        {
          result: {
            content: '',
            text: '',
            'text-out': '',
          },
        },
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('agent 节点会从上游 llm-model 输入解析模型并注入合成 agentId', async () => {
      const snapshot = makeSnapshot(
        [makeNode('M', 'llm-model'), makeNode('C', 'agent')],
        [makeEdge('M', 'C', 'model-out', 'model')],
      );
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'completed',
          nodeType: 'llm-model',
          result: {
            llmModelConfigId: 'model-cfg-1',
            modelConfigId: 'model-cfg-1',
          },
        }),
        makeStep({
          id: 'step-c',
          nodeId: 'C',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {
            config: {
              systemPrompt: '你是一个测试助手',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());

      await service.scheduleNode(EXECUTION_ID, 'C', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-c',
        'queued',
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'agent-task',
        {
          executionId: EXECUTION_ID,
          stepId: 'step-c',
          tenantId: TENANT_ID,
          input: {
            model: {
              llmModelConfigId: 'model-cfg-1',
              modelConfigId: 'model-cfg-1',
            },
          },
          nodeData: expect.objectContaining({
            agentId: 'C',
            llmModelConfigId: 'model-cfg-1',
            systemPrompt: '你是一个测试助手',
            config: {
              systemPrompt: '你是一个测试助手',
            },
          }),
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
        expect.objectContaining({
          result: expect.objectContaining({
            sessionId: '019577a0-0000-7000-8000-sandbox00001',
            status: 'creating',
            'sandbox-out': expect.objectContaining({
              sessionId: '019577a0-0000-7000-8000-sandbox00001',
              status: 'creating',
            }),
          }),
        }),
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
        expect.objectContaining({
          result: expect.objectContaining({
            sessionId: '019577a0-0000-7000-8000-memory000001',
            instanceId: '019577a0-0000-7000-8000-memoryinst001',
            role: 'readonly',
            status: 'active',
            'memory-out': expect.objectContaining({
              sessionId: '019577a0-0000-7000-8000-memory000001',
              instanceId: '019577a0-0000-7000-8000-memoryinst001',
              role: 'readonly',
              status: 'active',
            }),
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

    it('memory 节点应兼容 snake_case 配置字段', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('M', 'memory', {
            config: {
              memory_instance_id: '019577a0-0000-7000-8000-memoryinst002',
              role: 'readonly',
              boot_uris: ['system://boot'],
              fusion_priority: 5,
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
              memory_instance_id: '019577a0-0000-7000-8000-memoryinst002',
              role: 'readonly',
              boot_uris: ['system://boot'],
              fusion_priority: 5,
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'M', TENANT_ID, snapshot, steps);

      expect(mockSharedResourceRegistry.createResource).toHaveBeenCalledWith(
        'memory',
        {
          memoryInstanceId: '019577a0-0000-7000-8000-memoryinst002',
          role: 'readonly',
          bootUris: ['system://boot'],
          fusionPriority: 5,
          tenantId: TENANT_ID,
          executionId: EXECUTION_ID,
        },
      );
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

    it('sandbox 节点应兼容 snake_case 生命周期配置', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('S', 'sandbox', {
            config: {
              cpu: 2,
              memory: 1024,
              disk: 5,
              timeout: 4,
              lifecycle_mode: 'persistent',
              persistent_sandbox_id: 'persistent-sandbox-001',
              persistent_sandbox_name: 'QA Persistent Sandbox',
              persistence_expiry_hours: 72,
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
              lifecycle_mode: 'persistent',
              persistent_sandbox_id: 'persistent-sandbox-001',
              persistent_sandbox_name: 'QA Persistent Sandbox',
              persistence_expiry_hours: 72,
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
        config: {
          cpu: 2,
          memory: 1024,
          disk: 5,
          timeout: 4,
          lifecycleMode: 'persistent',
          persistentSandboxId: 'persistent-sandbox-001',
          name: 'QA Persistent Sandbox',
          persistenceExpiryHours: 72,
        },
        tenantId: TENANT_ID,
      });
    });

    it('workspace 节点会同步完成并产出 workspace 引用', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('W', 'workspace', {
            config: {
              workspaceId: '019577a0-0000-7000-8000-workspace0001',
              workspaceName: 'QA Workspace',
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-w',
          nodeId: 'W',
          status: 'pending',
          nodeType: 'workspace',
          nodeData: {
            config: {
              workspaceId: '019577a0-0000-7000-8000-workspace0001',
              workspaceName: 'QA Workspace',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'W', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-w',
        'running',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-w',
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            workspaceId: '019577a0-0000-7000-8000-workspace0001',
            workspaceName: 'QA Workspace',
            'volume-out': expect.objectContaining({
              workspaceId: '019577a0-0000-7000-8000-workspace0001',
              workspaceName: 'QA Workspace',
            }),
          }),
        }),
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-w',
        TENANT_ID,
      );
    });

    it('workspace 节点应兼容 snake_case 配置字段', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('W', 'workspace', {
            config: {
              workspace_id: '019577a0-0000-7000-8000-workspace0003',
              workspace_name: 'QA Workspace Snake',
            },
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-w',
          nodeId: 'W',
          status: 'pending',
          nodeType: 'workspace',
          nodeData: {
            config: {
              workspace_id: '019577a0-0000-7000-8000-workspace0003',
              workspace_name: 'QA Workspace Snake',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'W', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-w',
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            workspaceId: '019577a0-0000-7000-8000-workspace0003',
            workspaceName: 'QA Workspace Snake',
          }),
        }),
      );
    });

    it('input-preprocessor 节点应兼容 snake_case 模板配置', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('A', 'manual-trigger'),
          makeNode('P', 'input-preprocessor', {
            config: {
              transform_type: 'template',
              template:
                '主题：{{json-in.topic}}\\n请保留 route={{json-in.route}}。',
              output_format: 'text',
            },
          }),
        ],
        [makeEdge('A', 'P', 'payload-out', 'json-in')],
      );
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'completed',
          nodeType: 'manual-trigger',
          result: {
            payload: {
              topic: '多 Agent 协作',
              route: 'match',
            },
          },
        }),
        makeStep({
          id: 'step-p',
          nodeId: 'P',
          status: 'pending',
          nodeType: 'input-preprocessor',
          nodeData: {
            config: {
              transform_type: 'template',
              template:
                '主题：{{json-in.topic}}\\n请保留 route={{json-in.route}}。',
              output_format: 'text',
            },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'P', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-p',
        'completed',
        expect.objectContaining({
          result: {
            text: '主题：多 Agent 协作\\n请保留 route=match。',
            'text-out': '主题：多 Agent 协作\\n请保留 route=match。',
            'exec-out': { triggered: true },
            _outputFormat: 'text',
          },
        }),
      );
    });

    it('iteration compound 上下文会保留数组输入顺序，并默认按 collect-array 聚合', () => {
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );
      const snapshot = makeSnapshot(
        [
          makeNode('I', 'iteration', {
            config: {
              outputMode: 'collect-array',
            },
          }),
        ],
        [],
      );
      const step = makeStep({
        id: 'step-i',
        nodeId: 'I',
        nodeType: 'iteration',
        nodeData: {
          config: {
            outputMode: 'collect-array',
          },
        },
      });

      const context = (
        service as unknown as {
          createCompoundContext: (
            step: ExecutionStep,
            input: Record<string, unknown>,
            tenantId: string,
            executionId: string,
            snapshot: ReturnType<typeof makeSnapshot>,
            parentNodeType: 'loop' | 'iteration',
          ) => {
            iterationItems: unknown[];
            outputMode: 'none' | 'collect-array' | 'last';
            completedRounds: number;
          };
        }
      ).createCompoundContext(
        step,
        {
          'items-in': ['spec', 'qa', 'release'],
        },
        TENANT_ID,
        EXECUTION_ID,
        snapshot,
        'iteration',
      );

      expect(context.iterationItems).toEqual(['spec', 'qa', 'release']);
      expect(context.outputMode).toBe('collect-array');
      expect(context.completedRounds).toBe(0);
    });

    it('iteration 单对象输入会被包装成数组，loop 会优先读取 state-in 并兼容 snake_case 配置', () => {
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan([], new Map(), new Map()),
      );
      const iterationContext = (
        service as unknown as {
          createCompoundContext: (
            step: ExecutionStep,
            input: Record<string, unknown>,
            tenantId: string,
            executionId: string,
            snapshot: ReturnType<typeof makeSnapshot>,
            parentNodeType: 'loop' | 'iteration',
          ) => {
            iterationItems: unknown[];
          };
        }
      ).createCompoundContext(
        makeStep({
          id: 'step-i',
          nodeId: 'I',
          nodeType: 'iteration',
          nodeData: {
            config: {
              output_mode: 'collect-array',
            },
          },
        }),
        {
          'items-in': {
            topic: 'workflow orchestration',
          },
        },
        TENANT_ID,
        EXECUTION_ID,
        makeSnapshot([makeNode('I', 'iteration')], []),
        'iteration',
      );

      const loopContext = (
        service as unknown as {
          createCompoundContext: (
            step: ExecutionStep,
            input: Record<string, unknown>,
            tenantId: string,
            executionId: string,
            snapshot: ReturnType<typeof makeSnapshot>,
            parentNodeType: 'loop' | 'iteration',
          ) => {
            loopState: unknown;
            maxIterations: number;
          };
        }
      ).createCompoundContext(
        makeStep({
          id: 'step-l',
          nodeId: 'L',
          nodeType: 'loop',
          nodeData: {
            config: {
              default_state: { topic: 'fallback' },
              max_iterations: 5,
            },
          },
        }),
        {
          'state-in': { topic: 'from-input' },
        },
        TENANT_ID,
        EXECUTION_ID,
        makeSnapshot([makeNode('L', 'loop')], []),
        'loop',
      );

      expect(iterationContext.iterationItems).toEqual([
        {
          topic: 'workflow orchestration',
        },
      ]);
      expect(loopContext.loopState).toEqual({ topic: 'from-input' });
      expect(loopContext.maxIterations).toBe(5);
    });

    it('createCompoundContext 应兼容 snake_case parent_id 的内部节点', () => {
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['iter-start', 'iter-result']],
          new Map([
            ['iter-start', ['iter-result']],
            ['iter-result', []],
          ]),
          new Map([
            ['iter-start', 0],
            ['iter-result', 1],
          ]),
        ),
      );

      const context = (
        service as unknown as {
          createCompoundContext: (
            step: ExecutionStep,
            input: Record<string, unknown>,
            tenantId: string,
            executionId: string,
            snapshot: ReturnType<typeof makeSnapshot>,
            parentNodeType: 'loop' | 'iteration',
          ) => {
            internalNodes: ReactFlowNode[];
            orderedNodeIds: string[];
          };
        }
      ).createCompoundContext(
        makeStep({
          id: 'step-iteration',
          nodeId: 'iteration',
          nodeType: 'iteration',
        }),
        {
          'items-in': ['one'],
        },
        TENANT_ID,
        EXECUTION_ID,
        makeSnapshot(
          [
            makeNode('iteration', 'iteration'),
            {
              ...makeNode('iter-start', 'iteration-start'),
              parent_id: 'iteration',
              extent: 'parent',
            } as ReactFlowNode,
            {
              ...makeNode('iter-result', 'result'),
              parent_id: 'iteration',
              extent: 'parent',
            } as ReactFlowNode,
          ],
          [makeEdge('iter-start', 'iter-result')],
        ),
        'iteration',
      );

      expect(context.internalNodes.map((node) => node.id)).toEqual([
        'iter-start',
        'iter-result',
      ]);
      expect(context.orderedNodeIds).toEqual(['iter-start', 'iter-result']);
    });

    it('break 命中且当前轮 result 已可调度时应优先执行 result 节点', async () => {
      const context = {
        executionId: EXECUTION_ID,
        tenantId: TENANT_ID,
        parentNodeId: 'loop',
        parentStepId: 'step-loop',
        parentNodeType: 'loop' as const,
        parentInput: {},
        outputMode: 'last' as const,
        internalNodes: [
          makeNode('loop-start', 'loop-start'),
          makeNode('break', 'break'),
          makeNode('loop-agent', 'agent'),
          makeNode('loop-result', 'result'),
        ],
        internalEdges: [makeEdge('loop-start', 'loop-result')],
        orderedNodeIds: ['loop-start', 'break', 'loop-agent', 'loop-result'],
        extraInputPortIds: [],
        iterationItems: [],
        iterationIndex: 0,
        completedRounds: 1,
        loopState: { count: 1 },
        loopRound: 1,
        maxIterations: 5,
        previousResult: null,
        roundOutputs: {},
        finalOutputs: {},
        breakRequested: true,
        continueRequested: false,
        nextStateProvided: false,
        nextState: undefined,
      };
      const internalSteps = [
        makeStep({
          id: 'step-loop-start',
          nodeId: 'loop-start',
          nodeType: 'loop-start',
          status: 'completed',
          result: { 'exec-out': { triggered: true } },
        }),
        makeStep({
          id: 'step-break',
          nodeId: 'break',
          nodeType: 'break',
          status: 'completed',
        }),
        makeStep({
          id: 'step-loop-agent',
          nodeId: 'loop-agent',
          nodeType: 'agent',
          status: 'pending',
        }),
        makeStep({
          id: 'step-loop-result',
          nodeId: 'loop-result',
          nodeType: 'result',
          status: 'pending',
        }),
      ];

      vi.spyOn(service as any, 'loadExecutionContext').mockResolvedValue({
        execution: makeExecution(makeSnapshot([], [])),
        snapshot: makeSnapshot([], []),
        steps: internalSteps,
      });
      const scheduleNode = vi
        .spyOn(service, 'scheduleNode')
        .mockResolvedValue(undefined);
      const finalizeCompoundExecution = vi
        .spyOn(service as any, 'finalizeCompoundExecution')
        .mockResolvedValue(undefined);

      await (service as any).scheduleNextCompoundNode(context, TENANT_ID);

      expect(scheduleNode).toHaveBeenCalledWith(
        EXECUTION_ID,
        'loop-result',
        TENANT_ID,
        {
          nodes: context.internalNodes,
          edges: context.internalEdges,
        },
        internalSteps,
        { skipLatestState: true },
      );
      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalledWith(
        TENANT_ID,
        'step-loop-agent',
        'skipped',
      );
      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalledWith(
        TENANT_ID,
        'step-loop-result',
        'skipped',
      );
      expect(finalizeCompoundExecution).not.toHaveBeenCalled();
    });

    it('break 命中且当前轮 result 未就绪时应跳过剩余 pending 节点并收口当前轮输出', async () => {
      const context = {
        executionId: EXECUTION_ID,
        tenantId: TENANT_ID,
        parentNodeId: 'loop',
        parentStepId: 'step-loop',
        parentNodeType: 'loop' as const,
        parentInput: {},
        outputMode: 'last' as const,
        internalNodes: [
          makeNode('loop-start', 'loop-start'),
          makeNode('break', 'break'),
          makeNode('loop-agent', 'agent'),
          makeNode('loop-result', 'result'),
        ],
        internalEdges: [makeEdge('loop-agent', 'loop-result')],
        orderedNodeIds: ['loop-start', 'break', 'loop-agent', 'loop-result'],
        extraInputPortIds: [],
        iterationItems: [],
        iterationIndex: 0,
        completedRounds: 1,
        loopState: { count: 1 },
        loopRound: 1,
        maxIterations: 5,
        previousResult: null,
        roundOutputs: {
          'review-out': 'DEV_REVIEW_APPROVED_20260405',
        },
        finalOutputs: {},
        breakRequested: true,
        continueRequested: false,
        nextStateProvided: false,
        nextState: undefined,
      };
      const internalSteps = [
        makeStep({
          id: 'step-loop-start',
          nodeId: 'loop-start',
          nodeType: 'loop-start',
          status: 'completed',
          result: { 'exec-out': { triggered: true } },
        }),
        makeStep({
          id: 'step-break',
          nodeId: 'break',
          nodeType: 'break',
          status: 'completed',
        }),
        makeStep({
          id: 'step-loop-agent',
          nodeId: 'loop-agent',
          nodeType: 'agent',
          status: 'pending',
        }),
        makeStep({
          id: 'step-loop-result',
          nodeId: 'loop-result',
          nodeType: 'result',
          status: 'pending',
        }),
      ];

      vi.spyOn(service as any, 'loadExecutionContext').mockResolvedValue({
        execution: makeExecution(makeSnapshot([], [])),
        snapshot: makeSnapshot([], []),
        steps: internalSteps,
      });
      const finalizeCompoundExecution = vi
        .spyOn(service as any, 'finalizeCompoundExecution')
        .mockResolvedValue(undefined);

      await (service as any).scheduleNextCompoundNode(context, TENANT_ID);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-loop-agent',
        'skipped',
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-loop-result',
        'skipped',
      );
      expect(context.finalOutputs).toEqual({
        'review-out': 'DEV_REVIEW_APPROVED_20260405',
      });
      expect(context.previousResult).toEqual({
        'review-out': 'DEV_REVIEW_APPROVED_20260405',
      });
      expect(finalizeCompoundExecution).toHaveBeenCalledWith(
        context,
        TENANT_ID,
      );
    });

    it('sandbox 节点会从上游 workspace 节点透传 restoreWorkspaceId', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('W', 'workspace', {
            config: {
              workspaceId: '019577a0-0000-7000-8000-workspace0002',
              workspaceName: 'Seed Workspace',
            },
          }),
          makeNode('S', 'sandbox', {
            config: { cpu: 2, memory: 1024, disk: 5, timeout: 4 },
          }),
        ],
        [makeEdge('W', 'S', 'volume-out', 'volume-in')],
      );
      const steps = [
        makeStep({
          id: 'step-w',
          nodeId: 'W',
          status: 'completed',
          nodeType: 'workspace',
          nodeData: {
            config: {
              workspaceId: '019577a0-0000-7000-8000-workspace0002',
              workspaceName: 'Seed Workspace',
            },
          },
          result: {
            workspaceId: '019577a0-0000-7000-8000-workspace0002',
            workspaceName: 'Seed Workspace',
          },
        }),
        makeStep({
          id: 'step-s',
          nodeId: 'S',
          status: 'pending',
          nodeType: 'sandbox',
          nodeData: {
            config: { cpu: 2, memory: 1024, disk: 5, timeout: 4 },
          },
        }),
      ];

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'S', TENANT_ID, snapshot, steps);

      expect(mockSandboxService.createSandboxSession).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        sandboxNodeId: 'S',
        config: {
          cpu: 2,
          memory: 1024,
          disk: 5,
          timeout: 4,
          restoreWorkspaceId: '019577a0-0000-7000-8000-workspace0002',
        },
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
        expect.objectContaining({
          executionId: EXECUTION_ID,
          stepId: 'step-a',
          tenantId: TENANT_ID,
          input: { S: { sessionId: 'sandbox-session-001', status: 'ready' } },
          nodeData: expect.objectContaining({ agentId: 'agent-1' }),
          hasSandbox: true,
          workflowContext: {
            serverSandbox: {
              executionId: EXECUTION_ID,
              sandboxNodeId: 'S',
            },
          },
        }),
        undefined,
      );
    });

    it('plugin 节点会校验插件激活态后投递到 plugin queue', async () => {
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
        expect.objectContaining({
          executionId: EXECUTION_ID,
          stepId: 'step-b',
          tenantId: TENANT_ID,
          input: { A: { answer: 'hello' } },
          nodeData: expect.objectContaining({ agentId: 'agent-b' }),
        }),
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
        parentUsesSandboxRuntime: true,
        sandboxBinding: {
          executionId: EXECUTION_ID,
          sandboxNodeId: 'S',
        },
        agentVersionId: 'agent-version-1',
      });
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'running',
        {
          checkpointData: {
            sandboxNodeId: 'S',
            serverSandbox: {
              executionId: EXECUTION_ID,
              sandboxNodeId: 'S',
            },
          },
        },
      );
      expect(
        mockWorkspaceIntegrationService.startExecutionStepFileWatcher,
      ).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        stepId: 'step-a',
        tenantId: TENANT_ID,
        sandboxNodeId: 'S',
      });
      expect(
        mockWorkspaceIntegrationService.archiveExecutionStepWorkspace,
      ).toHaveBeenCalledWith(EXECUTION_ID, 'step-a', TENANT_ID, 'S');
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'completed',
        {
          result: { content: 'workflow-agent-output' },
          checkpointData: {
            sandboxNodeId: 'S',
            serverSandbox: {
              executionId: EXECUTION_ID,
              sandboxNodeId: 'S',
            },
            workspaceSnapshotId: 'workspace-snapshot-001',
          },
        },
      );
      expect(
        mockWorkspaceIntegrationService.stopExecutionStepFileWatcher,
      ).toHaveBeenCalledWith(EXECUTION_ID, 'step-a');
      expect(
        mockWorkspaceIntegrationService.stopExecutionStepFileWatcher.mock
          .invocationCallOrder[0],
      ).toBeLessThan(onNodeCompleted.mock.invocationCallOrder[0]!);
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-a',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('compound 内部 workflow agent 会从 sandbox-in 输入回推共享 sandbox 绑定', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('loop-start', 'loop-start'),
          makeNode('A', 'agent', {
            agentDefinitionId: 'agent-def-1',
            agentVersionId: 'agent-version-1',
          }),
        ],
        [makeEdge('loop-start', 'A', 'sandbox-in', 'sandbox-in')],
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
          id: 'step-loop-start',
          nodeId: 'loop-start',
          status: 'completed',
          nodeType: 'loop-start',
          result: {
            'sandbox-in': {
              sessionId: 'sandbox-session-001',
              status: 'ready',
            },
          },
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

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      mockWorkflowAgentAdapterFactory.createFromAgentDefinition.mockReturnValue(
        workflowAgentAdapter,
      );
      vi.spyOn(service, 'onNodeCompleted').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'A', TENANT_ID, snapshot, steps);

      expect(
        mockWorkflowAgentAdapterFactory.createFromAgentDefinition,
      ).toHaveBeenCalledWith('agent-def-1', undefined);
      expect(workflowAgentAdapter.execute).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        step: steps[2],
        input: {
          'sandbox-in': {
            sessionId: 'sandbox-session-001',
            status: 'ready',
          },
        },
        tenantId: TENANT_ID,
        parentUsesSandboxRuntime: true,
        sandboxBinding: {
          executionId: EXECUTION_ID,
          sandboxNodeId: 'S',
        },
        agentVersionId: 'agent-version-1',
      });
      expect(
        mockWorkspaceIntegrationService.startExecutionStepFileWatcher,
      ).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        stepId: 'step-a',
        tenantId: TENANT_ID,
        sandboxNodeId: 'S',
      });
      expect(
        mockWorkspaceIntegrationService.archiveExecutionStepWorkspace,
      ).toHaveBeenCalledWith(EXECUTION_ID, 'step-a', TENANT_ID, 'S');
    });

    it('workflow-agent 运行时写入的 checkpointData 会在 completed 时保留下来', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('A', 'agent', {
            agentDefinitionId: 'agent-def-1',
          }),
        ],
        [],
      );
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          status: 'pending',
          nodeType: 'agent',
          nodeData: {
            agentDefinitionId: 'agent-def-1',
          },
        }),
      ];
      const workflowAgentAdapter = {
        execute: vi
          .fn()
          .mockImplementation(async ({ step }: { step: ExecutionStep }) => {
            step.checkpointData = {
              ...(step.checkpointData ?? {}),
              partialContent: 'live-output',
              segments: [{ type: 'text', content: 'live-output' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  tool: 'write_file',
                  args: { path: 'notes.md' },
                  status: 'completed',
                },
              ],
            };
            return { content: 'workflow-agent-output' };
          }),
      };

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      mockWorkflowAgentAdapterFactory.createFromAgentDefinition.mockReturnValue(
        workflowAgentAdapter,
      );

      await service.scheduleNode(EXECUTION_ID, 'A', TENANT_ID, snapshot, steps);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-a',
        'completed',
        {
          result: { content: 'workflow-agent-output' },
          checkpointData: {
            sandboxNodeId: 'A',
            serverSandbox: {
              executionId: EXECUTION_ID,
              sandboxNodeId: 'A',
            },
            workspaceSnapshotId: 'workspace-snapshot-001',
            partialContent: 'live-output',
            segments: [{ type: 'text', content: 'live-output' }],
            toolCalls: [
              {
                id: 'tool-1',
                tool: 'write_file',
                args: { path: 'notes.md' },
                status: 'completed',
              },
            ],
          },
        },
      );
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
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain(steps))
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
        .mockReturnValueOnce(createSelectChain([makeExecution(snapshot)]))
        .mockReturnValueOnce(createSelectChain(steps))
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
            tools: [
              {
                toolName: 'get_weather',
                portMapping: { input: 'tool-in-0', output: 'tool-out-0' },
              },
            ],
            'tool-out': {
              type: 'mcp-tool',
              mcpServerConfigId: 'mcp-server-001',
              toolName: 'get_weather',
              portMapping: { input: 'tool-in-0', output: 'tool-out-0' },
              tools: [
                {
                  toolName: 'get_weather',
                  portMapping: { input: 'tool-in-0', output: 'tool-out-0' },
                },
              ],
            },
            'exec-out': { triggered: true },
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

    it('mcp-tool 节点应兼容 enabledToolIds + tools[] 的 Studio 配置结构', async () => {
      const snapshot = makeSnapshot([makeNode('M', 'mcp-tool')], []);
      const steps = [
        makeStep({
          id: 'step-m',
          nodeId: 'M',
          status: 'pending',
          nodeType: 'mcp-tool',
          nodeData: {
            config: {
              mcpServerConfigId: 'mcp-server-001',
              enabledToolIds: ['tool-fast'],
              tools: [
                {
                  id: 'tool-fast',
                  name: 'fast_search',
                  inputSchema: { type: 'object' },
                  portMappingMetadata: {
                    inputs: [{ name: 'query', dataType: 'text' }],
                    outputs: [{ name: 'result', dataType: 'json' }],
                  },
                },
                {
                  id: 'tool-deep',
                  name: 'deep_search',
                  inputSchema: { type: 'object' },
                },
              ],
            },
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
        'completed',
        {
          result: {
            type: 'mcp-tool',
            mcpServerConfigId: 'mcp-server-001',
            toolName: 'fast_search',
            enabledToolIds: ['tool-fast'],
            mcpToolDefinitionId: 'tool-fast',
            inputSchema: { type: 'object' },
            portMapping: {
              inputs: [{ name: 'query', dataType: 'text' }],
              outputs: [{ name: 'result', dataType: 'json' }],
            },
            tools: [
              {
                toolName: 'fast_search',
                mcpToolDefinitionId: 'tool-fast',
                inputSchema: { type: 'object' },
                portMapping: {
                  inputs: [{ name: 'query', dataType: 'text' }],
                  outputs: [{ name: 'result', dataType: 'json' }],
                },
              },
            ],
            'tool-out': {
              type: 'mcp-tool',
              mcpServerConfigId: 'mcp-server-001',
              toolName: 'fast_search',
              enabledToolIds: ['tool-fast'],
              mcpToolDefinitionId: 'tool-fast',
              inputSchema: { type: 'object' },
              portMapping: {
                inputs: [{ name: 'query', dataType: 'text' }],
                outputs: [{ name: 'result', dataType: 'json' }],
              },
              tools: [
                {
                  toolName: 'fast_search',
                  mcpToolDefinitionId: 'tool-fast',
                  inputSchema: { type: 'object' },
                  portMapping: {
                    inputs: [{ name: 'query', dataType: 'text' }],
                    outputs: [{ name: 'result', dataType: 'json' }],
                  },
                },
              ],
            },
            'exec-out': { triggered: true },
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

    it('http-tool 节点应同步执行 HTTP 请求并直接完成', async () => {
      const snapshot = makeSnapshot(
        [makeNode('P'), makeNode('H', 'http-tool')],
        [makeEdge('P', 'H', undefined, 'request-in')],
      );
      const steps = [
        makeStep({
          id: 'step-p',
          nodeId: 'P',
          status: 'completed',
          result: {
            query: { q: 'workflow' },
            headers: { 'X-Dynamic': 'dynamic-header' },
            body: { dynamic: true },
          },
        }),
        makeStep({
          id: 'step-h',
          nodeId: 'H',
          status: 'pending',
          nodeType: 'http-tool',
          nodeData: {
            config: {
              url: 'https://example.com/search',
              method: 'POST',
              headers: [{ key: 'X-Static', value: 'static-header' }],
              queryParams: [{ key: 'lang', value: 'zh-CN' }],
              body: '{"static":true}',
              authType: 'api-key',
              authConfig: {
                keyName: 'X-API-Key',
                keyValue: 'secret-token',
                location: 'header',
              },
              timeout: 15,
            },
          },
        }),
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://example.com/search?lang=zh-CN&q=workflow',
        headers: {
          entries: () =>
            Object.entries({
              'content-type': 'application/json',
            })[Symbol.iterator](),
          get: (key: string) =>
            key === 'content-type' ? 'application/json' : null,
        },
        json: vi.fn().mockResolvedValue({ answer: 'ok' }),
      } as unknown as Response);

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'H', TENANT_ID, snapshot, [
        ...steps,
      ]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        new URL('https://example.com/search?lang=zh-CN&q=workflow'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-Static': 'static-header',
            'X-API-Key': 'secret-token',
            'X-Dynamic': 'dynamic-header',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            dynamic: true,
          }),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-h',
        'completed',
        {
          result: {
            ok: true,
            status: 200,
            statusText: 'OK',
            url: 'https://example.com/search?lang=zh-CN&q=workflow',
            response: {
              ok: true,
              status: 200,
              statusText: 'OK',
              url: 'https://example.com/search?lang=zh-CN&q=workflow',
              headers: {
                'content-type': 'application/json',
              },
              body: { answer: 'ok' },
            },
            'response-out': { answer: 'ok' },
            'exec-out': {
              triggered: true,
              success: true,
              status: 200,
            },
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-h',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('http-tool 节点应兼容 snake_case query_params 配置', async () => {
      const snapshot = makeSnapshot([makeNode('H', 'http-tool')], []);
      const steps = [
        makeStep({
          id: 'step-h',
          nodeId: 'H',
          status: 'pending',
          nodeType: 'http-tool',
          nodeData: {
            config: {
              url: 'https://example.com/search',
              method: 'GET',
              query_params: [
                { key: 'q', value: 'OpenAI news' },
                { key: 'hl', value: 'en-US' },
              ],
            },
          },
        }),
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://example.com/search?q=OpenAI+news&hl=en-US',
        headers: {
          entries: () =>
            Object.entries({
              'content-type': 'application/json',
            })[Symbol.iterator](),
          get: (key: string) =>
            key === 'content-type' ? 'application/json' : null,
        },
        json: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as Response);

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'H', TENANT_ID, snapshot, [
        ...steps,
      ]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        new URL('https://example.com/search?q=OpenAI+news&hl=en-US'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-h',
        TENANT_ID,
      );
    });

    it('code-tool 节点应同步执行代码并直接完成', async () => {
      const steps = [
        makeStep({
          id: 'step-input',
          nodeId: 'input-source',
          status: 'completed',
          result: { payload: { value: 7 } },
        }),
        makeStep({
          id: 'step-c',
          nodeId: 'C',
          status: 'pending',
          nodeType: 'code-tool',
          nodeData: {
            config: {
              language: 'python',
              code: 'output = {"ok": True}',
              timeout: 20,
            },
          },
        }),
      ];
      const codeSnapshot = makeSnapshot(
        [makeNode('input-source'), makeNode('C', 'code-tool')],
        [makeEdge('input-source', 'C', undefined, 'input-in')],
      );

      mockCodeExecutionService.execute.mockResolvedValue({
        success: true,
        output: { ok: true },
        stdout: 'done',
        stderr: '',
        executionTimeMs: 12,
      });

      db.update.mockReturnValueOnce(createUpdateChainVoid());
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.scheduleNode(
        EXECUTION_ID,
        'C',
        TENANT_ID,
        codeSnapshot,
        steps,
      );

      expect(mockCodeExecutionService.execute).toHaveBeenCalledWith({
        language: 'python',
        code: 'output = {"ok": True}',
        input: { payload: { value: 7 } },
        timeout: 20,
      });
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'step-c',
        'completed',
        {
          result: {
            success: true,
            result: { ok: true },
            output: { ok: true },
            stdout: 'done',
            stderr: '',
            executionTimeMs: 12,
            'exec-out': {
              triggered: true,
              success: true,
            },
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-c',
        TENANT_ID,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
    const inlineDispatchCases = [
      ['llm-model', 'executeLlmModelNode', false],
      ['knowledge-base', 'executeKnowledgeNode', false],
      ['condition', 'executeConditional', true],
      ['conditional', 'executeConditional', true],
      ['loop', 'executeLoopNode', true],
      ['iteration', 'executeIterationNode', true],
      ['loop-start', 'executeLoopStartNode', false],
      ['iteration-start', 'executeIterationStartNode', false],
      ['loop-state', 'executeLoopStateNode', true],
      ['result', 'executeResultNode', true],
      ['break', 'executeBreakNode', true],
      ['continue', 'executeContinueNode', true],
      ['merge', 'executeMerge', true],
      ['text-output', 'executeOutputNode', true],
      ['json-output', 'executeOutputNode', true],
      ['skill', 'executeSkillNode', true],
    ] as const;

    it.each(inlineDispatchCases)(
      '%s 节点应分派给 %s，并保持标准调度上下文',
      async (nodeType, handlerName, receivesInput) => {
        const step = makeStep({
          id: `step-${nodeType}`,
          nodeId: `node-${nodeType}`,
          nodeType,
          nodeData: {},
        });
        const snapshot = makeSnapshot([makeNode(step.nodeId, nodeType)], []);
        const handler = vi
          .spyOn(service, handlerName)
          .mockResolvedValue(undefined);
        db.update.mockReturnValueOnce(createUpdateChainVoid());

        await service.scheduleNode(
          EXECUTION_ID,
          step.nodeId,
          TENANT_ID,
          snapshot,
          [step],
          { skipLatestState: true },
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(
          step,
          ...(receivesInput ? [{}] : []),
          TENANT_ID,
          EXECUTION_ID,
        );
        expect(mockQueue.add).not.toHaveBeenCalled();
      },
    );

    it.each(['sub-agent', 'future-custom-node'])(
      '%s 节点应使用 agent 任务队列兜底执行',
      async (nodeType) => {
        const step = makeStep({
          id: `step-${nodeType}`,
          nodeId: `node-${nodeType}`,
          nodeType,
          nodeData: {},
        });
        const snapshot = makeSnapshot([makeNode(step.nodeId, nodeType)], []);
        db.update.mockReturnValueOnce(createUpdateChainVoid());

        await service.scheduleNode(
          EXECUTION_ID,
          step.nodeId,
          TENANT_ID,
          snapshot,
          [step],
          { skipLatestState: true },
        );

        expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
          TENANT_ID,
          step.id,
          'queued',
        );
        expect(mockQueue.add).toHaveBeenCalledWith(
          'agent-task',
          expect.objectContaining({
            executionId: EXECUTION_ID,
            stepId: step.id,
            nodeData: { agentId: step.nodeId },
          }),
          undefined,
        );
      },
    );
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

    it('sandbox 节点的最后一个下游 agent 完成后应释放该节点绑定的 sandbox', async () => {
      const snapshot = makeSnapshot(
        [
          makeNode('S', 'sandbox'),
          makeNode('A', 'agent'),
          makeNode('B', 'agent'),
        ],
        [makeEdge('S', 'A'), makeEdge('S', 'B')],
      );
      const completedStep = makeStep({
        id: 'step-b',
        nodeId: 'B',
        status: 'completed',
        nodeType: 'agent',
        result: { ok: true },
      });
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
          status: 'completed',
          nodeType: 'agent',
          result: { ok: true },
        }),
        completedStep,
      ];

      db.select
        .mockReturnValueOnce(createSelectChain([completedStep]))
        .mockReturnValueOnce(
          createSelectChain([makeExecution(snapshot, 'running')]),
        )
        .mockReturnValueOnce(createSelectChain(steps))
        .mockReturnValueOnce(createSelectChain([{ status: 'running' }]));
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['S'], ['A', 'B']],
          new Map([
            ['S', ['A', 'B']],
            ['A', []],
            ['B', []],
          ]),
          new Map([
            ['S', 0],
            ['A', 1],
            ['B', 1],
          ]),
        ),
      );

      await service.onNodeCompleted(EXECUTION_ID, 'step-b', TENANT_ID);

      expect(mockSandboxService.releaseExecutionSandbox).toHaveBeenCalledWith(
        EXECUTION_ID,
        'S',
        TENANT_ID,
      );
    });
    it.each(['schedule', 'skip', 'wait'] as const)(
      '后继调度决策为 %s 时应只执行对应动作',
      async (decision) => {
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
            createSelectChain([makeExecution(snapshot, 'running')]),
          )
          .mockReturnValueOnce(createSelectChain(steps))
          .mockReturnValueOnce(createSelectChain([{ status: 'running' }]));
        mockDagResolver.resolveDag.mockReturnValue(
          makePlan(
            [['A'], ['B']],
            new Map([
              ['A', ['B']],
              ['B', []],
            ]),
            new Map([
              ['A', 0],
              ['B', 1],
            ]),
          ),
        );
        const scheduleNode = vi
          .spyOn(service, 'scheduleNode')
          .mockResolvedValue(undefined);
        const completionView = service as unknown as {
          getSchedulingDecision(
            nodeId: string,
            edges: ReactFlowEdge[],
            executionSteps: ExecutionStep[],
          ): 'schedule' | 'skip' | 'wait';
          skipAndCascade(
            executionId: string,
            nodeId: string,
            executionSteps: ExecutionStep[],
            tenantId: string,
          ): Promise<void>;
        };
        vi.spyOn(completionView, 'getSchedulingDecision').mockReturnValue(
          decision,
        );
        const skipAndCascade = vi
          .spyOn(completionView, 'skipAndCascade')
          .mockResolvedValue(undefined);

        await service.onNodeCompleted(EXECUTION_ID, 'step-a', TENANT_ID);

        if (decision === 'schedule') {
          expect(scheduleNode).toHaveBeenCalledWith(
            EXECUTION_ID,
            'B',
            TENANT_ID,
            expect.objectContaining({
              nodes: snapshot.nodes,
              edges: snapshot.edges,
            }),
            steps,
          );
          expect(skipAndCascade).not.toHaveBeenCalled();
        } else if (decision === 'skip') {
          expect(skipAndCascade).toHaveBeenCalledWith(
            EXECUTION_ID,
            'B',
            steps,
            TENANT_ID,
          );
          expect(scheduleNode).not.toHaveBeenCalled();
        } else {
          expect(scheduleNode).not.toHaveBeenCalled();
          expect(skipAndCascade).not.toHaveBeenCalled();
        }
        expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
          EXECUTION_ID,
          TENANT_ID,
        );
      },
    );

    it('condition 完成时应交给分支处理器，并支持没有普通后继的执行计划', async () => {
      const snapshot = makeSnapshot(
        [makeNode('C', 'condition'), makeNode('T'), makeNode('F')],
        [makeEdge('C', 'T', 'true'), makeEdge('C', 'F', 'false')],
      );
      const completedStep = makeStep({
        id: 'step-condition',
        nodeId: 'C',
        nodeType: 'condition',
        status: 'completed',
        result: { branch: 'true' },
      });
      const steps = [
        completedStep,
        makeStep({ id: 'step-true', nodeId: 'T', status: 'pending' }),
        makeStep({ id: 'step-false', nodeId: 'F', status: 'pending' }),
      ];
      db.select
        .mockReturnValueOnce(createSelectChain([completedStep]))
        .mockReturnValueOnce(
          createSelectChain([makeExecution(snapshot, 'running')]),
        )
        .mockReturnValueOnce(createSelectChain(steps))
        .mockReturnValueOnce(createSelectChain([{ status: 'running' }]));
      mockDagResolver.resolveDag.mockReturnValue(
        makePlan(
          [['C'], ['T', 'F']],
          new Map(),
          new Map([
            ['C', 0],
            ['T', 1],
            ['F', 1],
          ]),
        ),
      );
      const completionView = service as unknown as {
        handleConditionalBranching(
          executionId: string,
          conditionalNodeId: string,
          branch: string,
          graph: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] },
          executionSteps: ExecutionStep[],
          tenantId: string,
        ): Promise<void>;
      };
      const handleConditionalBranching = vi
        .spyOn(completionView, 'handleConditionalBranching')
        .mockResolvedValue(undefined);

      await service.onNodeCompleted(EXECUTION_ID, completedStep.id, TENANT_ID);

      expect(handleConditionalBranching).toHaveBeenCalledWith(
        EXECUTION_ID,
        'C',
        'true',
        expect.objectContaining({
          nodes: snapshot.nodes,
          edges: snapshot.edges,
        }),
        steps,
        TENANT_ID,
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
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
        {
          nodes: snapshot.nodes,
          edges: snapshot.edges,
        },
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
            branch: 'branch-0',
            'branch-0': { A: { score: 92 } },
            else: null,
            'matched-out': { A: { score: 92 } },
            'unmatched-out': null,
            matched: { A: { score: 92 } },
            unmatched: null,
            true: { A: { score: 92 } },
            false: null,
          },
        },
      );
      expect(onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-conditional',
        TENANT_ID,
      );
    });

    it('兼容 snake_case 条件字段配置并正确走 unmatched 分支', async () => {
      const step = makeStep({
        id: 'step-conditional',
        nodeId: 'C',
        nodeType: 'condition',
        nodeData: {
          config: {
            condition_field: 'route',
            expected_value: 'match',
          },
          condition_field: 'route',
          expected_value: 'match',
        },
      });
      const onNodeCompleted = vi
        .spyOn(service, 'onNodeCompleted')
        .mockResolvedValue(undefined);

      await service.executeConditional(
        step,
        { input: { route: 'skip', topic: '验证 skip 分支' } },
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
            branch: 'else',
            'branch-0': null,
            else: {
              input: { route: 'skip', topic: '验证 skip 分支' },
            },
            'matched-out': null,
            'unmatched-out': {
              input: { route: 'skip', topic: '验证 skip 分支' },
            },
            matched: null,
            unmatched: {
              input: { route: 'skip', topic: '验证 skip 分支' },
            },
            true: null,
            false: {
              input: { route: 'skip', topic: '验证 skip 分支' },
            },
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
      mcpDb.select.mockReturnValue(createSelectChain([]));
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
            provide: CodeExecutionService,
            useValue: { execute: vi.fn() },
          },
          {
            provide: AgentAdapterFactory,
            useValue: { createFromAgentDefinition: vi.fn() },
          },
          {
            provide: SharedResourceRegistry,
            useValue: { createResource: vi.fn() },
          },
          {
            provide: WorkspaceIntegrationService,
            useValue: {
              archiveExecutionStepWorkspace: vi.fn().mockResolvedValue(null),
              startExecutionStepFileWatcher: vi
                .fn()
                .mockResolvedValue(undefined),
              stopExecutionStepFileWatcher: vi.fn(),
            },
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
