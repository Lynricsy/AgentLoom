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
  createSelectChain,
  createUpdateChainVoid
} from './node-scheduler-test-support';

describe('dispatcher migrated scenarios', () => {
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

  describe('scheduleNode migrated', () => {
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
  });




  describe('scheduleNode migrated', () => {
    it.each(inlineDispatchCases)(
      '%s 节点应分派给公开 executor，并保持标准调度上下文',

      async (nodeType) => {
        const step = makeStep({
          id: `step-${nodeType}`,
          nodeId: `node-${nodeType}`,
          nodeType,
          nodeData: {},
        });
        const snapshot = makeSnapshot([makeNode(step.nodeId, nodeType)], []);
        const executor = nodeDispatcher.find(nodeType)!;
        const execute = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(nodeDispatcher, 'find').mockReturnValue({ execute });
        await nodeDispatcher.dispatch({
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
          step,
          input: {},
          snapshot,
          steps: [step],
          memorySessionIds: [],
          runtime: service,
        });

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(
          expect.objectContaining({
            step,
            input: {},
            tenantId: TENANT_ID,
            executionId: EXECUTION_ID,
            runtime: service,
          }),
        );
        expect(mockQueue.add).not.toHaveBeenCalled();
      },
    );
  });

  describe('scheduleNode migrated', () => {
    it('未知节点类型应显式失败，不再降级到 agent 队列', async () => {
      const step = makeStep({
        id: 'step-future-custom-node',
        nodeId: 'node-future-custom-node',
        nodeType: 'future-custom-node',
        nodeData: {},
      });
      const snapshot = makeSnapshot(
        [makeNode(step.nodeId, 'future-custom-node')],
        [],
      );
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
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            message: expect.stringContaining('不支持的节点类型'),
          }),
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});

/**
 * 节点分派器规格：验证完整 nodeType 注册表与公开执行器分派行为。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionStep } from '../../../database/schema';
import { NodeDispatcherService } from '../node-dispatcher.service';
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
import type { NodeSchedulerService } from '../node-scheduler.service';

function stubExecutor<T>(): T {
  return { execute: vi.fn() } as unknown as T;
}

function createDispatcher(
  http: HttpNodeExecutor = stubExecutor<HttpNodeExecutor>(),
): NodeDispatcherService {
  return new NodeDispatcherService(
    stubExecutor<WorkflowAgentNodeExecutor>(),
    stubExecutor<TriggerNodeExecutor>(),
    stubExecutor<ResourceNodeExecutor>(),
    stubExecutor<DataTransformNodeExecutor>(),
    http,
    stubExecutor<CodeNodeExecutor>(),
    stubExecutor<ConditionalNodeExecutor>(),
    stubExecutor<CompoundNodeExecutor>(),
    stubExecutor<ValueNodeExecutor>(),
    stubExecutor<SmartRoutingNodeExecutor>(),
    stubExecutor<ExtensionNodeExecutor>(),
    stubExecutor<SubAgentNodeExecutor>(),
    stubExecutor<DeprecatedNodeExecutor>(),
  );
}

function makeStep(nodeType: string): ExecutionStep {
  return {
    id: 'step-1',
    executionId: 'execution-1',
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'pending',
    nodeType,
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

describe('NodeDispatcherService', () => {
  it('注册 scheduleNode 的全部存量 nodeType', () => {
    const dispatcher = createDispatcher();
    const nodeTypes = [
      'agent', 'chat-agent', 'llm-agent',
      'manual-trigger', 'schedule-trigger', 'webhook-trigger', 'api-event-trigger',
      'llm-model', 'sandbox', 'workspace', 'memory', 'knowledge-base',
      'data_transform', 'input-preprocessor', 'http-tool', 'code-tool',
      'condition', 'conditional', 'loop', 'iteration', 'loop-start',
      'iteration-start', 'loop-state', 'result', 'break', 'continue',
      'merge', 'text', 'text-output', 'json-output', 'smart-routing',
      'plugin', 'skill', 'mcp-tool', 'sub-agent',
    ];

    for (const nodeType of nodeTypes) {
      expect(dispatcher.find(nodeType), nodeType).toBeDefined();
    }
  });

  it('通过公开 executor 契约把 http-tool 上下文原样交给 HTTP 执行路径', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const http = { execute } as unknown as HttpNodeExecutor;
    const dispatcher = createDispatcher(http);
    const runtime = {} as NodeSchedulerService;
    const step = makeStep('http-tool');
    const input = { request: { query: 'workflow' } };

    await expect(dispatcher.dispatch({
      executionId: 'execution-1',
      tenantId: 'tenant-1',
      step,
      input,
      snapshot: { nodes: [], edges: [] },
      steps: [step],
      memorySessionIds: [],
      runtime,
    })).resolves.toBe(true);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        step,
        input,
        tenantId: 'tenant-1',
        executionId: 'execution-1',
        runtime,
      }),
    );
  });

  it('未知 nodeType 不执行任何 fallback executor', async () => {
    const dispatcher = createDispatcher();
    const step = makeStep('future-node');

    await expect(dispatcher.dispatch({
      executionId: 'execution-1',
      tenantId: 'tenant-1',
      step,
      input: {},
      snapshot: { nodes: [], edges: [] },
      steps: [step],
      memorySessionIds: [],
      runtime: {} as NodeSchedulerService,
    })).resolves.toBe(false);
  });
});
