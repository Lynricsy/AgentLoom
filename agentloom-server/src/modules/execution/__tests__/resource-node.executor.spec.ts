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
  createSelectChain,
  createUpdateChainVoid
} from './node-scheduler-test-support';

describe('resource migrated scenarios', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点上游有 sandbox 时 job 数据应包含 hasSandbox: true', async () => {
      const snapshot = makeSnapshot(
        [makeNode('S', 'sandbox'), makeNode('A', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
  });

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点无 sandbox 上游时 hasSandbox 应为 false', async () => {
      const snapshot = makeSnapshot(
        [makeNode('A'), makeNode('B', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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
  });

  describe('scheduleNode migrated', () => {
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

  describe('scheduleNode migrated', () => {
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
  });
});
