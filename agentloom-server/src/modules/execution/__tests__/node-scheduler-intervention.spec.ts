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
  USER_ID,
  NOW,
  makeStep,
  createSelectChain
} from './node-scheduler-test-support';

describe('intervention migrated scenarios', () => {
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

  describe('pauseForIntervention', () => {
    it('统一持久化 checkpoint、暂停 execution、广播 required 并安排 timeout', async () => {
      const step = makeStep({
        id: 'step-pause',
        nodeId: 'node-pause',
        nodeData: { label: '人工复核' },
      });
      const enqueueTimeout = vi
        .spyOn(service, 'enqueueInterventionTimeout')
        .mockResolvedValue(undefined);

      await service.pauseForIntervention({
        executionId: EXECUTION_ID,
        tenantId: TENANT_ID,
        step,
        sessionId: 'session-pause',
        partialContent: '待确认内容',
        toolCalls: [{ id: 'tool-1', status: 'completed' }],
        segments: [{ type: 'text', content: '待确认内容' }],
        decision: { suggestedContent: '待确认内容', confidence: 0.8 },
        executionType: 'workflow',
      });

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        step.id,
        'waiting_intervention',
        expect.objectContaining({
          checkpointData: expect.objectContaining({
            sessionId: 'session-pause',
            stopReason: 'intervention_required',
            interventionNodeName: '人工复核',
          }),
          result: expect.objectContaining({
            content: '待确认内容',
            stopReason: 'intervention_required',
          }),
        }),
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockEventBridge.emitInterventionRequired).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        expect.objectContaining({
          stepId: step.id,
          nodeId: step.nodeId,
          nodeName: '人工复核',
          executionType: 'workflow',
          partialContent: '待确认内容',
        }),
      );
      expect(enqueueTimeout).toHaveBeenCalledWith(
        EXECUTION_ID,
        step.id,
        TENANT_ID,
      );
    });

    it('状态已提交后 queue.add 抛错时应降级：不抛出、不回滚 waiting_intervention', async () => {
      const step = makeStep({
        id: 'step-pause-degrade',
        nodeId: 'node-pause-degrade',
        nodeData: { label: '人工复核' },
      });
      // 真实缺陷形态：事务已提交为 waiting_intervention，随后超时任务入队失败。
      // 若此处向上抛，调用方 catch 会写 waiting_intervention → failed（非法转换），
      // 且 ExecutionWorker.onFailed 会无条件 markFailed，把整个 execution 打死。
      const enqueueTimeout = vi
        .spyOn(service, 'enqueueInterventionTimeout')
        .mockRejectedValue(new Error('custom jobId is not allowed to contain :'));

      await expect(
        service.pauseForIntervention({
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
          step,
          sessionId: 'session-pause-degrade',
          partialContent: '待确认内容',
          executionType: 'workflow',
        }),
      ).resolves.toBeUndefined();

      expect(enqueueTimeout).toHaveBeenCalled();
      // 步骤只被写过一次 waiting_intervention，绝不能再出现第二次状态写入。
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledTimes(1);
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        step.id,
        'waiting_intervention',
        expect.anything(),
      );
    });

    it('广播抛错只损失实时通知：超时兜底仍必须照常入队', async () => {
      const step = makeStep({ id: 'step-pause-emit', nodeId: 'node-pause-emit' });
      mockEventBridge.emitInterventionRequired.mockImplementationOnce(() => {
        throw new Error('event bridge down');
      });
      const enqueueTimeout = vi
        .spyOn(service, 'enqueueInterventionTimeout')
        .mockResolvedValue(undefined);

      await expect(
        service.pauseForIntervention({
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
          step,
          sessionId: 'session-pause-emit',
          partialContent: '待确认内容',
          executionType: 'workflow',
        }),
      ).resolves.toBeUndefined();

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledTimes(1);
      // 两个 post-commit 副作用互相独立：广播挂了不能连带吞掉自动超时兜底，
      // 否则就是既无实时通知、又无超时处置的「孤儿暂停」——最差的结果。
      expect(enqueueTimeout).toHaveBeenCalledWith(
        EXECUTION_ID,
        step.id,
        TENANT_ID,
      );
    });

    it('事务本身失败必须继续上抛：此时步骤仍是 running，调用方写 failed 是合法的', async () => {
      const step = makeStep({ id: 'step-pause-tx', nodeId: 'node-pause-tx' });
      mockStateMachine.updateStepStatus.mockRejectedValueOnce(
        new Error('db connection lost'),
      );
      const enqueueTimeout = vi
        .spyOn(service, 'enqueueInterventionTimeout')
        .mockResolvedValue(undefined);

      await expect(
        service.pauseForIntervention({
          executionId: EXECUTION_ID,
          tenantId: TENANT_ID,
          step,
          sessionId: 'session-pause-tx',
          partialContent: '待确认内容',
          executionType: 'workflow',
        }),
      ).rejects.toThrow('db connection lost');

      expect(mockEventBridge.emitInterventionRequired).not.toHaveBeenCalled();
      expect(enqueueTimeout).not.toHaveBeenCalled();
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
        `intervention-timeout-${STEP_ID}`,
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
          jobId: 'intervention-timeout-step-x',
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
          jobId: 'intervention-timeout-step-x-escalated-2',
        }),
      );
    });

    it('自定义 jobId 不得含 `:`（BullMQ 5 会直接拒绝，导致暂停后抛错）', async () => {
      for (const _ of [0, 1]) {
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
          notifyChannels: ['in_app'],
          source: 'node',
        });
      }

      await service.enqueueInterventionTimeout(
        EXECUTION_ID,
        'step-x',
        TENANT_ID,
      );
      await service.enqueueInterventionTimeout(
        EXECUTION_ID,
        'step-x',
        TENANT_ID,
        { escalated: true, escalationCount: 2 },
      );

      const jobIds = mockQueue.add.mock.calls.map(
        (call) => (call[2] as { jobId: string }).jobId,
      );
      expect(jobIds).toHaveLength(2);
      for (const jobId of jobIds) {
        expect(jobId).not.toContain(':');
      }
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
        'intervention-timeout-019391d4-0000-7000-0000-000000000099',
      );
      for (
        let escalationCount = 1;
        escalationCount <= MAX_ESCALATION_ATTEMPTS;
        escalationCount += 1
      ) {
        expect(mockQueue.getJob).toHaveBeenCalledWith(
          `intervention-timeout-019391d4-0000-7000-0000-000000000099-escalated-${escalationCount}`,
        );
      }
      expect(mockJob.remove).toHaveBeenCalled();
      for (const escalatedJob of escalatedJobs) {
        expect(escalatedJob.remove).toHaveBeenCalled();
      }
    });
  });
});
