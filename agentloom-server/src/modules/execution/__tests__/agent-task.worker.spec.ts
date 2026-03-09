import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { AgentTaskWorker } from '../agent-task.worker';
import { StepStateMachineService } from '../step-state-machine.service';
import { NodeSchedulerService } from '../node-scheduler.service';
import { AGENT_TASK_QUEUE, type AgentTaskJobData } from '../execution.constants';
import { DRIZZLE } from '../../../database/database.module';
import { AGENT_RUNTIME, type IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import type { AgentEvent } from '../../agent/types/agent-event.types';
import type { AgentSession } from '../../agent/types/agent-session.types';

// ─── 常量 ───

const EXECUTION_ID = '019391d4-d000-7000-0000-000000000001';
const STEP_ID = '019391d4-d000-7000-0000-000000000002';
const TENANT_ID = 'tenant-001';
const SESSION_ID = 'session-001';
const AGENT_ID = 'agent-001';

// ─── 辅助工具 ───

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
  } as Job<AgentTaskJobData>;
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

/**
 * 创建异步可迭代的 AgentEvent 流
 */
async function* createEventStream(
  events: AgentEvent[],
): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

// ─── Mock 工厂 ───

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    }),
  };
}

// ─── Mock 对象 ───

const mockStateMachine: Record<string, Mock> = {
  updateStepStatus: vi.fn().mockResolvedValue(makeStep()),
  updateExecutionStatus: vi.fn().mockResolvedValue(undefined),
  broadcastAgentEvent: vi.fn(),
};

const mockNodeScheduler: Record<string, Mock> = {
  onNodeCompleted: vi.fn().mockResolvedValue(undefined),
};

const mockAgentRuntime: Record<string, Mock> = {
  createSession: vi.fn(),
  loadSession: vi.fn(),
  prompt: vi.fn(),
  cancel: vi.fn(),
};

const mockDb = {
  select: vi.fn(),
};

// ─── 测试 ───

