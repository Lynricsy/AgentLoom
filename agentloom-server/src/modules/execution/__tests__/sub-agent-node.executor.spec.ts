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

describe('subagent migrated scenarios', () => {
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
          ...NODE_EXECUTION_PROVIDERS,
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

    it('sub-agent 节点的 input 包含 MCP tool 描述符时注入 mcpServers', async () => {
      mockMcpService.resolveRuntimeConnection.mockResolvedValue(
        mockMcpConnection1,
      );

      const snapshot = makeSnapshot(
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
          makeNode('agent-1', 'sub-agent'),
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
          nodeType: 'sub-agent',
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
          makeNode('agent-1', 'sub-agent'),
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
          nodeType: 'sub-agent',
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
        [makeNode('mcp-1', 'mcp-tool'), makeNode('agent-1', 'sub-agent')],
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
          nodeType: 'sub-agent',
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

      // 即使解析失败也不会阻止 sub-agent 任务入队
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
          makeNode('agent-1', 'sub-agent'),
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
          nodeType: 'sub-agent',
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

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点会保存 input 后进入队列，并携带 nodeData', async () => {
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
  });

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点会从上游 llm-model 输入解析模型并注入合成 agentId', async () => {
      const snapshot = makeSnapshot(
        [makeNode('M', 'llm-model'), makeNode('C', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
  });

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点会继承 smart-routing 输出的 llmModelConfigId，并在 FALLBACK_CHAIN 下强制 attempts=1', async () => {
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
        [makeNode('R', 'smart-routing'), makeNode('A', 'sub-agent')],
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
          nodeType: 'sub-agent',
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
  });

  describe('scheduleNode migrated', () => {
    it('sub-agent 节点应使用 agent 任务队列执行', async () => {
      const step = makeStep({
        id: 'step-sub-agent',
        nodeId: 'node-sub-agent',
        nodeType: 'sub-agent',
        nodeData: {},
      });
      const snapshot = makeSnapshot(
        [makeNode(step.nodeId, 'sub-agent')],
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
    });
  });
});
