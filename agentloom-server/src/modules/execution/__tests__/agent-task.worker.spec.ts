import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { AgentTaskWorker } from '../agent-task.worker';
import { StepStateMachineService } from '../step-state-machine.service';
import { NodeSchedulerService } from '../node-scheduler.service';
import { AgentExecutionException } from '../execution.exceptions';
import {
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
  type InterventionResolution,
} from '../execution.constants';
import { DRIZZLE } from '../../../database/database.module';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { AGENT_RUNTIME, type IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import {
  AGENT_RUNTIME_FACTORY,
  type IAgentAdapterFactory,
} from '../../agent/agent-adapter.factory';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { AgentSession } from '../../agent/types/agent-session.types';

vi.mock(
  '../../../common/interceptors/tenant-transaction.context',
  async (importOriginal) => {
    const actual = await importOriginal<
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

async function* createEventStream(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    }),
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
  };

  const mockAgentRuntime: Record<keyof IAgentRuntime, ReturnType<typeof vi.fn>> = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  };

  const mockSandboxRuntime: Record<keyof IAgentRuntime, ReturnType<typeof vi.fn>> = {
    createSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
  };

  const mockAdapterFactory: IAgentAdapterFactory = {
    selectAdapter: vi.fn((hasSandbox: boolean) =>
      hasSandbox ? mockSandboxRuntime : mockAgentRuntime,
    ) as ReturnType<typeof vi.fn>,
  };

  const mockDb = {
    select: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        AgentTaskWorker,
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
        { provide: AGENT_RUNTIME, useValue: mockAgentRuntime },
        { provide: AGENT_RUNTIME_FACTORY, useValue: mockAdapterFactory },
        { provide: DRIZZLE, useValue: mockDb },
        {
          provide: getQueueToken(AGENT_TASK_QUEUE),
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    worker = module.get(AgentTaskWorker);
  });

  describe('process', () => {
    it('会创建携带 tenant/systemPrompt/autonomyMode 的 workflow session，并以 JSON 文本块调用 prompt', async () => {
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
        context: input,
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

      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(createEventStream(events));

      await worker.process(createMockJob());

      expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledTimes(4);
      for (const event of events) {
        expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          STEP_ID,
          event,
        );
      }
      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
        {
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '建议给主人展示摘要',
            stopReason: 'intervention_required',
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
        },
      );
      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
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
            opts: { attempts: 3 },
          }),
        ),
      ).rejects.toThrow('LLM 调用失败');

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'pending',
        {
          errorMessage: expect.objectContaining({ message: 'LLM 调用失败' }),
          checkpointData: { partialContent: '部分结果', sessionId: SESSION_ID },
        },
      );
      expect(mockStateMachine.broadcastStepRetry).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        {
          attempt: 1,
          maxAttempts: 3,
          errorMessage: 'LLM 调用失败',
        },
      );
      expect(mockNodeScheduler.onNodeFailed).not.toHaveBeenCalled();
    });

    it('最终失败时才将步骤标记为 failed 并触发级联', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '最后一次尝试' } as AgentEvent;
          throw new Error('最终失败');
        })(),
      );

      await expect(
        worker.process(
          createMockJob({
            attemptsMade: 2,
            opts: { attempts: 3 },
          }),
        ),
      ).rejects.toThrow('最终失败');

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: expect.objectContaining({ message: '最终失败' }),
          checkpointData: { partialContent: '最后一次尝试', sessionId: SESSION_ID },
        },
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
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
          decision: { suggestedContent: '建议稿', confidence: 0.9 },
        },
      });
      const intervention: InterventionResolution = {
        action: 'approve',
        feedback: '批准发布',
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
            intervention,
            stopReason: 'intervention_required',
            decision: { suggestedContent: '建议稿', confidence: 0.9 },
          },
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '草稿',
            stopReason: 'intervention_required',
            decision: { suggestedContent: '建议稿', confidence: 0.9 },
            intervention,
          },
        },
      );
      expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('modify 干预会优先使用 modifiedContent 作为最终输出', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: {
          sessionId: SESSION_ID,
          partialContent: '草稿',
          stopReason: 'intervention_required',
          decision: { suggestedContent: '建议稿' },
        },
      });
      const intervention: InterventionResolution = {
        action: 'modify',
        modifiedContent: '人工改写后的版本',
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
            intervention,
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
        },
      });
      const intervention: InterventionResolution = {
        action: 'reject',
        feedback: '内容不符合要求',
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
          errorMessage: { message: '内容不符合要求' },
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '草稿',
            intervention,
          },
        },
      );
      expect(mockNodeScheduler.onNodeFailed).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
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

      expect(mockAdapterFactory.selectAdapter).toHaveBeenCalledWith(true);
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
});
