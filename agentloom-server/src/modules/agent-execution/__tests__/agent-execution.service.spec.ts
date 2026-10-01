import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  AgentExecutionService,
  AGENT_CONVERSATION_CANCEL_CHANNEL,
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

interface FakeRedisClient {
  publish: Mock<(channel: string, message: string) => Promise<number>>;
  duplicate: () => unknown;
}

type MessageHandler = (channel: string, message: string) => void;

/** 进程内模拟的 Redis pub/sub：同一 bus 上的多个 client 代表多个服务实例 */
class FakeRedisBus {
  private readonly subscribers = new Set<{
    channels: Set<string>;
    handlers: MessageHandler[];
  }>();

  client(): FakeRedisClient {
    return {
      publish: vi.fn(async (channel: string, message: string) => {
        const receivers = [...this.subscribers].filter((subscriber) =>
          subscriber.channels.has(channel),
        );
        for (const receiver of receivers) {
          for (const handler of receiver.handlers) {
            handler(channel, message);
          }
        }
        return receivers.length;
      }),
      duplicate: () => this.subscriberClient(),
    };
  }

  private subscriberClient() {
    const state = { channels: new Set<string>(), handlers: [] as MessageHandler[] };
    this.subscribers.add(state);
    return {
      status: 'ready',
      on: (event: string, handler: MessageHandler) => {
        if (event === 'message') {
          state.handlers.push(handler);
        }
      },
      subscribe: async (...channels: string[]) => {
        channels.forEach((channel) => state.channels.add(channel));
      },
      unsubscribe: async (...channels: string[]) => {
        channels.forEach((channel) => state.channels.delete(channel));
      },
      quit: async () => {
        this.subscribers.delete(state);
      },
    };
  }
}

type ServiceInternals = {
  getConversationIdentityOrThrow: Mock;
};

type ConversationIdentity = {
  id: string;
  tenantId: string;
  status: 'active' | 'paused' | 'ended' | 'failed';
};

describe('AgentExecutionService', () => {
  let service: AgentExecutionService;
  let bus: FakeRedisBus;
  let redis: FakeRedisClient;

  function createService(client: FakeRedisClient) {
    const instance = new AgentExecutionService(
      {} as never,
      mockQueue as never,
      mockConversationService as never,
      client as never,
    );
    const serviceInternals = instance as unknown as ServiceInternals;
    serviceInternals.getConversationIdentityOrThrow = vi
      .fn<() => Promise<ConversationIdentity>>()
      .mockResolvedValue({
        id: 'conversation-1',
        tenantId: 'tenant-1',
        status: 'active',
      });
    return instance;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.APP_SANDBOX_MAINTENANCE_MODE;

    bus = new FakeRedisBus();
    redis = bus.client();
    service = createService(redis);
    await service.onModuleInit();
    mockQueue.getJob.mockResolvedValue(null);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
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

  it('maintenance 模式应拒绝新的 conversation execution', async () => {
    process.env.APP_SANDBOX_MAINTENANCE_MODE = 'true';

    await expect(
      service.handleMessageSent({
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        messageId: 'message-1',
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(mockQueue.add).not.toHaveBeenCalled();
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

  it('取消请求发到另一个实例时，经频道中止本实例的活跃 loop', async () => {
    mockConversationService.cancel.mockResolvedValue({ data: {} });
    const otherInstance = createService(bus.client());
    await otherInstance.onModuleInit();

    const abort = new AbortController();
    const handle = service.registerActiveRun('conversation-1', abort);
    const notifySpy = vi.spyOn(handle!, 'notify');

    await otherInstance.cancelExecution('conversation-1');

    expect(abort.signal.aborted).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    await otherInstance.onModuleDestroy();
  });

  it('本地没有活跃 loop 时仍会广播取消，频道上的非法消息被忽略', async () => {
    mockConversationService.cancel.mockResolvedValue({ data: {} });
    const abort = new AbortController();
    service.registerActiveRun('conversation-2', abort);

    await redis.publish(AGENT_CONVERSATION_CANCEL_CHANNEL, 'not-json');
    await redis.publish(
      AGENT_CONVERSATION_CANCEL_CHANNEL,
      JSON.stringify({ conversationId: 42 }),
    );
    await service.cancelExecution('conversation-1');

    expect(redis.publish).toHaveBeenLastCalledWith(
      AGENT_CONVERSATION_CANCEL_CHANNEL,
      JSON.stringify({ conversationId: 'conversation-1' }),
    );
    expect(abort.signal.aborted).toBe(false);
  });

  it('abortExecution 跨实例中止活跃 loop，但不结束对话', async () => {
    const otherInstance = createService(bus.client());
    await otherInstance.onModuleInit();
    const abort = new AbortController();
    service.registerActiveRun('conversation-1', abort);

    await otherInstance.abortExecution('conversation-1');

    expect(abort.signal.aborted).toBe(true);
    expect(mockConversationService.cancel).not.toHaveBeenCalled();
    await otherInstance.onModuleDestroy();
  });

  it('dispatchExecution 把派发失败抛给调用方，已派发的 message-sent 事件不再重复入队', async () => {
    process.env.APP_SANDBOX_MAINTENANCE_MODE = 'true';
    await expect(
      service.dispatchExecution('conversation-1', 'tenant-1'),
    ).rejects.toMatchObject({ status: 503 });

    delete process.env.APP_SANDBOX_MAINTENANCE_MODE;
    await service.handleMessageSent({
      conversationId: 'conversation-1',
      tenantId: 'tenant-1',
      messageId: 'message-1',
      executionDispatched: true,
    });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });
});
