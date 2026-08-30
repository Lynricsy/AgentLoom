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
  createUpdateChainVoid,
} from './node-scheduler-test-support';

describe('smart migrated scenarios', () => {
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

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });
});
