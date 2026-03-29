import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentExecutionService,
  AGENT_CONVERSATION_EXECUTION_JOB,
} from '../agent-execution.service';

const { mockQueue, mockConversationService } = vi.hoisted(() => ({
  mockQueue: {
    add: vi.fn(),
    getJob: vi.fn(),
  },
  mockConversationService: {
    sendMessage: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  hasActiveTenantTransaction: vi.fn(() => false),
  registerAfterCommitHook: vi.fn(async (hook: () => Promise<void>) => hook()),
  runInTenantTransaction: vi.fn(
    async (
      db: unknown,
      _tenantId: string,
      operation: (dbClient: unknown) => Promise<unknown>,
    ) => operation(db),
  ),
}));

type ServiceInternals = {
  getConversationIdentityOrThrow: ReturnType<typeof vi.fn>;
};

type ConversationIdentity = {
  id: string;
  tenantId: string;
  status: 'active' | 'paused' | 'ended' | 'failed';
};

describe('AgentExecutionService', () => {
  let service: AgentExecutionService;

  beforeEach(async () => {
    vi.clearAllMocks();

    service = new AgentExecutionService(
      {} as never,
      mockQueue as never,
      mockConversationService as never,
    );
    mockQueue.getJob.mockResolvedValue(null);
    const serviceInternals = service as unknown as ServiceInternals;
    serviceInternals.getConversationIdentityOrThrow = vi
      .fn<() => Promise<ConversationIdentity>>()
      .mockResolvedValue({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        status: 'active',
      });
  });

  it('startConversation 会写入首条消息并入队执行任务', async () => {
    mockConversationService.sendMessage.mockResolvedValue({ data: {} });
    mockQueue.add.mockResolvedValue({ id: 'job-1' });

    await service.startConversation('conversation-1', '你好，开始吧');

    expect(mockConversationService.sendMessage).toHaveBeenCalledWith(
      'conversation-1',
      'tenant-1',
      expect.objectContaining({
        content: '你好，开始吧',
        role: 'user',
        contentType: 'text',
      }),
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      AGENT_CONVERSATION_EXECUTION_JOB,
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
      },
      { jobId: 'conversation-1' },
    );
  });

  it('injectMessage 在会话运行中只通知活跃 loop', async () => {
    mockConversationService.sendMessage.mockResolvedValue({ data: {} });

    const handle = service.registerActiveRun(
      'conversation-1',
      new AbortController(),
    );
    expect(handle).not.toBeNull();

    const notifySpy = vi.spyOn(handle!, 'notify');

    await service.injectMessage('conversation-1', {
      content: '继续处理这条消息',
      role: 'user',
      contentType: 'text',
    } as never);

    expect(mockConversationService.sendMessage).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('injectMessage 在 loop 已退出时会重新入队', async () => {
    mockConversationService.sendMessage.mockResolvedValue({ data: {} });
    mockQueue.add.mockResolvedValue({ id: 'job-2' });

    await service.injectMessage('conversation-1', '重新唤醒会话');

    expect(mockQueue.add).toHaveBeenCalledWith(
      AGENT_CONVERSATION_EXECUTION_JOB,
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
      },
      { jobId: 'conversation-1' },
    );
  });

  it('旧 job 已完成时会先移除再重新入队', async () => {
    mockConversationService.sendMessage.mockResolvedValue({ data: {} });
    mockQueue.add.mockResolvedValue({ id: 'job-3' });
    const completedJob = {
      getState: vi.fn().mockResolvedValue('completed'),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockQueue.getJob.mockResolvedValue(completedJob);

    await service.injectMessage('conversation-1', '再次执行');

    expect(completedJob.getState).toHaveBeenCalledTimes(1);
    expect(completedJob.remove).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      AGENT_CONVERSATION_EXECUTION_JOB,
      {
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
      },
      { jobId: 'conversation-1' },
    );
  });

  it('旧 job 仍处于运行态时不应重复入队', async () => {
    mockConversationService.sendMessage.mockResolvedValue({ data: {} });
    const activeJob = {
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    };
    mockQueue.getJob.mockResolvedValue(activeJob);

    await service.injectMessage('conversation-1', '不要重复排队');

    expect(activeJob.getState).toHaveBeenCalledTimes(1);
    expect(activeJob.remove).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('cancelExecution 会结束会话并中止活跃 loop', async () => {
    mockConversationService.cancel.mockResolvedValue({ data: {} });

    const handle = service.registerActiveRun(
      'conversation-1',
      new AbortController(),
    );
    expect(handle).not.toBeNull();

    const abortSpy = vi.spyOn(handle!.abort, 'abort');
    const notifySpy = vi.spyOn(handle!, 'notify');

    await service.cancelExecution('conversation-1');

    expect(mockConversationService.cancel).toHaveBeenCalledWith(
      'conversation-1',
    );
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });
});
