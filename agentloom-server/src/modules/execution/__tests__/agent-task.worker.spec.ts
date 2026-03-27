import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { AgentTaskWorker } from '../agent-task.worker';
import { StepStateMachineService } from '../step-state-machine.service';
import { NodeSchedulerService } from '../node-scheduler.service';
import { ThrottleService } from '../services/throttle.service';
import { EventBridgeService } from '../services/event-bridge.service';
import { SessionPersistenceService } from '../services/session-persistence.service';
import { ToolCallStateMachineService } from '../services/tool-call-state-machine.service';
import { InterventionPolicyService } from '../../intervention-policy/intervention-policy.service';
import { LlmEncryptionService } from '../../llm/llm-encryption.service';
import { NotificationService } from '../../notification/notification.service';
import { LlmProviderException } from '../../llm/llm.exceptions';
import { AllModelsFallbackExhaustedException } from '../../smart-routing/smart-routing.exceptions';
import { SmartRoutingService } from '../../smart-routing/smart-routing.service';
import { CircuitBreakerService } from '../../smart-routing/circuit-breaker/circuit-breaker.service';
import { RoutingLearningProducer } from '../../smart-routing/learning/routing-learning.producer';
import { OrganizationAutonomyPolicyService } from '../../organization/organization-autonomy-policy.service';
import {
  AgentExecutionException,
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../execution.exceptions';
import {
  AGENT_TASK_QUEUE,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type AgentTaskJobData,
  type InterventionResolution,
} from '../execution.constants';
import { DRIZZLE } from '../../../database/database.module';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../../agent/ports/agent-runtime.port';
import {
  AGENT_RUNTIME_FACTORY,
  type IAgentAdapterFactory,
} from '../../agent/agent-adapter.factory';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { AgentSession } from '../../agent/types/agent-session.types';
import { MemoryToolsService } from '../../agent-memory/memory-tools.service';
import { MemoryFusionService } from '../../agent-memory/services/memory-fusion.service';

vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../common/interceptors/tenant-transaction.context')
      >();

    return {
      ...actual,
      runInTenantTransaction: vi.fn(
        async (
          db: unknown,
          _tenantId: string,
          operation: (tenantDb: unknown) => Promise<unknown>,
        ) => operation(db),
      ),
    };
  },
);

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000001';
const STEP_ID = '019391d4-d000-7000-0000-000000000002';
const TENANT_ID = 'tenant-001';
const SESSION_ID = 'session-001';
const AGENT_ID = 'agent-001';
const REQUESTED_AT = '2025-01-01T00:00:00.000Z';
const RESOLVED_AT = '2025-01-01T00:05:00.000Z';
const RESOLVED_BY_USER_ID = 'user-operator-001';

function makeInterventionAudit(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    requested_at: REQUESTED_AT,
    resolved_at: RESOLVED_AT,
    action: 'approve',
    instruction: '批准发布',
    resolved_by_user_id: RESOLVED_BY_USER_ID,
    ...overrides,
  };
}

function createMockJob(
  overrides: Partial<Job<AgentTaskJobData>> = {},
): Job<AgentTaskJobData> {
  return {
    data: {
      executionId: EXECUTION_ID,
      stepId: STEP_ID,
      tenantId: TENANT_ID,
    },
    id: 'job-1',
    attemptsMade: 0,
    opts: {},
    ...overrides,
  } as unknown as Job<AgentTaskJobData>;
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: STEP_ID,
    executionId: EXECUTION_ID,
    nodeId: 'node-1',
    stepOrder: 0,
    status: 'queued',
    nodeType: 'agent',
    nodeData: { agentId: AGENT_ID, systemPrompt: '你是一个助手' },
    input: { upstream_node: { answer: '42' } },
    result: null,
    attemptCount: 0,
    checkpointData: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: SESSION_ID,
    agentId: AGENT_ID,
    mode: 'workflow',
    context: { history: [] },
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentSession;
}

async function* createEventStream(
  events: AgentEvent[],
): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

function createSelectChain(result: unknown) {
  const resolvedResult = Array.isArray(result) ? result : [result];
  const limit = vi.fn().mockResolvedValue(resolvedResult);
  const whereResult = Object.assign(Promise.resolve(resolvedResult), { limit });

  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereResult),
      }),
    }),
  };
}

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  return {
    set: vi.fn().mockReturnValue({ where }),
  };
}

