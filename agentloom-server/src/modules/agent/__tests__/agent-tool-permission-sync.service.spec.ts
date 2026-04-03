import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentToolPermissionSyncService } from '../agent-tool-permission-sync.service';

function createMockRedisClient() {
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

  client.duplicate.mockReturnValue(client);
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
});
