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
import {
  NODE_EXECUTION_PROVIDERS,
  EXECUTION_ID,
  TENANT_ID,
  NOW,
  makeStep,
  makeNode,
  makeEdge,
  makeSnapshot,
  createSelectChain,
  createUpdateChainVoid
} from './node-scheduler-test-support';

describe('http migrated scenarios', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });
});