describe('AgentTaskWorker', () => {
  let worker: AgentTaskWorker;

  const mockStateMachine: Record<string, ReturnType<typeof vi.fn>> = {
    updateStepStatus: vi.fn().mockResolvedValue(makeStep()),
    updateExecutionStatus: vi.fn().mockResolvedValue(undefined),
    broadcastAgentEvent: vi.fn(),
    broadcastStepRetry: vi.fn(),
  };

  const mockNodeScheduler: Record<string, ReturnType<typeof vi.fn>> = {
    onNodeCompleted: vi.fn().mockResolvedValue(undefined),
    onNodeFailed: vi.fn().mockResolvedValue(undefined),
    enqueueInterventionTimeout: vi.fn().mockResolvedValue(undefined),
    resolveIntervention: vi.fn().mockResolvedValue(undefined),
  };

  const mockThrottle: Record<string, ReturnType<typeof vi.fn>> = {
    bufferOutputChunk: vi.fn(),
  };

  const mockInterventionPolicyService: Record<
    string,
    ReturnType<typeof vi.fn>
  > = {
    resolvePolicy: vi.fn(),
  };

  const mockNotificationService: Record<string, ReturnType<typeof vi.fn>> = {
    create: vi.fn().mockResolvedValue(undefined),
  };

  const mockEventBridge: Record<string, ReturnType<typeof vi.fn>> = {
    emitInterventionRequired: vi.fn(),
    emitToolCallStatus: vi.fn(),
    emitToolPermissionRequired: vi.fn(),
    emitToolPermissionResolved: vi.fn(),
    emitOutputChunk: vi.fn(),
    emitStepAgentEvent: vi.fn(),
  };

  const mockToolCallStateMachine: Record<string, ReturnType<typeof vi.fn>> = {
    transition: vi.fn().mockImplementation((_from: string, to: string) => to),
    isTerminal: vi.fn().mockReturnValue(false),
    getAllowedTransitions: vi.fn().mockReturnValue([]),
  };

  const mockSessionPersistence: Record<string, ReturnType<typeof vi.fn>> = {
    saveToCheckpoint: vi.fn().mockResolvedValue(undefined),
    loadFromCheckpoint: vi.fn().mockResolvedValue(null),
    serializeSession: vi.fn().mockReturnValue({}),
    deserializeSession: vi.fn(),
  };

  const mockAgentRuntime: Record<
    keyof IAgentRuntime,
    ReturnType<typeof vi.fn>
  > = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    registerSessionToolProvider: vi.fn(),
    unregisterSessionToolProvider: vi.fn(),
    resolveToolPermission: vi.fn(),
    registerSessionMetadata: vi.fn(),
  };

  const mockSandboxRuntime: Record<
    keyof IAgentRuntime,
    ReturnType<typeof vi.fn>
  > = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    registerSessionToolProvider: vi.fn(),
    unregisterSessionToolProvider: vi.fn(),
    resolveToolPermission: vi.fn(),
    registerSessionMetadata: vi.fn(),
  };

  const selectAdapterSpy = vi.fn((hasSandbox: boolean) =>
    hasSandbox
      ? (mockSandboxRuntime as unknown as IAgentRuntime)
      : (mockAgentRuntime as unknown as IAgentRuntime),
  );

  const selectAdapter: IAgentAdapterFactory['selectAdapter'] = (hasSandbox) =>
    selectAdapterSpy(hasSandbox);

  const mockAdapterFactory: IAgentAdapterFactory = {
    selectAdapter,
  };

  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };

  const mockAgentTaskQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  };

  const mockSmartRoutingService = {
    recordDecision: vi.fn().mockResolvedValue('routing-decision-2'),
  };

  const mockCircuitBreakerService = {
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };

  const mockRoutingLearningProducer = {
    enqueueLearningJob: vi.fn().mockResolvedValue(undefined),
  };

  const mockOrganizationAutonomyPolicyService: Record<
    string,
    ReturnType<typeof vi.fn>
  > = {
    resolveAutonomyCapForTenant: vi.fn().mockResolvedValue('LLM_SUGGEST'),
  };

  const mockMemoryToolsService = {
    createSessionToolProvider: vi.fn(),
  };

  const mockMemoryFusionService = {
    bootAll: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockDb.select.mockReset();
    mockDb.update.mockReset().mockReturnValue(createUpdateChain());
    mockAgentTaskQueue.add.mockReset().mockResolvedValue(undefined);
    mockSmartRoutingService.recordDecision
      .mockReset()
      .mockResolvedValue('routing-decision-2');
    mockCircuitBreakerService.recordSuccess
      .mockReset()
      .mockResolvedValue(undefined);
    mockCircuitBreakerService.recordFailure
      .mockReset()
      .mockResolvedValue(undefined);
    mockRoutingLearningProducer.enqueueLearningJob
      .mockReset()
      .mockResolvedValue(undefined);
    mockOrganizationAutonomyPolicyService.resolveAutonomyCapForTenant
      .mockReset()
      .mockResolvedValue('LLM_SUGGEST');
    mockMemoryToolsService.createSessionToolProvider.mockReset();
    mockMemoryFusionService.bootAll.mockReset();
    mockNodeScheduler.onNodeCompleted.mockReset().mockResolvedValue(undefined);
    mockNodeScheduler.onNodeFailed.mockReset().mockResolvedValue(undefined);
    mockNodeScheduler.enqueueInterventionTimeout
      .mockReset()
      .mockResolvedValue(undefined);
    mockNodeScheduler.resolveIntervention
      .mockReset()
      .mockResolvedValue(undefined);
    mockNotificationService.create.mockReset().mockResolvedValue(undefined);
    mockInterventionPolicyService.resolvePolicy.mockResolvedValue({
      allowedRoles: ['owner', 'admin'],
      timeoutSeconds: 86400,
      timeoutAction: 'reject',
      escalateToRole: null,
      notifyChannels: ['in_app'],
      source: 'system_default',
    });

    const module = await Test.createTestingModule({
      providers: [
        AgentTaskWorker,
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
        {
          provide: InterventionPolicyService,
          useValue: mockInterventionPolicyService,
        },
        { provide: NotificationService, useValue: mockNotificationService },
        {
          provide: LlmEncryptionService,
          useValue: {
            isE2EEEnabled: vi.fn().mockResolvedValue(false),
            encryptForTenant: vi.fn(),
          },
        },
        { provide: SmartRoutingService, useValue: mockSmartRoutingService },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: RoutingLearningProducer,
          useValue: mockRoutingLearningProducer,
        },
        {
          provide: OrganizationAutonomyPolicyService,
          useValue: mockOrganizationAutonomyPolicyService,
        },
        { provide: ThrottleService, useValue: mockThrottle },
        { provide: EventBridgeService, useValue: mockEventBridge },
        {
          provide: ToolCallStateMachineService,
          useValue: mockToolCallStateMachine,
        },
        {
          provide: SessionPersistenceService,
          useValue: mockSessionPersistence,
        },
        { provide: AGENT_RUNTIME, useValue: mockAgentRuntime },
        { provide: AGENT_RUNTIME_FACTORY, useValue: mockAdapterFactory },
        { provide: DRIZZLE, useValue: mockDb },
        {
          provide: getQueueToken(AGENT_TASK_QUEUE),
          useValue: mockAgentTaskQueue,
        },
        { provide: MemoryToolsService, useValue: mockMemoryToolsService },
        { provide: MemoryFusionService, useValue: mockMemoryFusionService },
      ],
    }).compile();

    worker = module.get(AgentTaskWorker);
  });

  describe('process', () => {
    it('会创建携带 workflow 上下文元数据的 session，并以 JSON 文本块调用 prompt', async () => {
      const input = { source: { text: 'hello' } };
      const step = makeStep({
        input,
        nodeData: {
          agentId: AGENT_ID,
          systemPrompt: '你是翻译专家',
          autonomyMode: 'LLM_SUGGEST',
          llmModelConfigId: 'model-config-001',
        },
      });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith({
        agentId: AGENT_ID,
        mode: 'workflow',
        tenantId: TENANT_ID,
        llmModelConfigId: 'model-config-001',
        systemPrompt: '你是翻译专家',
        autonomyMode: 'LLM_SUGGEST',
        context: {
          executionId: EXECUTION_ID,
          hasSandbox: false,
          input,
          nodeId: 'node-1',
          stepId: STEP_ID,
          tenantId: TENANT_ID,
        },
      });
      expect(mockAgentRuntime.prompt).toHaveBeenCalledWith(SESSION_ID, [
        { type: 'text', text: JSON.stringify(input) },
      ]);
      expect(runInTenantTransaction).toHaveBeenCalledWith(
        mockDb,
        TENANT_ID,
        expect.any(Function),
      );
    });

    it('存在 memory session 时会在 createSession 前注入 boot prompt 并注册 session tools', async () => {
      const input = { source: { text: 'hello' } };
      const step = makeStep({
        input,
        nodeData: {
          agentId: AGENT_ID,
          systemPrompt: '原始系统提示',
          autonomyMode: 'LLM_SUGGEST',
          llmModelConfigId: 'model-config-001',
        },
      });
      const toolProvider = vi.fn();

      mockDb.select.mockReturnValue(createSelectChain(step));
      mockMemoryFusionService.bootAll.mockResolvedValue({
        systemPrompt: 'memory-system-prompt',
        boot: 'memory-boot',
        index: [
          {
            domain: 'core',
            pathString: 'profile/name',
          },
        ],
        glossary: [{ keyword: 'fox', nodeId: 'node-1' }],
      });
      mockMemoryToolsService.createSessionToolProvider.mockReturnValue(
        toolProvider,
      );
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            workflowContext: {
              memorySessionIds: ['memory-session-1'],
            },
          },
        }),
      );

      expect(mockMemoryFusionService.bootAll).toHaveBeenCalledWith([
        'memory-session-1',
      ]);
      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith({
        agentId: AGENT_ID,
        mode: 'workflow',
        tenantId: TENANT_ID,
        llmModelConfigId: 'model-config-001',
        systemPrompt:
          'memory-system-prompt\n\n## Memory Boot\nmemory-boot\n\n## Memory Index\n- core://profile/name\n\n## Memory Glossary\n- fox -> node:node-1\n\n原始系统提示',
        autonomyMode: 'LLM_SUGGEST',
        context: {
          executionId: EXECUTION_ID,
          hasSandbox: false,
          input,
          nodeId: 'node-1',
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          memorySessionIds: ['memory-session-1'],
        },
      });
      expect(
        mockMemoryToolsService.createSessionToolProvider,
      ).toHaveBeenCalledWith(['memory-session-1']);
      expect(mockAgentRuntime.registerSessionToolProvider).toHaveBeenCalledWith(
        SESSION_ID,
        toolProvider,
      );
    });

    it('memory boot 加载失败时会降级为原始 systemPrompt', async () => {
      const step = makeStep({
        nodeData: {
          agentId: AGENT_ID,
          systemPrompt: '原始系统提示',
          autonomyMode: 'LLM_SUGGEST',
          llmModelConfigId: 'model-config-001',
        },
      });

      mockDb.select.mockReturnValue(createSelectChain(step));
      mockMemoryFusionService.bootAll.mockRejectedValue(
        new Error('boot failed'),
      );
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            workflowContext: {
              memorySessionIds: ['memory-session-1'],
            },
          },
        }),
      );

      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: '原始系统提示',
        }),
      );
    });

    it('smart-routing 成功完成后会记录 circuit breaker success 并异步入队 learning job', async () => {
      const step = makeStep({
        nodeData: {
          agentId: AGENT_ID,
          llmModelConfigId: 'model-2',
        },
      });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'message_chunk', content: '成功结果' } as AgentEvent,
          { type: 'done', stopReason: 'end_turn' } as AgentEvent,
        ]),
      );

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            nodeData: { agentId: AGENT_ID, llmModelConfigId: 'model-2' },
            smartRouting: {
              routingStepId: 'step-routing',
              routingNodeId: 'routing-node-1',
              strategy: 'fallback_chain',
              candidateModelIds: ['model-1', 'model-2'],
              currentModelIndex: 1,
              selectedModelId: 'model-2',
              routerType: 'fallback_chain',
              routingDecisionId: 'routing-decision-2',
              queryText: '请总结成功结果',
              taskCategory: 'summary',
              evaluatedModels: [
                {
                  modelId: 'model-2',
                  modelName: 'claude-sonnet-4-20250514',
                  provider: 'anthropic',
                  score: 95,
                  reasoning: '备用模型成功',
                },
              ],
            },
          },
        }),
      );

      expect(mockCircuitBreakerService.recordSuccess).toHaveBeenCalledWith(
        TENANT_ID,
        'anthropic',
        'model-2',
      );
      expect(
        mockRoutingLearningProducer.enqueueLearningJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          executionStepId: STEP_ID,
          routingDecisionId: 'routing-decision-2',
          selectedModelId: 'model-2',
          queryText: '请总结成功结果',
          taskCategory: 'summary',
          actualPerformance: expect.objectContaining({
            success: true,
          }),
        }),
      );
    });

    it('会广播 decision/intervention_required 事件，并转为 waiting_intervention', async () => {
      const events: AgentEvent[] = [
        { type: 'plan', title: '分析', content: '先整理输入' },
        { type: 'message_chunk', content: '建议给主人展示摘要' },
        {
          type: 'decision',
          suggestedContent: '建议给主人展示摘要',
          confidence: 0.8,
        },
        { type: 'done', stopReason: 'intervention_required' },
      ];

      mockDb.select.mockReturnValue(
        createSelectChain(
          makeStep({
            checkpointData: {
              attempts: [
                {
                  attempt: 1,
                  error: '第一次失败',
                  timestamp: '2025-01-01T00:00:00.000Z',
                },
                {
                  attempt: 2,
                  error: '第二次失败',
                  timestamp: '2025-01-01T00:01:00.000Z',
                },
                {
                  attempt: 3,
                  error: '第三次失败',
                  timestamp: '2025-01-01T00:02:00.000Z',
                },
              ],
            },
          }),
        ),
      );
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(createEventStream(events));

      await worker.process(createMockJob());

      expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledTimes(1);
      expect(mockEventBridge.emitOutputChunk).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: STEP_ID,
          chunk: '建议给主人展示摘要',
          index: 1,
        },
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
        expect.objectContaining({
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '建议给主人展示摘要',
            stopReason: 'intervention_required',
            interventionRequestedAt: expect.any(String),
            interventionNodeName: 'node-1',
            decision: {
              suggestedContent: '建议给主人展示摘要',
              confidence: 0.8,
            },
          },
          result: {
            content: '建议给主人展示摘要',
            stopReason: 'intervention_required',
            decision: {
              suggestedContent: '建议给主人展示摘要',
              confidence: 0.8,
            },
          },
        }),
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockEventBridge.emitInterventionRequired).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        {
          stepId: STEP_ID,
          nodeId: 'node-1',
          nodeName: 'node-1',
          decision: {
            suggestedContent: '建议给主人展示摘要',
            confidence: 0.8,
          },
          partialContent: '建议给主人展示摘要',
          requestedAt: expect.any(String),
        },
      );
      expect(mockNodeScheduler.enqueueInterventionTimeout).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
    });

    it('会在 max_tokens 时完成步骤并保留 stopReason', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'message_chunk', content: '截断的内容' },
          { type: 'done', stopReason: 'max_tokens' },
        ]),
      );

      await worker.process(createMockJob());

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        { result: { content: '截断的内容', stopReason: 'max_tokens' } },
      );
      expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('可重试错误会回退到 pending 并广播 step:retrying，而不是立即级联失败', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '部分结果' } as AgentEvent;
          throw new Error('LLM 调用失败');
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            attemptsMade: 0,
            opts: { attempts: 4 },
          }),
        ),
      ).rejects.toThrow('LLM 调用失败');

      expect(mockDb.update).toHaveBeenCalled();
      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg).toEqual({ attemptCount: 1 });

      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID,
        STEP_ID,
        'pending',
        {
          errorMessage: expect.objectContaining({ message: 'LLM 调用失败' }),
          checkpointData: expect.objectContaining({
            partialContent: '部分结果',
            sessionId: SESSION_ID,
            session: {},
            attempts: [
              {
                attempt: 1,
                error: 'LLM 调用失败',
                timestamp: expect.any(String),
              },
            ],
          }),
        },
      );
      expect(mockStateMachine.broadcastStepRetry).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        {
          attempt: 1,
          maxAttempts: 4,
          errorMessage: 'LLM 调用失败',
        },
      );
      expect(mockNodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('最终失败时才将步骤标记为 failed 并触发级联', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield {
            type: 'message_chunk',
            content: '最后一次尝试',
          } as AgentEvent;
          throw new Error('最终失败');
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            attemptsMade: 3,
            opts: { attempts: 4 },
          }),
        ),
      ).rejects.toThrow('最终失败');

      expect(mockDb.update).toHaveBeenCalled();

      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: expect.objectContaining({
            message: '最终失败',
            attempts: expect.arrayContaining([
              expect.objectContaining({
                attempt: 4,
                error: '最终失败',
              }),
            ]),
          }),
          checkpointData: expect.objectContaining({
            partialContent: '最后一次尝试',
            sessionId: SESSION_ID,
            session: {},
            attempts: expect.arrayContaining([
              expect.objectContaining({
                attempt: 4,
                error: '最终失败',
              }),
            ]),
          }),
        },
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('FALLBACK_CHAIN 在非认证失败且仍有候选模型时会切换到下一个模型重新排队', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '部分结果' } as AgentEvent;
          throw new Error('model-1 failed');
        })(),
      );

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            nodeData: { agentId: AGENT_ID, llmModelConfigId: 'model-1' },
            smartRouting: {
              routingStepId: 'step-routing',
              routingNodeId: 'routing-node-1',
              strategy: 'FALLBACK_CHAIN',
              candidateModelIds: ['model-1', 'model-2'],
              currentModelIndex: 0,
              selectedModelId: 'model-1',
              routerType: 'fallback_chain',
              routingDecisionId: 'routing-decision-1',
              queryText: '请总结部分结果',
              taskCategory: 'summary',
              evaluatedModels: [
                {
                  modelId: 'model-1',
                  modelName: 'gpt-4o',
                  provider: 'openai',
                  score: 100,
                  reasoning: '回退链位置 #1',
                },
                {
                  modelId: 'model-2',
                  modelName: 'claude-sonnet-4-20250514',
                  provider: 'anthropic',
                  score: 90,
                  reasoning: '回退链位置 #2',
                },
              ],
            },
          },
          attemptsMade: 0,
          opts: { attempts: 1 },
        }),
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID,
        STEP_ID,
        'pending',
        expect.objectContaining({
          checkpointData: expect.objectContaining({
            smartRouting: expect.objectContaining({
              routingStepId: 'step-routing',
              routingNodeId: 'routing-node-1',
              strategy: 'FALLBACK_CHAIN',
              candidateModelIds: ['model-1', 'model-2'],
              currentModelIndex: 1,
              selectedModelId: 'model-2',
              routerType: 'fallback_chain',
              routingDecisionId: 'routing-decision-2',
              queryText: '请总结部分结果',
              taskCategory: 'summary',
              evaluatedModels: [
                {
                  modelId: 'model-1',
                  modelName: 'gpt-4o',
                  provider: 'openai',
                  score: 100,
                  reasoning: '回退链位置 #1',
                },
                {
                  modelId: 'model-2',
                  modelName: 'claude-sonnet-4-20250514',
                  provider: 'anthropic',
                  score: 90,
                  reasoning: '回退链位置 #2',
                },
              ],
            }),
            attempts: [
              expect.objectContaining({ attempt: 1, error: 'model-1 failed' }),
            ],
          }),
          errorMessage: expect.objectContaining({
            message: 'model-1 failed',
            nodeId: 'node-1',
          }),
        }),
      );
      expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        {
          type: 'message_chunk',
          content: '模型 model-1 调用失败，已切换到备用模型 model-2。',
        },
      );
      expect(mockStateMachine.broadcastStepRetry).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 2,
          errorMessage: expect.stringContaining('已切换到备用模型 model-2'),
        }),
      );
      expect(mockSmartRoutingService.recordDecision).toHaveBeenCalledWith(
        'step-routing',
        TENANT_ID,
        'routing-node-1',
        expect.objectContaining({
          selectedModelId: 'model-2',
          strategy: 'FALLBACK_CHAIN',
          routerType: 'fallback_chain',
          reasoning: expect.stringContaining('前序失败记录'),
          evaluatedModels: expect.arrayContaining([
            expect.objectContaining({ modelId: 'model-2', score: 100 }),
          ]),
        }),
      );
      expect(mockCircuitBreakerService.recordFailure).toHaveBeenCalledWith(
        TENANT_ID,
        'openai',
        'model-1',
      );
      expect(
        mockRoutingLearningProducer.enqueueLearningJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          executionStepId: STEP_ID,
          routingDecisionId: 'routing-decision-1',
          selectedModelId: 'model-1',
          queryText: '请总结部分结果',
          taskCategory: 'summary',
          actualPerformance: expect.objectContaining({
            success: false,
            errorType: 'Error',
          }),
        }),
      );
      expect(mockAgentTaskQueue.add).toHaveBeenCalledWith(
        'agent-task',
        expect.objectContaining({
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          nodeData: { agentId: AGENT_ID, llmModelConfigId: 'model-2' },
          smartRouting: {
            routingStepId: 'step-routing',
            routingNodeId: 'routing-node-1',
            strategy: 'FALLBACK_CHAIN',
            candidateModelIds: ['model-1', 'model-2'],
            currentModelIndex: 1,
            selectedModelId: 'model-2',
            routerType: 'fallback_chain',
            routingDecisionId: 'routing-decision-2',
            queryText: '请总结部分结果',
            taskCategory: 'summary',
            evaluatedModels: [
              {
                modelId: 'model-1',
                modelName: 'gpt-4o',
                provider: 'openai',
                score: 100,
                reasoning: '回退链位置 #1',
              },
              {
                modelId: 'model-2',
                modelName: 'claude-sonnet-4-20250514',
                provider: 'anthropic',
                score: 90,
                reasoning: '回退链位置 #2',
              },
            ],
          },
        }),
        { attempts: 1 },
      );
      expect(mockNodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('认证失败时禁止 fallback，并直接进入最终 failed', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '准备失败' } as AgentEvent;
          throw new LlmProviderException('openai', '认证失败', {
            authenticationFailed: true,
          });
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              smartRouting: {
                routingStepId: 'step-routing',
                routingNodeId: 'routing-node-1',
                strategy: 'FALLBACK_CHAIN',
                candidateModelIds: ['model-1', 'model-2'],
                currentModelIndex: 0,
                selectedModelId: 'model-1',
                routerType: 'fallback_chain',
                routingDecisionId: 'routing-decision-1',
                queryText: '请总结部分结果',
                taskCategory: 'summary',
                evaluatedModels: [
                  {
                    modelId: 'model-1',
                    modelName: 'gpt-4o',
                    provider: 'openai',
                    score: 100,
                    reasoning: '回退链位置 #1',
                  },
                  {
                    modelId: 'model-2',
                    modelName: 'claude-sonnet-4-20250514',
                    provider: 'anthropic',
                    score: 90,
                    reasoning: '回退链位置 #2',
                  },
                ],
              },
            },
            attemptsMade: 0,
            opts: { attempts: 1 },
          }),
        ),
      ).rejects.toBeInstanceOf(LlmProviderException);

      expect(mockAgentTaskQueue.add).not.toHaveBeenCalled();
      expect(mockSmartRoutingService.recordDecision).not.toHaveBeenCalled();
      expect(mockCircuitBreakerService.recordFailure).toHaveBeenCalledWith(
        TENANT_ID,
        'openai',
        'model-1',
      );
      expect(
        mockRoutingLearningProducer.enqueueLearningJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          routingDecisionId: 'routing-decision-1',
          selectedModelId: 'model-1',
          actualPerformance: expect.objectContaining({
            success: false,
            errorType: 'LlmProviderException',
          }),
        }),
      );
      expect(mockStateMachine.broadcastAgentEvent).not.toHaveBeenCalled();
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            message: 'LLM 提供商错误',
            detail: '认证失败',
            type: 'https://agentloom.dev/errors/llm/provider-error',
            attempts: [
              expect.objectContaining({
                attempt: 1,
                error: 'LLM 提供商错误',
              }),
            ],
          }),
        }),
      );
    });

    it('候选模型耗尽时抛出 AllModelsFallbackExhaustedException', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield {
            type: 'message_chunk',
            content: '最后一次候选尝试',
          } as AgentEvent;
          throw new Error('last candidate failed');
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              smartRouting: {
                routingStepId: 'step-routing',
                routingNodeId: 'routing-node-1',
                strategy: 'FALLBACK_CHAIN',
                candidateModelIds: ['model-1', 'model-2'],
                currentModelIndex: 1,
                selectedModelId: 'model-2',
                routerType: 'fallback_chain',
                routingDecisionId: 'routing-decision-2',
                evaluatedModels: [
                  {
                    modelId: 'model-1',
                    modelName: 'gpt-4o',
                    provider: 'openai',
                    score: 100,
                    reasoning: '回退链位置 #1',
                  },
                  {
                    modelId: 'model-2',
                    modelName: 'claude-sonnet-4-20250514',
                    provider: 'anthropic',
                    score: 90,
                    reasoning: '回退链位置 #2',
                  },
                ],
              },
            },
            attemptsMade: 0,
            opts: { attempts: 1 },
          }),
        ),
      ).rejects.toBeInstanceOf(AllModelsFallbackExhaustedException);

      expect(mockAgentTaskQueue.add).not.toHaveBeenCalled();
      expect(mockSmartRoutingService.recordDecision).not.toHaveBeenCalled();
      expect(mockCircuitBreakerService.recordFailure).toHaveBeenCalledWith(
        TENANT_ID,
        'anthropic',
        'model-2',
      );
      expect(
        mockRoutingLearningProducer.enqueueLearningJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          routingDecisionId: 'routing-decision-2',
          selectedModelId: 'model-2',
          actualPerformance: expect.objectContaining({
            success: false,
            errorType: 'Error',
          }),
        }),
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            type: 'https://agentloom.dev/errors/routing/fallback-exhausted',
            message: '所有模型已耗尽',
          }),
        }),
      );
    });

    it('非 FALLBACK_CHAIN 策略失败时保留原始错误，不伪装成 exhausted', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue(mockSetChain),
      });
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield {
            type: 'message_chunk',
            content: '普通策略失败',
          } as AgentEvent;
          throw new Error('quality-first failed');
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              smartRouting: {
                routingStepId: 'step-routing',
                routingNodeId: 'routing-node-1',
                strategy: 'QUALITY_FIRST',
                candidateModelIds: ['model-1'],
                currentModelIndex: 0,
                selectedModelId: 'model-1',
                routerType: 'quality_first',
                routingDecisionId: 'routing-decision-3',
                evaluatedModels: [
                  {
                    modelId: 'model-1',
                    modelName: 'gpt-4o',
                    provider: 'openai',
                    score: 100,
                    reasoning: '质量优先选择',
                  },
                ],
              },
            },
            attemptsMade: 0,
            opts: { attempts: 1 },
          }),
        ),
      ).rejects.toThrow('quality-first failed');

      expect(mockAgentTaskQueue.add).not.toHaveBeenCalled();
      expect(mockSmartRoutingService.recordDecision).not.toHaveBeenCalled();
      expect(mockCircuitBreakerService.recordFailure).toHaveBeenCalledWith(
        TENANT_ID,
        'openai',
        'model-1',
      );
      expect(
        mockRoutingLearningProducer.enqueueLearningJob,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          routingDecisionId: 'routing-decision-3',
          selectedModelId: 'model-1',
          actualPerformance: expect.objectContaining({
            success: false,
            errorType: 'Error',
          }),
        }),
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
      const lastUpdateStepStatusCall =
        mockStateMachine.updateStepStatus.mock.calls.at(-1);

      expect(lastUpdateStepStatusCall?.[0]).toBe(TENANT_ID);
      expect(lastUpdateStepStatusCall?.[1]).toBe(STEP_ID);
      expect(lastUpdateStepStatusCall?.[2]).toBe('failed');
      expect(lastUpdateStepStatusCall?.[3]).toEqual(
        expect.objectContaining({
          errorMessage: expect.objectContaining({
            message: 'quality-first failed',
          }),
        }),
      );
      expect(lastUpdateStepStatusCall?.[3]?.errorMessage?.type).not.toBe(
        'https://agentloom.dev/errors/routing/fallback-exhausted',
      );
    });

    it('step 不属于 execution 时应拒绝处理', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain(
          makeStep({
            executionId: '019391d4-d000-7000-0000-000000009999',
          }),
        ),
      );

      await expect(worker.process(createMockJob())).rejects.toThrow(
        AgentExecutionException,
      );

      expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockStateMachine.updateExecutionStatus).not.toHaveBeenCalled();
      expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
    });

    it('approve 干预会直接完成步骤，不再重新调用 runtime', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '草稿',
          stopReason: 'intervention_required',
          interventionRequestedAt: REQUESTED_AT,
          interventionNodeName: 'node-1',
          decision: { suggestedContent: '建议稿', confidence: 0.9 },
          intervention: makeInterventionAudit(),
        },
      });
      const intervention: InterventionResolution = {
        action: 'approve',
        feedback: '批准发布',
        requestedAt: REQUESTED_AT,
        resolvedAt: RESOLVED_AT,
        resolvedByUserId: RESOLVED_BY_USER_ID,
      };

      mockDb.select.mockReturnValue(createSelectChain(step));

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            resumeSessionId: SESSION_ID,
            intervention,
          },
        }),
      );

      expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
      expect(mockAgentRuntime.prompt).not.toHaveBeenCalled();
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        {
          result: {
            content: '建议稿',
            intervention: {
              action: 'approve',
              feedback: '批准发布',
            },
            stopReason: 'intervention_required',
            decision: { suggestedContent: '建议稿', confidence: 0.9 },
          },
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '草稿',
            stopReason: 'intervention_required',
            interventionRequestedAt: REQUESTED_AT,
            interventionNodeName: 'node-1',
            decision: { suggestedContent: '建议稿', confidence: 0.9 },
            intervention: makeInterventionAudit(),
          },
        },
      );
      expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('approve 干预会保留结构化 suggestedContent 作为最终输出', async () => {
      const structuredSuggestion = {
        summary: '建议稿',
        tags: ['safe', 'reviewed'],
      };
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '草稿',
          stopReason: 'intervention_required',
          interventionRequestedAt: REQUESTED_AT,
          interventionNodeName: 'node-1',
          decision: { suggestedContent: structuredSuggestion, confidence: 0.9 },
          intervention: makeInterventionAudit(),
        },
      });

      mockDb.select.mockReturnValue(createSelectChain(step));

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            resumeSessionId: SESSION_ID,
            intervention: {
              action: 'approve',
              requestedAt: REQUESTED_AT,
              resolvedAt: RESOLVED_AT,
              resolvedByUserId: RESOLVED_BY_USER_ID,
            },
          },
        }),
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            content: structuredSuggestion,
          }),
        }),
      );
    });

    it('modify 干预会优先使用 modifiedContent 作为最终输出', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '草稿',
          stopReason: 'intervention_required',
          interventionRequestedAt: REQUESTED_AT,
          interventionNodeName: 'node-1',
          decision: { suggestedContent: '建议稿' },
          intervention: makeInterventionAudit({
            action: 'modify',
            instruction: '人工改写后的版本',
          }),
        },
      });
      const intervention: InterventionResolution = {
        action: 'modify',
        modifiedContent: '人工改写后的版本',
        requestedAt: REQUESTED_AT,
        resolvedAt: RESOLVED_AT,
        resolvedByUserId: RESOLVED_BY_USER_ID,
      };

      mockDb.select.mockReturnValue(createSelectChain(step));

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            resumeSessionId: SESSION_ID,
            intervention,
          },
        }),
      );

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        expect.objectContaining({
          result: expect.objectContaining({
            content: '人工改写后的版本',
            intervention: {
              action: 'modify',
              modifiedContent: '人工改写后的版本',
            },
          }),
          checkpointData: expect.objectContaining({
            intervention: makeInterventionAudit({
              action: 'modify',
              instruction: '人工改写后的版本',
            }),
          }),
        }),
      );
    });

    it('reject 干预会直接失败并触发级联', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '草稿',
          interventionRequestedAt: REQUESTED_AT,
          interventionNodeName: 'node-1',
          intervention: makeInterventionAudit({
            action: 'reject',
            instruction: '内容不符合要求',
          }),
        },
      });
      const intervention: InterventionResolution = {
        action: 'reject',
        feedback: '内容不符合要求',
        requestedAt: REQUESTED_AT,
        resolvedAt: RESOLVED_AT,
        resolvedByUserId: RESOLVED_BY_USER_ID,
      };

      mockDb.select.mockReturnValue(createSelectChain(step));

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            resumeSessionId: SESSION_ID,
            intervention,
          },
        }),
      );

      expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
      expect(mockAgentRuntime.prompt).not.toHaveBeenCalled();
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: {
            message: '内容不符合要求',
            type: 'urn:agentloom:execution:intervention-rejected',
            title: '人工干预拒绝',
            nodeId: 'node-1',
          },
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '草稿',
            interventionRequestedAt: REQUESTED_AT,
            interventionNodeName: 'node-1',
            intervention: makeInterventionAudit({
              action: 'reject',
              instruction: '内容不符合要求',
            }),
          },
        },
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('intervention-timeout 会按 resolved policy=reject 自动拒绝', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: { sessionId: SESSION_ID },
      });
      mockDb.select
        .mockReturnValueOnce(createSelectChain(step))
        .mockReturnValueOnce(
          createSelectChain({
            workflowDefinitionId: 'workflow-1',
            workflowName: '审核工作流',
          }),
        );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 1200,
        timeoutAction: 'reject',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        source: 'workflow',
      });

      await worker.process(
        createMockJob({
          name: 'intervention-timeout',
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
          },
        }),
      );

      expect(mockNodeScheduler.resolveIntervention).toHaveBeenCalledWith(
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
      expect(mockInterventionPolicyService.resolvePolicy).toHaveBeenCalledWith(
        TENANT_ID,
        'workflow-1',
        'node-1',
      );
    });

    it('intervention-timeout 会按 resolved policy=approve 自动批准', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: { sessionId: SESSION_ID },
      });
      mockDb.select
        .mockReturnValueOnce(createSelectChain(step))
        .mockReturnValueOnce(
          createSelectChain({
            workflowDefinitionId: 'workflow-approve-1',
            workflowName: '自动批准流',
          }),
        );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 60,
        timeoutAction: 'approve',
        escalateToRole: null,
        notifyChannels: ['in_app'],
        source: 'workflow',
      });

      await worker.process(
        createMockJob({
          name: 'intervention-timeout',
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
          },
        }),
      );

      expect(mockNodeScheduler.resolveIntervention).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
        {
          action: 'approve',
          feedback: '干预超时，系统自动批准',
          timeout: true,
        },
      );
    });

    it('intervention-timeout 会按 resolved policy=escalate 通知目标角色并重新排队', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: { sessionId: SESSION_ID },
        nodeData: { label: '法务复核节点' },
      });
      mockDb.select
        .mockReturnValueOnce(createSelectChain(step))
        .mockReturnValueOnce(
          createSelectChain({
            workflowDefinitionId: 'workflow-escalate-1',
            workflowName: '法务审批流',
          }),
        )
        .mockReturnValueOnce(
          createSelectChain([
            { userId: 'owner-user-1' },
            { userId: 'owner-user-2' },
          ]),
        );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 300,
        timeoutAction: 'escalate',
        escalateToRole: 'owner',
        notifyChannels: ['in_app', 'push', 'email'],
        source: 'node',
      });

      await worker.process(
        createMockJob({
          name: 'intervention-timeout',
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
          },
        }),
      );

      expect(mockNodeScheduler.resolveIntervention).not.toHaveBeenCalled();
      expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationService.create).toHaveBeenNthCalledWith(
        1,
        TENANT_ID,
        {
          userId: 'owner-user-1',
          type: 'system',
          title: '节点人工干预已升级',
          body: {
            workflowId: 'workflow-escalate-1',
            workflowName: '法务审批流',
            executionId: EXECUTION_ID,
            nodeId: 'node-1',
            nodeName: '法务复核节点',
            timelineUrl: `/executions/${EXECUTION_ID}`,
            notifyChannels: ['in_app', 'push', 'email'],
            escalationCount: 1,
          },
        },
      );
      expect(mockNotificationService.create).toHaveBeenNthCalledWith(
        2,
        TENANT_ID,
        {
          userId: 'owner-user-2',
          type: 'system',
          title: '节点人工干预已升级',
          body: {
            workflowId: 'workflow-escalate-1',
            workflowName: '法务审批流',
            executionId: EXECUTION_ID,
            nodeId: 'node-1',
            nodeName: '法务复核节点',
            timelineUrl: `/executions/${EXECUTION_ID}`,
            notifyChannels: ['in_app', 'push', 'email'],
            escalationCount: 1,
          },
        },
      );
      expect(mockNodeScheduler.enqueueInterventionTimeout).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        {
          escalated: true,
          escalationCount: 1,
        },
      );
    });

    it('升级次数达到 3 后下一次超时应自动拒绝', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: { sessionId: SESSION_ID },
      });
      mockDb.select
        .mockReturnValueOnce(createSelectChain(step))
        .mockReturnValueOnce(
          createSelectChain({
            workflowDefinitionId: 'workflow-escalate-limit',
            workflowName: '升级上限流',
          }),
        );
      mockInterventionPolicyService.resolvePolicy.mockResolvedValueOnce({
        allowedRoles: ['owner', 'admin'],
        timeoutSeconds: 300,
        timeoutAction: 'escalate',
        escalateToRole: 'admin',
        notifyChannels: ['in_app'],
        source: 'workflow',
      });

      await worker.process(
        createMockJob({
          name: 'intervention-timeout',
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            escalationCount: 3,
          },
        }),
      );

      expect(mockNotificationService.create).not.toHaveBeenCalled();
      expect(
        mockNodeScheduler.enqueueInterventionTimeout,
      ).not.toHaveBeenCalled();
      expect(mockNodeScheduler.resolveIntervention).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
        {
          action: 'reject',
          feedback: '干预升级达到上限，系统自动拒绝',
          timeout: true,
        },
      );
    });

    it('intervention-timeout 任务在步骤已非 waiting_intervention 时跳过', async () => {
      const step = makeStep({ status: 'completed' });
      mockDb.select.mockReturnValue(createSelectChain(step));

      await worker.process(
        createMockJob({
          name: 'intervention-timeout',
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
          },
        }),
      );

      expect(mockNodeScheduler.resolveIntervention).not.toHaveBeenCalled();
    });

    it('hasSandbox 为 true 时应使用 adapterFactory 选择沙箱适配器', async () => {
      const step = makeStep();
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockSandboxRuntime.createSession.mockResolvedValue(makeSession());
      mockSandboxRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(
        createMockJob({
          data: {
            executionId: EXECUTION_ID,
            stepId: STEP_ID,
            tenantId: TENANT_ID,
            hasSandbox: true,
          },
        }),
      );

      expect(selectAdapterSpy).toHaveBeenCalledWith(true);
      expect(mockSandboxRuntime.createSession).toHaveBeenCalled();
      expect(mockSandboxRuntime.prompt).toHaveBeenCalled();
      expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('失败钩子只记录日志，不再二次改状态或级联', async () => {
      await worker.onFailed(createMockJob(), new Error('Worker 处理失败'));

      expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalled();
      expect(mockNodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('job 不存在时也能优雅返回', async () => {
      await expect(
        worker.onFailed(undefined, new Error('未知错误')),
      ).resolves.not.toThrow();
    });
  });

  describe('tool_use handling', () => {
    describe('loadPartialContentFromCheckpoint（通过 process + resumeSessionId）', () => {
      it('resumeSessionId + checkpointData.partialContent 会作为 accumulatedContent 起始值', async () => {
        const step = makeStep({
          status: 'waiting_intervention',
          checkpointData: {
            partialContent: 'previous content',
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'awaiting_permission',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([
            { type: 'message_chunk', content: ' + next' },
            { type: 'done', stopReason: 'end_turn' },
          ]),
        );

        await worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              resumeSessionId: SESSION_ID,
              toolPermission: { toolCallId: 'tc-1', action: 'approve' },
            },
          }),
        );

        expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
          TENANT_ID,
          STEP_ID,
          'completed',
          {
            result: { content: 'previous content + next' },
          },
        );
      });

      it('resumeSessionId + checkpointData 无 partialContent 时从空字符串开始', async () => {
        const step = makeStep({
          status: 'waiting_intervention',
          checkpointData: {
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'awaiting_permission',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([
            { type: 'message_chunk', content: 'fresh' },
            { type: 'done', stopReason: 'end_turn' },
          ]),
        );

        await worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              resumeSessionId: SESSION_ID,
              toolPermission: { toolCallId: 'tc-1', action: 'approve' },
            },
          }),
        );

        expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
          TENANT_ID,
          STEP_ID,
          'completed',
          {
            result: { content: 'fresh' },
          },
        );
      });
    });

    describe('resolveToolPermissionAndBuildBlocks（通过 process + toolPermission）', () => {
      it('approve: 找到 tool call，转为 in_progress，发 resolved 事件并继续执行', async () => {
        const step = makeStep({
          status: 'running',
          checkpointData: {
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'awaiting_permission',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
        );

        await worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              resumeSessionId: SESSION_ID,
              toolPermission: { toolCallId: 'tc-1', action: 'approve' },
            },
          }),
        );

        expect(mockToolCallStateMachine.transition).toHaveBeenCalledWith(
          'awaiting_permission',
          'in_progress',
        );
        expect(mockEventBridge.emitToolPermissionResolved).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          {
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            action: 'approve',
          },
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'in_progress',
            args: { q: 'test' },
            result: undefined,
            error: undefined,
            transitions: [
              expect.objectContaining({
                from: 'awaiting_permission',
                to: 'in_progress',
                source: 'user',
                timestamp: expect.any(String),
              }),
            ],
          }),
        );
        expect(updateChain.set).toHaveBeenCalledWith({
          checkpointData: {
            toolCalls: [
              expect.objectContaining({
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'in_progress',
                transitions: [
                  expect.objectContaining({
                    from: 'awaiting_permission',
                    to: 'in_progress',
                    source: 'user',
                    timestamp: expect.any(String),
                  }),
                ],
              }),
            ],
            sessionId: SESSION_ID,
          },
        });
        expect(mockAgentRuntime.prompt).toHaveBeenCalledWith(SESSION_ID, []);
        expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
          EXECUTION_ID,
          STEP_ID,
          TENANT_ID,
        );
      });

      it('deny: 转为 denied，发 resolved 事件，注入拒绝文本块并继续执行', async () => {
        const step = makeStep({
          status: 'running',
          checkpointData: {
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'awaiting_permission',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([
            { type: 'message_chunk', content: '继续执行' },
            { type: 'done', stopReason: 'end_turn' },
          ]),
        );

        await worker.process(
          createMockJob({
            data: {
              executionId: EXECUTION_ID,
              stepId: STEP_ID,
              tenantId: TENANT_ID,
              resumeSessionId: SESSION_ID,
              toolPermission: { toolCallId: 'tc-1', action: 'deny' },
            },
          }),
        );

        expect(mockToolCallStateMachine.transition).toHaveBeenCalledWith(
          'awaiting_permission',
          'denied',
        );
        expect(mockEventBridge.emitToolPermissionResolved).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          {
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            action: 'deny',
          },
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'denied',
            args: { q: 'test' },
            result: undefined,
            error: undefined,
            transitions: [
              expect.objectContaining({
                from: 'awaiting_permission',
                to: 'denied',
                source: 'user',
                timestamp: expect.any(String),
              }),
            ],
          }),
        );
        expect(updateChain.set).toHaveBeenCalledWith({
          checkpointData: {
            toolCalls: [
              expect.objectContaining({
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'denied',
                transitions: [
                  expect.objectContaining({
                    from: 'awaiting_permission',
                    to: 'denied',
                    source: 'user',
                    timestamp: expect.any(String),
                  }),
                ],
              }),
            ],
            sessionId: SESSION_ID,
          },
        });
        expect(mockAgentRuntime.prompt).toHaveBeenCalledWith(SESSION_ID, [
          {
            type: 'text',
            text: 'Tool call "search" (ID: tc-1) was denied by the user.',
          },
        ]);
        expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
          EXECUTION_ID,
          STEP_ID,
          TENANT_ID,
        );
      });

      it('未知 toolCallId 时抛出 ToolCallNotFoundException', async () => {
        const step = makeStep({
          status: 'running',
          checkpointData: {
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'awaiting_permission',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        mockDb.select.mockReturnValue(createSelectChain(step));
        const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue(mockSetChain),
        });

        await expect(
          worker.process(
            createMockJob({
              data: {
                executionId: EXECUTION_ID,
                stepId: STEP_ID,
                tenantId: TENANT_ID,
                resumeSessionId: SESSION_ID,
                toolPermission: { toolCallId: 'tc-unknown', action: 'approve' },
              },
            }),
          ),
        ).rejects.toThrow(ToolCallNotFoundException);

        expect(
          mockEventBridge.emitToolPermissionResolved,
        ).not.toHaveBeenCalled();
        expect(mockAgentRuntime.prompt).not.toHaveBeenCalled();
      });

      it('tool call 非 awaiting_permission 时抛出 ToolPermissionResolutionNotAllowedException', async () => {
        const step = makeStep({
          status: 'running',
          checkpointData: {
            toolCalls: [
              {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'in_progress',
              },
            ],
            sessionId: SESSION_ID,
          },
        });
        mockDb.select.mockReturnValue(createSelectChain(step));
        const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue(mockSetChain),
        });

        await expect(
          worker.process(
            createMockJob({
              data: {
                executionId: EXECUTION_ID,
                stepId: STEP_ID,
                tenantId: TENANT_ID,
                resumeSessionId: SESSION_ID,
                toolPermission: { toolCallId: 'tc-1', action: 'approve' },
              },
            }),
          ),
        ).rejects.toThrow(ToolPermissionResolutionNotAllowedException);

        expect(
          mockEventBridge.emitToolPermissionResolved,
        ).not.toHaveBeenCalled();
        expect(mockAgentRuntime.prompt).not.toHaveBeenCalled();
      });
    });

    describe('executeMultiTurnLoop（通过 process + tool_use 事件）', () => {
      it('FULL_AUTO: tool_call → in_progress → 下一轮继续直到完成', async () => {
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(makeStep()));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockAgentRuntime.prompt
          .mockReturnValueOnce(
            createEventStream([
              {
                type: 'tool_call',
                call: {
                  id: 'tc-1',
                  tool: 'search',
                  args: { q: 'test' },
                  status: 'pending',
                },
              },
              { type: 'done', stopReason: 'tool_use' },
            ]),
          )
          .mockReturnValueOnce(
            createEventStream([
              { type: 'message_chunk', content: '完成' },
              { type: 'done', stopReason: 'end_turn' },
            ]),
          );

        await worker.process(createMockJob());

        expect(mockAgentRuntime.prompt).toHaveBeenCalledTimes(2);
        expect(mockToolCallStateMachine.transition).toHaveBeenCalledWith(
          'pending',
          'in_progress',
        );
        expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          STEP_ID,
          expect.objectContaining({ type: 'tool_call' }),
        );
        expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          STEP_ID,
          { type: 'done', stopReason: 'tool_use' },
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'pending',
            args: { q: 'test' },
            transitions: [
              expect.objectContaining({
                to: 'pending',
                source: 'runtime',
                timestamp: expect.any(String),
              }),
            ],
          }),
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            status: 'in_progress',
            args: { q: 'test' },
            transitions: [
              expect.objectContaining({
                to: 'pending',
                source: 'runtime',
                timestamp: expect.any(String),
              }),
              expect.objectContaining({
                from: 'pending',
                to: 'in_progress',
                source: 'worker',
                timestamp: expect.any(String),
              }),
            ],
          }),
        );
        expect(updateChain.set).toHaveBeenLastCalledWith({
          checkpointData: expect.objectContaining({
            session: {},
            sessionId: SESSION_ID,
            partialContent: '',
            round: 1,
            chunkIndex: 0,
            toolCalls: [
              expect.objectContaining({ id: 'tc-1', status: 'in_progress' }),
            ],
          }),
        });
        expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
          TENANT_ID,
          STEP_ID,
          'completed',
          { result: { content: '完成' } },
        );
      });

      it('MANUAL_CONFIRM: tool_call → awaiting_permission，checkpoint 直写并提前结束', async () => {
        const step = makeStep({
          nodeData: {
            agentId: AGENT_ID,
            systemPrompt: '你是一个助手',
            autonomyMode: 'MANUAL_CONFIRM',
          },
        });
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([
            { type: 'message_chunk', content: '部分输出' },
            {
              type: 'tool_call',
              call: {
                id: 'tc-1',
                tool: 'search',
                args: { q: 'test' },
                status: 'pending',
              },
            },
            { type: 'done', stopReason: 'tool_use' },
          ]),
        );

        vi.useFakeTimers();
        vi.setSystemTime(new Date(REQUESTED_AT));

        await worker.process(createMockJob());

        vi.useRealTimers();

        expect(mockToolCallStateMachine.transition).toHaveBeenCalledWith(
          'pending',
          'awaiting_permission',
        );
        expect(mockEventBridge.emitToolPermissionRequired).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          {
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-1',
            tool: 'search',
            args: { q: 'test' },
            requestedAt: REQUESTED_AT,
          },
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            toolCallId: 'tc-1',
            status: 'awaiting_permission',
          }),
        );
        expect(updateChain.set).toHaveBeenLastCalledWith({
          checkpointData: expect.objectContaining({
            session: {},
            sessionId: SESSION_ID,
            partialContent: '部分输出',
            round: 1,
            chunkIndex: 1,
            toolCalls: [
              expect.objectContaining({
                id: 'tc-1',
                tool: 'search',
                status: 'awaiting_permission',
              }),
            ],
          }),
        });
        expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
        expect(mockStateMachine.updateStepStatus).toHaveBeenCalledTimes(1);
        expect(mockStateMachine.updateStepStatus).not.toHaveBeenCalledWith(
          TENANT_ID,
          STEP_ID,
          'waiting_intervention',
          expect.anything(),
        );
      });

      it('legacy FULL_AUTO 在低于自动档的组织上限下会被 clamp 为 awaiting_permission', async () => {
        const step = makeStep({
          nodeData: {
            agentId: AGENT_ID,
            systemPrompt: '你是一个助手',
            autonomyMode: 'FULL_AUTO',
          },
        });
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(step));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockOrganizationAutonomyPolicyService.resolveAutonomyCapForTenant.mockResolvedValue(
          'RULE_BASED',
        );
        mockAgentRuntime.prompt.mockReturnValue(
          createEventStream([
            {
              type: 'tool_call',
              call: {
                id: 'tc-legacy-1',
                tool: 'search',
                args: { q: 'legacy' },
                status: 'pending',
              },
            },
            { type: 'done', stopReason: 'tool_use' },
          ]),
        );

        vi.useFakeTimers();
        vi.setSystemTime(new Date(REQUESTED_AT));

        await worker.process(createMockJob());

        vi.useRealTimers();

        expect(
          mockOrganizationAutonomyPolicyService.resolveAutonomyCapForTenant,
        ).toHaveBeenCalledWith(TENANT_ID);
        expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
          expect.objectContaining({
            autonomyMode: 'RULE_BASED',
          }),
        );
        expect(mockAgentRuntime.prompt).toHaveBeenCalledTimes(1);
        expect(mockToolCallStateMachine.transition).toHaveBeenCalledWith(
          'pending',
          'awaiting_permission',
        );
        expect(mockToolCallStateMachine.transition).not.toHaveBeenCalledWith(
          'pending',
          'in_progress',
        );
        expect(mockEventBridge.emitToolPermissionRequired).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          {
            stepId: STEP_ID,
            nodeId: 'node-1',
            toolCallId: 'tc-legacy-1',
            tool: 'search',
            args: { q: 'legacy' },
            requestedAt: REQUESTED_AT,
          },
        );
        expect(updateChain.set).toHaveBeenLastCalledWith({
          checkpointData: expect.objectContaining({
            session: {},
            sessionId: SESSION_ID,
            round: 1,
            toolCalls: [
              expect.objectContaining({
                id: 'tc-legacy-1',
                status: 'awaiting_permission',
              }),
            ],
          }),
        });
        expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
      });

      it('单轮多个 tool_call: 会逐个 transition 并广播状态', async () => {
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(makeStep()));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockAgentRuntime.prompt
          .mockReturnValueOnce(
            createEventStream([
              {
                type: 'tool_call',
                call: {
                  id: 'tc-1',
                  tool: 'search',
                  args: { q: 'test' },
                  status: 'pending',
                },
              },
              {
                type: 'tool_call',
                call: {
                  id: 'tc-2',
                  tool: 'search',
                  args: { q: 'test2' },
                  status: 'pending',
                },
              },
              { type: 'done', stopReason: 'tool_use' },
            ]),
          )
          .mockReturnValueOnce(
            createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
          );

        await worker.process(createMockJob());

        expect(mockAgentRuntime.prompt).toHaveBeenCalledTimes(2);
        expect(mockToolCallStateMachine.transition).toHaveBeenCalledTimes(2);
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledTimes(4);
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({ toolCallId: 'tc-1', status: 'pending' }),
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            toolCallId: 'tc-1',
            status: 'in_progress',
          }),
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({ toolCallId: 'tc-2', status: 'pending' }),
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            toolCallId: 'tc-2',
            status: 'in_progress',
          }),
        );
      });

      it('超过最大轮数（10 轮）仍返回 tool_use 时会退出并以 stopReason=tool_use 完成', async () => {
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(makeStep()));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());

        for (let round = 0; round < 10; round++) {
          mockAgentRuntime.prompt.mockReturnValueOnce(
            createEventStream([
              {
                type: 'tool_call',
                call: {
                  id: `tc-${round}`,
                  tool: 'search',
                  args: { round },
                  status: 'pending',
                },
              },
              { type: 'done', stopReason: 'tool_use' },
            ]),
          );
        }

        await worker.process(createMockJob());

        expect(mockAgentRuntime.prompt).toHaveBeenCalledTimes(10);
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledTimes(20);
        expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
          TENANT_ID,
          STEP_ID,
          'completed',
          { result: { content: '', stopReason: 'tool_use' } },
        );
        expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
          EXECUTION_ID,
          STEP_ID,
          TENANT_ID,
        );
      });

      it('FULL_AUTO: tool-result / tool-error 会补齐 in_progress 并持久化 completed / failed', async () => {
        const updateChain = createUpdateChain();
        mockDb.select.mockReturnValue(createSelectChain(makeStep()));
        mockDb.update.mockReturnValue(updateChain);
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockAgentRuntime.prompt
          .mockReturnValueOnce(
            createEventStream([
              {
                type: 'tool_call',
                call: {
                  id: 'tc-1',
                  tool: 'search',
                  args: { q: 'test' },
                  status: 'pending',
                },
              },
              {
                type: 'tool_call',
                call: {
                  id: 'tc-1',
                  tool: 'search',
                  args: { q: 'test' },
                  status: 'completed',
                  result: { items: ['ok'] },
                },
              },
              {
                type: 'tool_call',
                call: {
                  id: 'tc-2',
                  tool: 'lookup',
                  args: { id: '42' },
                  status: 'pending',
                },
              },
              {
                type: 'tool_call',
                call: {
                  id: 'tc-2',
                  tool: 'lookup',
                  args: { id: '42' },
                  status: 'failed',
                  error: 'boom',
                },
              },
              { type: 'done', stopReason: 'tool_use' },
            ]),
          )
          .mockReturnValueOnce(
            createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
          );

        await worker.process(createMockJob());

        expect(mockToolCallStateMachine.transition.mock.calls).toEqual([
          ['pending', 'in_progress'],
          ['in_progress', 'completed'],
          ['pending', 'in_progress'],
          ['in_progress', 'failed'],
        ]);
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            toolCallId: 'tc-1',
            status: 'completed',
            result: { items: ['ok'] },
          }),
        );
        expect(mockEventBridge.emitToolCallStatus).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          expect.objectContaining({
            toolCallId: 'tc-2',
            status: 'failed',
            error: 'boom',
          }),
        );
        expect(updateChain.set).toHaveBeenLastCalledWith({
          checkpointData: expect.objectContaining({
            session: {},
            sessionId: SESSION_ID,
            round: 1,
            chunkIndex: 0,
            toolCalls: [
              expect.objectContaining({
                id: 'tc-1',
                status: 'completed',
                transitions: [
                  expect.objectContaining({
                    to: 'pending',
                    source: 'runtime',
                    timestamp: expect.any(String),
                  }),
                  expect.objectContaining({
                    from: 'pending',
                    to: 'in_progress',
                    source: 'worker',
                    timestamp: expect.any(String),
                  }),
                  expect.objectContaining({
                    from: 'in_progress',
                    to: 'completed',
                    source: 'runtime',
                    timestamp: expect.any(String),
                  }),
                ],
              }),
              expect.objectContaining({
                id: 'tc-2',
                status: 'failed',
                transitions: [
                  expect.objectContaining({
                    to: 'pending',
                    source: 'runtime',
                    timestamp: expect.any(String),
                  }),
                  expect.objectContaining({
                    from: 'pending',
                    to: 'in_progress',
                    source: 'worker',
                    timestamp: expect.any(String),
                  }),
                  expect.objectContaining({
                    from: 'in_progress',
                    to: 'failed',
                    source: 'runtime',
                    timestamp: expect.any(String),
                  }),
                ],
              }),
            ],
          }),
        });
      });

      it('循环中抛错会保留已累计内容到 error.partialContent 与 checkpointData.partialContent', async () => {
        mockDb.select.mockReturnValue(createSelectChain(makeStep()));
        const mockSetChain = { where: vi.fn().mockResolvedValue(undefined) };
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue(mockSetChain),
        });
        mockAgentRuntime.createSession.mockResolvedValue(makeSession());
        mockAgentRuntime.prompt
          .mockReturnValueOnce(
            createEventStream([
              { type: 'message_chunk', content: 'alpha' },
              {
                type: 'tool_call',
                call: {
                  id: 'tc-1',
                  tool: 'search',
                  args: { q: 'test' },
                  status: 'pending',
                },
              },
              { type: 'done', stopReason: 'tool_use' },
            ]),
          )
          .mockReturnValueOnce(
            (async function* () {
              yield { type: 'message_chunk', content: 'beta' } as AgentEvent;
              throw new Error('boom');
            })(),
          );

        await expect(worker.process(createMockJob())).rejects.toMatchObject({
          message: 'boom',
          partialContent: 'alphabeta',
        });

        expect(mockStateMachine.updateStepStatus).toHaveBeenLastCalledWith(
          TENANT_ID,
          STEP_ID,
          'failed',
          expect.objectContaining({
            checkpointData: expect.objectContaining({
              partialContent: 'alphabeta',
            }),
          }),
        );
      });
    });
  });
});
