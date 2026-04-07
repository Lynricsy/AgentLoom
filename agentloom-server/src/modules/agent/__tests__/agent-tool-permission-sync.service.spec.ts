import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentToolPermissionSyncService } from '../agent-tool-permission-sync.service';

function createMockRedisClient(options?: { withDuplicate?: boolean }) {
  let messageListener: ((channel: string, payload: string) => void) | undefined;

  const client = {
    status: 'ready',
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(),
    on: vi.fn(
      (event: string, listener: (channel: string, payload: string) => void) => {
        if (event === 'message') {
          messageListener = listener;
        }
        return client;
      },
    ),
    emitMessage(channel: string, payload: string) {
      messageListener?.(channel, payload);
    },
  };

  if (options?.withDuplicate !== false) {
    client.duplicate.mockReturnValue(client);
  } else {
    client.duplicate = undefined;
  }

  return client;
}

describe('AgentToolPermissionSyncService', () => {
  let redisClient: ReturnType<typeof createMockRedisClient>;
  let service: AgentToolPermissionSyncService;

  beforeEach(() => {
    redisClient = createMockRedisClient();
    service = new AgentToolPermissionSyncService(redisClient as never);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('会订阅并在收到远端权限解析消息时唤醒本地 pending resolver', async () => {
    await service.onModuleInit();
    const resolve = vi.fn();

    service.registerPendingResolution('session-1', 'tool-1', resolve);
    redisClient.emitMessage(
      '__agent_tool_permission_resolution__',
      JSON.stringify({
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        action: 'approve',
      }),
    );

    expect(resolve).toHaveBeenCalledWith('approve');
  });

  it('publishResolution 会向 Redis 广播标准化 payload', async () => {
    await service.publishResolution('session-2', 'tool-2', 'deny');

    expect(redisClient.publish).toHaveBeenCalledWith(
      '__agent_tool_permission_resolution__',
      JSON.stringify({
        sessionId: 'session-2',
        toolCallId: 'tool-2',
        action: 'deny',
      }),
    );
  });

  it('收到非法消息时应忽略而不触发本地 resolver', async () => {
    await service.onModuleInit();
    const resolve = vi.fn();

    service.registerPendingResolution('session-3', 'tool-3', resolve);
    redisClient.emitMessage(
      '__agent_tool_permission_resolution__',
      '{"toolCallId":123}',
    );

    expect(resolve).not.toHaveBeenCalled();
  });

  it('publisher 缺少 duplicate 时应降级跳过订阅但仍可广播消息', async () => {
    const redisClientWithoutDuplicate = createMockRedisClient({
      withDuplicate: false,
    });
    const fallbackService = new AgentToolPermissionSyncService(
      redisClientWithoutDuplicate as never,
    );

    await expect(fallbackService.onModuleInit()).resolves.toBeUndefined();
    await expect(
      fallbackService.publishResolution('session-4', 'tool-4', 'approve'),
    ).resolves.toBeUndefined();

    expect(redisClientWithoutDuplicate.subscribe).not.toHaveBeenCalled();
    expect(redisClientWithoutDuplicate.publish).toHaveBeenCalledWith(
      '__agent_tool_permission_resolution__',
      JSON.stringify({
        sessionId: 'session-4',
        toolCallId: 'tool-4',
        action: 'approve',
      }),
    );

    await expect(fallbackService.onModuleDestroy()).resolves.toBeUndefined();
  });
});
