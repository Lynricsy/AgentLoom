import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AgentApiEventMirrorListener } from '../agent-api-event-mirror.listener';
import { AgentApiRunService } from '../agent-api-run.service';

const TENANT_ID = 'tenant-1';
const CONVERSATION_ID = 'conversation-1';
const RUN_ID = '01900000-0000-7000-8000-000000000001';

describe('AgentApiEventMirrorListener', () => {
  const eventStream = { append: vi.fn(), expire: vi.fn() };
  let runService: AgentApiRunService;
  let findActiveRunId: Mock;
  let listener: AgentApiEventMirrorListener;

  beforeEach(() => {
    vi.clearAllMocks();
    eventStream.append.mockResolvedValue('1-0');
    runService = new AgentApiRunService({} as never, eventStream as never);
    findActiveRunId = vi.fn().mockResolvedValue(null);
    runService.findActiveRunId = findActiveRunId as never;
    listener = new AgentApiEventMirrorListener(
      runService,
      eventStream as never,
    );
  });

  function statusChanged(status: string, phase?: string) {
    listener.handleStatusChanged({
      tenantId: TENANT_ID,
      executionId: CONVERSATION_ID,
      status,
      executionType: 'conversation',
      ...(phase ? { phase: phase as never } : {}),
    });
  }

  it('已登记对话的 output-chunk 映射为 message.delta', () => {
    runService.registerLocalRun(CONVERSATION_ID, RUN_ID);

    listener.handleOutputChunk({
      tenantId: TENANT_ID,
      executionId: CONVERSATION_ID,
      stepId: CONVERSATION_ID,
      chunk: '你好',
      index: 3,
      executionType: 'conversation',
    });

    expect(eventStream.append).toHaveBeenCalledWith(RUN_ID, {
      event: 'message.delta',
      data: { runId: RUN_ID, index: 3, delta: '你好' },
    });
  });

  it('tool-call-status 映射为 tool_call，不带 args 与 result', () => {
    runService.registerLocalRun(CONVERSATION_ID, RUN_ID);

    listener.handleToolCallStatus({
      tenantId: TENANT_ID,
      executionId: CONVERSATION_ID,
      stepId: CONVERSATION_ID,
      nodeId: CONVERSATION_ID,
      toolCallId: 'call-1',
      tool: 'bash',
      executionType: 'conversation',
      status: 'failed',
      args: { command: 'cat /etc/secret' },
      result: { stdout: 'internal' },
      error: 'exit 1',
    });

    expect(eventStream.append).toHaveBeenCalledWith(RUN_ID, {
      event: 'tool_call',
      data: {
        runId: RUN_ID,
        toolCallId: 'call-1',
        tool: 'bash',
        status: 'failed',
        error: 'exit 1',
      },
    });
  });

  it('未登记的对话与非对话执行的事件都不写入', () => {
    listener.handleOutputChunk({
      tenantId: TENANT_ID,
      executionId: CONVERSATION_ID,
      stepId: CONVERSATION_ID,
      chunk: 'x',
      index: 0,
      executionType: 'conversation',
    });
    runService.registerLocalRun(CONVERSATION_ID, RUN_ID);
    listener.handleOutputChunk({
      tenantId: TENANT_ID,
      executionId: CONVERSATION_ID,
      stepId: 'step-1',
      chunk: 'x',
      index: 0,
      executionType: 'workflow',
    });

    expect(eventStream.append).not.toHaveBeenCalled();
  });

  it('准备阶段的状态事件会查找活跃 run 并登记，后续事件按顺序写入同一 run', async () => {
    findActiveRunId.mockResolvedValue(RUN_ID);

    statusChanged('preparing', 'queued');
    statusChanged('preparing', 'sandbox_creating');

    await vi.waitFor(() => expect(eventStream.append).toHaveBeenCalledTimes(2));
    statusChanged('running', 'running');

    expect(findActiveRunId).toHaveBeenCalledTimes(1);
    expect(findActiveRunId).toHaveBeenCalledWith(TENANT_ID, CONVERSATION_ID);
    expect(runService.getLocalRunId(CONVERSATION_ID)).toBe(RUN_ID);
    expect(eventStream.append.mock.calls.map(([, event]) => event)).toEqual([
      {
        event: 'run.status',
        data: { runId: RUN_ID, status: 'queued', phase: 'queued' },
      },
      {
        event: 'run.status',
        data: { runId: RUN_ID, status: 'queued', phase: 'sandbox_creating' },
      },
      {
        event: 'run.status',
        data: { runId: RUN_ID, status: 'running', phase: 'running' },
      },
    ]);
  });

  it('没有活跃 run 的对话不登记也不写入', async () => {
    statusChanged('preparing', 'preparing');

    await vi.waitFor(() => expect(findActiveRunId).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(runService.getLocalRunId(CONVERSATION_ID)).toBeUndefined();
    expect(eventStream.append).not.toHaveBeenCalled();
  });

  it('终态状态与没有 phase 的状态事件不镜像', () => {
    runService.registerLocalRun(CONVERSATION_ID, RUN_ID);

    statusChanged('completed');
    statusChanged('failed', 'running');
    statusChanged('running');

    expect(eventStream.append).not.toHaveBeenCalled();
    expect(findActiveRunId).not.toHaveBeenCalled();
  });

  it('写入失败与查找失败都不会抛给事件发出方', async () => {
    eventStream.append.mockRejectedValue(new Error('redis down'));
    findActiveRunId.mockRejectedValue(new Error('db down'));

    statusChanged('preparing', 'preparing');
    runService.registerLocalRun(CONVERSATION_ID, RUN_ID);
    expect(() =>
      listener.handleOutputChunk({
        tenantId: TENANT_ID,
        executionId: CONVERSATION_ID,
        stepId: CONVERSATION_ID,
        chunk: 'x',
        index: 0,
        executionType: 'conversation',
      }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
