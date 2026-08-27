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
import { NodeDispatcherService } from '../node-dispatcher.service';
import { NodeExecutionFailurePolicy } from '../node-execution-failure-policy';
import { CompoundExecutionService } from '../compound-execution.service';
import { CodeNodeExecutor } from '../node-executors/code-node.executor';
import { CompoundNodeExecutor } from '../node-executors/compound-node.executor';
import { ConditionalNodeExecutor } from '../node-executors/conditional-node.executor';
import { DataTransformNodeExecutor } from '../node-executors/data-transform-node.executor';
import { DeprecatedNodeExecutor } from '../node-executors/deprecated-node.executor';
import { ExtensionNodeExecutor } from '../node-executors/extension-node.executor';
import { HttpNodeExecutor } from '../node-executors/http-node.executor';
import { ResourceNodeExecutor } from '../node-executors/resource-node.executor';
import { SmartRoutingNodeExecutor } from '../node-executors/smart-routing-node.executor';
import { SubAgentNodeExecutor } from '../node-executors/sub-agent-node.executor';
import { TriggerNodeExecutor } from '../node-executors/trigger-node.executor';
import { ValueNodeExecutor } from '../node-executors/value-node.executor';
import { WorkflowAgentNodeExecutor } from '../node-executors/workflow-agent-node.executor';
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
} from '../execution.exceptions';
import {
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../../../common/exceptions/tool-call.exceptions';
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
import {
  NODE_EXECUTION_PROVIDERS,
  EXECUTION_ID,
  TENANT_ID,
  NOW,
  makeStep,
  makeNode,
  makeEdge,
  makeSnapshot,
  makeExecution,
  makePlan,
  createSelectChain,
  createUpdateChainVoid
} from './node-scheduler-test-support';

describe('facade migrated scenarios', () => {
  let service: NodeSchedulerService;
  let nodeDispatcher: NodeDispatcherService;
  let compoundExecution: CompoundExecutionService;
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
        ...NODE_EXECUTION_PROVIDERS,
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
    nodeDispatcher = module.get(NodeDispatcherService);
    compoundExecution = module.get(CompoundExecutionService);
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

      expect(service.getSchedulingDecision('agent-a', edges, steps)).toBe(
        'skip',
      );
    });
  });

  describe('startExecution', () => {
    it('会调度首层 sub-agent 节点，并把 input 与 nodeData 一并入队', async () => {
      const nodes = [
        makeNode('A', 'sub-agent'),
        makeNode('B', 'sub-agent'),
        makeNode('C'),
      ];
      const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
      const snapshot = makeSnapshot(nodes, edges);
      const steps = [
        makeStep({
          id: 'step-a',
          nodeId: 'A',
          nodeType: 'sub-agent',
          nodeData: { agentId: 'agent-a' },
        }),
        makeStep({
          id: 'step-b',
          nodeId: 'B',
          nodeType: 'sub-agent',
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
  describe('scheduleNode migrated', () => {
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

      vi.spyOn(service, 'onNodeFailed').mockResolvedValue(undefined);

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
      expect(service.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-b',
        TENANT_ID,
      );
    });

    it('无 portMappingMetadata 时应改用 normalize 写入的静态端口判定不兼容', async () => {
      const nodeA = makeNode('A', 'text-output', {
        outputPorts: [{ id: 'text-out', dataType: 'text' }],
      });
      const nodeB = makeNode('B', 'merge', {
        inputPorts: [{ id: 'items-in', dataType: 'array' }],
      });
      const snapshot = makeSnapshot(
        [nodeA, nodeB],
        [makeEdge('A', 'B', 'text-out', 'items-in')],
      );
      const stepA = makeStep({
        id: 'step-a',
        nodeId: 'A',
        status: 'completed',
        result: { text: 'hello' },
      });
      const stepB = makeStep({
        id: 'step-b',
        nodeId: 'B',
        status: 'pending',
        nodeType: 'merge',
      });

      vi.spyOn(service, 'onNodeFailed').mockResolvedValue(undefined);

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
              targetType: 'array',
            }),
          }),
        }),
      );
      expect(service.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        'step-b',
        TENANT_ID,
      );
    });

    it('静态端口两端都缺 dataType 时保持 no-op（保护动态 MCP 端口）', async () => {
      const nodeA = makeNode('A', 'mcp-tool');
      const nodeB = makeNode('B', 'agent');
      const snapshot = makeSnapshot(
        [nodeA, nodeB],
        [makeEdge('A', 'B', 'dynamic-out', 'dynamic-in')],
      );
      const stepA = makeStep({
        id: 'step-a',
        nodeId: 'A',
        status: 'completed',
        result: { 'dynamic-out': 'value' },
      });
      const stepB = makeStep({
        id: 'step-b',
        nodeId: 'B',
        status: 'pending',
        nodeType: 'agent',
      });

      db.update.mockReturnValue(createUpdateChainVoid());
      vi.spyOn(service, 'onNodeFailed').mockResolvedValue(undefined);

      await service.scheduleNode(EXECUTION_ID, 'B', TENANT_ID, snapshot, [
        stepA,
        stepB,
      ]);

      // 端口守卫必须放行：动态端口在快照里没有类型信息，误报会阻断合法的 MCP 连线。
      // 该节点之后是否因其它原因失败与本用例无关，故只断言不存在 typeMismatch 判定。
      const typeMismatchCalls =
        mockStateMachine.updateStepStatus.mock.calls.filter(
          (call: unknown[]) =>
            (
              call[3] as
                | { errorMessage?: { type?: string } }
                | undefined
            )?.errorMessage?.type ===
            'https://agentloom.dev/errors/node-type-mismatch',
        );
      expect(typeMismatchCalls).toHaveLength(0);
    });
  });


});
