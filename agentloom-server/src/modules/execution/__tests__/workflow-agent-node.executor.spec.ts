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
import {
  NODE_EXECUTION_PROVIDERS,
  EXECUTION_ID,
  TENANT_ID,
  NOW,
  makeStep,
  makeNode,
  makeSnapshot,
  createSelectChain,
  createUpdateChainVoid,
  mockOrganizationAutonomyPolicyService,
} from './node-scheduler-test-support';

describe('workflow migrated scenarios', () => {
  let service: NodeSchedulerService;
  let workflowAgentNodeExecutor: WorkflowAgentNodeExecutor;
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
    emitInterventionRequired: ReturnType<typeof vi.fn>;
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
      transaction: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    };
    db.transaction.mockImplementation(async (callback) => callback(db));
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
      emitInterventionRequired: vi.fn(),
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
    mockOrganizationAutonomyPolicyService.resolveEffectiveAutonomyMode
      .mockReset()
      .mockResolvedValue('FULL_AUTO');

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
    workflowAgentNodeExecutor = module.get(WorkflowAgentNodeExecutor);
    nodeDispatcher = module.get(NodeDispatcherService);
    compoundExecution = module.get(CompoundExecutionService);
  });

  describe('scheduleNode migrated', () => {
    it('agent 节点缺少 agentDefinitionId 时显式失败', async () => {
      const step = makeStep({
        id: 'step-agent',
        nodeId: 'node-agent',
        nodeType: 'agent',
        nodeData: { systemPrompt: '缺少已发布的 Agent Definition' },
      });
      const snapshot = makeSnapshot([makeNode(step.nodeId, 'agent')], []);
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
            message: expect.stringContaining(
              '必须绑定已发布的 Agent Definition',
            ),
          }),
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
  describe('scheduleNode migrated', () => {
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
  });
    it('MANUAL_CONFIRM + end_turn 会暂停并进入 waiting_intervention', async () => {
      const step = makeStep({
        id: 'step-manual',
        nodeId: 'manual-agent',
        status: 'queued',
        nodeType: 'agent',
        nodeData: {
          agentDefinitionId: 'agent-def-manual',
          autonomyMode: 'MANUAL_CONFIRM',
          label: '人工确认 Agent',
        },
      });
      const decision = {
        suggestedContent: '建议稿',
        confidence: 0.9,
      };
      mockOrganizationAutonomyPolicyService.resolveEffectiveAutonomyMode.mockResolvedValueOnce(
        'MANUAL_CONFIRM',
      );
      mockWorkflowAgentAdapterFactory.createFromAgentDefinition.mockReturnValue({
        execute: vi
          .fn()
          .mockImplementation(async ({ step: executingStep }) => {
            executingStep.checkpointData = {
              ...(executingStep.checkpointData ?? {}),
              sessionId: 'session-manual',
              toolCalls: [{ id: 'tool-1', status: 'completed' }],
              segments: [{ type: 'text', content: '建议稿' }],
            };
            return {
              content: '建议稿',
              stopReason: 'end_turn',
              decision,
            };
          }),
      });
      db.select.mockReturnValue(
        createSelectChain([
          {
            nodeId: step.nodeId,
            workflowDefinitionId: 'workflow-001',
          },
        ]),
      );
      const onNodeCompleted = vi.spyOn(service, 'onNodeCompleted');

      await workflowAgentNodeExecutor.executeWorkflowAgentNode(
        step,
        {},
        TENANT_ID,
        EXECUTION_ID,
        [],
        [step],
        service,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenNthCalledWith(
        2,
        TENANT_ID,
        step.id,
        'waiting_intervention',
        {
          checkpointData: {
            sessionId: 'session-manual',
            partialContent: '建议稿',
            stopReason: 'intervention_required',
            interventionRequestedAt: expect.any(String),
            interventionNodeName: '人工确认 Agent',
            toolCalls: [{ id: 'tool-1', status: 'completed' }],
            segments: [{ type: 'text', content: '建议稿' }],
            decision,
          },
          result: {
            content: '建议稿',
            stopReason: 'intervention_required',
            decision,
          },
        },
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockEventBridge.emitInterventionRequired).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: step.id,
          nodeId: step.nodeId,
          nodeName: '人工确认 Agent',
          executionType: 'workflow',
          decision,
          partialContent: '建议稿',
          requestedAt: expect.any(String),
        },
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'intervention-timeout',
        {
          executionId: EXECUTION_ID,
          stepId: step.id,
          tenantId: TENANT_ID,
        },
        expect.objectContaining({
          jobId: `intervention-timeout:${step.id}`,
        }),
      );
      expect(
        mockWorkspaceIntegrationService.archiveExecutionStepWorkspace,
      ).not.toHaveBeenCalled();
      expect(onNodeCompleted).not.toHaveBeenCalled();
    });

    it('FULL_AUTO + end_turn 会按原路径完成节点', async () => {
      const step = makeStep({
        id: 'step-full-auto',
        nodeId: 'full-auto-agent',
        status: 'queued',
        nodeType: 'agent',
        nodeData: {
          agentDefinitionId: 'agent-def-full-auto',
          autonomyMode: 'FULL_AUTO',
        },
      });
      mockWorkflowAgentAdapterFactory.createFromAgentDefinition.mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          content: '自动完成',
          stopReason: 'end_turn',
        }),
      });
      const runtime = {
        pauseForIntervention: vi.fn(),
        onNodeCompleted: vi.fn().mockResolvedValue(undefined),
        onNodeFailed: vi.fn().mockResolvedValue(undefined),
      } as unknown as NodeSchedulerService;

      await workflowAgentNodeExecutor.executeWorkflowAgentNode(
        step,
        {},
        TENANT_ID,
        EXECUTION_ID,
        [],
        [step],
        runtime,
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        step.id,
        'completed',
        expect.objectContaining({
          result: {
            content: '自动完成',
            stopReason: 'end_turn',
          },
        }),
      );
      expect(runtime.pauseForIntervention).not.toHaveBeenCalled();
      expect(runtime.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        step.id,
        TENANT_ID,
      );
    });



});