describe('AgentTaskWorker', () => {
  let worker: AgentTaskWorker;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 避免 Logger 输出
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        AgentTaskWorker,
        { provide: StepStateMachineService, useValue: mockStateMachine },
        { provide: NodeSchedulerService, useValue: mockNodeScheduler },
        { provide: AGENT_RUNTIME, useValue: mockAgentRuntime },
        { provide: DRIZZLE, useValue: mockDb },
        {
          provide: getQueueToken(AGENT_TASK_QUEUE),
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    worker = module.get(AgentTaskWorker);
  });

  describe('process — 正常执行流程', () => {
    it('应读取步骤数据并创建 Agent 会话', async () => {
      const step = makeStep();
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

      await worker.process(createMockJob());

      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: AGENT_ID,
          mode: 'workflow',
        }),
      );
    });

    it('应将输入作为上下文传递给会话', async () => {
      const inputData = { source_node: { data: 'test' } };
      const step = makeStep({ input: inputData });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          context: inputData,
        }),
      );
    });

    it('应流式广播所有 Agent 事件', async () => {
      const events: AgentEvent[] = [
        { type: 'plan', title: '分析问题', content: '开始分析' },
        { type: 'message_chunk', content: '你好' },
        { type: 'message_chunk', content: '世界' },
        { type: 'tool_call', call: { id: 'tc-1', name: 'search', arguments: '{}' } as any },
        { type: 'done', stopReason: 'end_turn' },
      ];
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(createEventStream(events));

      await worker.process(createMockJob());

      expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledTimes(5);
      for (const event of events) {
        expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
          TENANT_ID,
          EXECUTION_ID,
          STEP_ID,
          event,
        );
      }
    });

    it('应将 message_chunk 内容拼接为最终结果', async () => {
      const events: AgentEvent[] = [
        { type: 'message_chunk', content: 'Hello ' },
        { type: 'message_chunk', content: 'World' },
        { type: 'done', stopReason: 'end_turn' },
      ];
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(createEventStream(events));

      await worker.process(createMockJob());

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        { result: { content: 'Hello World' } },
      );
    });

    it('应在完成后更新步骤状态为 running 再到 completed', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      const calls = mockStateMachine.updateStepStatus.mock.calls;
      expect(calls[0]).toEqual([TENANT_ID, STEP_ID, 'running']);
      expect(calls[1]).toEqual([
        TENANT_ID,
        STEP_ID,
        'completed',
        { result: { content: '' } },
      ]);
    });

    it('应在完成后调用 onNodeCompleted 推进 DAG', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });
  });

  describe('process — 空输入处理', () => {
    it('应在无输入时使用空对象作为上下文', async () => {
      const step = makeStep({ input: null });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockAgentRuntime.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ context: {} }),
      );
    });
  });

  describe('process — Agent 事件类型处理', () => {
    it('应处理 plan 事件并广播', async () => {
      const planEvent: AgentEvent = {
        type: 'plan',
        title: '执行计划',
        content: '步骤一',
      };
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([planEvent, { type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        planEvent,
      );
    });

    it('应处理 tool_call 事件并广播', async () => {
      const toolEvent: AgentEvent = {
        type: 'tool_call',
        call: { id: 'tc-1', name: 'search', arguments: '{"q":"test"}' } as any,
      };
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([toolEvent, { type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockStateMachine.broadcastAgentEvent).toHaveBeenCalledWith(
        TENANT_ID,
        EXECUTION_ID,
        STEP_ID,
        toolEvent,
      );
    });
  });

  describe('process — 异常处理', () => {
    it('应在步骤不存在时抛出错误', async () => {
      mockDb.select.mockReturnValue(createSelectChain([]));

      await expect(worker.process(createMockJob())).rejects.toThrow();
    });

    it('应在 Agent 执行失败时将步骤标记为 failed', async () => {
      const step = makeStep();
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '部分结果' } as AgentEvent;
          throw new Error('LLM 调用失败');
        })(),
      );

      await expect(worker.process(createMockJob())).rejects.toThrow('LLM 调用失败');

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: expect.objectContaining({ message: 'LLM 调用失败' }),
          checkpointData: { partialContent: '部分结果', sessionId: SESSION_ID },
        },
      );
    });

    it('应在会话创建失败时将步骤标记为 failed', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockRejectedValue(
        new Error('会话创建失败'),
      );

      await expect(worker.process(createMockJob())).rejects.toThrow('会话创建失败');

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: expect.objectContaining({ message: '会话创建失败' }),
        },
      );
    });

    it('应在 Agent 执行失败时保存检查点数据', async () => {
      const step = makeStep();
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        (async function* () {
          yield { type: 'message_chunk', content: '部分' } as AgentEvent;
          yield { type: 'message_chunk', content: '内容' } as AgentEvent;
          throw new Error('中途失败');
        })(),
      );

      await expect(worker.process(createMockJob())).rejects.toThrow('中途失败');

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: expect.objectContaining({ message: '中途失败' }),
          checkpointData: { partialContent: '部分内容', sessionId: SESSION_ID },
        },
      );
    });
  });

  describe('process — stopReason 处理', () => {
    it('应在 max_tokens 时完成并记录结果', async () => {
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
    });

    it('应在 tool_use 时转为 waiting_intervention 并保存检查点', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'message_chunk', content: '工具调用建议' },
          { type: 'done', stopReason: 'tool_use' },
        ]),
      );

      await worker.process(createMockJob());

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
        {
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '工具调用建议',
            stopReason: 'tool_use',
          },
          result: { content: '工具调用建议', stopReason: 'tool_use' },
        },
      );
    });

    it('应在 tool_use 时调用 updateExecutionStatus 而非 onNodeCompleted', async () => {
      mockDb.select.mockReturnValue(createSelectChain(makeStep()));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'done', stopReason: 'tool_use' },
        ]),
      );

      await worker.process(createMockJob());

      expect(mockStateMachine.updateExecutionStatus).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
      );
      expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
    });
  });

  describe('onFailed — Worker 失败钩子', () => {
    it('应在任务失败时更新步骤状态为 failed', async () => {
      const job = createMockJob();
      const error = new Error('Worker 处理失败');

      await worker.onFailed(job, error);

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'failed',
        {
          errorMessage: { message: 'Worker 处理失败', stack: error.stack },
        },
      );
    });

    it('应在 job 为 undefined 时优雅处理', async () => {
      const error = new Error('未知错误');

      // 不应抛出
      await expect(
        worker.onFailed(undefined as any, error),
      ).resolves.not.toThrow();
    });
  });

  describe('process — 内容块构建', () => {
    it('应将步骤输入转换为文本内容块传递给 prompt', async () => {
      const inputData = { node_a: { result: 'value' } };
      const step = makeStep({ input: inputData, nodeData: { agentId: AGENT_ID } });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      expect(mockAgentRuntime.prompt).toHaveBeenCalledWith(SESSION_ID, [
        { type: 'text', text: JSON.stringify(inputData) },
      ]);
    });

    it('应在节点数据包含 systemPrompt 时将其作为文本前缀', async () => {
      const step = makeStep({
        nodeData: { agentId: AGENT_ID, systemPrompt: '你是翻译专家' },
        input: { source: { text: 'hello' } },
      });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.createSession.mockResolvedValue(makeSession());
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob());

      const promptCall = mockAgentRuntime.prompt.mock.calls[0];
      const contentBlocks = promptCall[1];
      expect(contentBlocks).toHaveLength(2);
      expect(contentBlocks[0]).toEqual({ type: 'text', text: '你是翻译专家' });
      expect(contentBlocks[1]).toEqual({
        type: 'text',
        text: JSON.stringify({ source: { text: 'hello' } }),
      });
    });
  });

  describe('process — 干预恢复流程', () => {
    it('应在恢复时跳过 createSession 直接使用已有 sessionId', async () => {
      const step = makeStep({
        status: 'waiting_intervention',
        checkpointData: { sessionId: SESSION_ID, partialContent: '之前的内容' },
      });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([{ type: 'done', stopReason: 'end_turn' }]),
      );

      await worker.process(createMockJob({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          resumeSessionId: SESSION_ID,
          feedbackContent: '请继续执行',
        },
      }));

      expect(mockAgentRuntime.createSession).not.toHaveBeenCalled();
      expect(mockAgentRuntime.prompt).toHaveBeenCalledWith(SESSION_ID, [
        { type: 'text', text: '请继续执行' },
      ]);
    });

    it('应在恢复后正常完成并调用 onNodeCompleted', async () => {
      const step = makeStep({ status: 'waiting_intervention' });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'message_chunk', content: '恢复后的结果' },
          { type: 'done', stopReason: 'end_turn' },
        ]),
      );

      await worker.process(createMockJob({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          resumeSessionId: SESSION_ID,
          feedbackContent: '同意执行',
        },
      }));

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'completed',
        { result: { content: '恢复后的结果' } },
      );
      expect(mockNodeScheduler.onNodeCompleted).toHaveBeenCalledWith(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );
    });

    it('应在恢复后再次 tool_use 时再次进入 waiting_intervention', async () => {
      const step = makeStep({ status: 'waiting_intervention' });
      mockDb.select.mockReturnValue(createSelectChain(step));
      mockAgentRuntime.prompt.mockReturnValue(
        createEventStream([
          { type: 'message_chunk', content: '再次建议' },
          { type: 'done', stopReason: 'tool_use' },
        ]),
      );

      await worker.process(createMockJob({
        data: {
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          tenantId: TENANT_ID,
          resumeSessionId: SESSION_ID,
          feedbackContent: '请重新分析',
        },
      }));

      expect(mockStateMachine.updateStepStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
        'waiting_intervention',
        {
          checkpointData: {
            sessionId: SESSION_ID,
            partialContent: '再次建议',
            stopReason: 'tool_use',
          },
          result: { content: '再次建议', stopReason: 'tool_use' },
        },
      );
      expect(mockNodeScheduler.onNodeCompleted).not.toHaveBeenCalled();
    });
  });
});
