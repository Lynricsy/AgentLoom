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
} from './node-scheduler-test-support';

describe('lifecycle migrated scenarios', () => {
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
