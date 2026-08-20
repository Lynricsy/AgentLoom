/**
 * Sandbox 会话运行时服务回归：覆盖绑定优先级、就绪探测、失败日志和 prompt 代理。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxSessionRuntimeService } from '../sandbox-session-runtime.service';

describe('SandboxSessionRuntimeService', () => {
  let service: SandboxSessionRuntimeService;
  let sandboxService: Record<string, ReturnType<typeof vi.fn>>;
  let runtimeDriver: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    sandboxService = {
      getSandboxSession: vi.fn(),
      findByConversationId: vi.fn(),
      findLatestByExecutionId: vi.fn().mockResolvedValue(null),
      findLatestByConversationId: vi.fn().mockResolvedValue(null),
      getSandboxLogs: vi.fn().mockResolvedValue([]),
    };
    runtimeDriver = {
      healthCheck: vi.fn().mockResolvedValue(true),
      requestGuest: vi.fn(),
    };
    service = new SandboxSessionRuntimeService(
      sandboxService as never,
      runtimeDriver as never,
    );
  });

  it('顶层绑定优先于 nested serverSandbox 并保留 sandboxNodeId', () => {
    expect(
      service.readSandboxBinding({
        executionId: 'top-exec',
        serverSandbox: {
          executionId: 'nested-exec',
          agentConversationId: 'nested-conv',
          sandboxNodeId: 'node-1',
        },
      }),
    ).toEqual({
      executionId: 'top-exec',
      agentConversationId: 'nested-conv',
      sandboxNodeId: 'node-1',
    });
  });

  it('ready 且 healthCheck 成功时返回带 runtimeHandle 的 session', async () => {
    sandboxService.getSandboxSession.mockResolvedValue({
      id: 'sandbox-1',
      status: 'ready',
      runtimeHandle: 'runtime-1',
    });
    await expect(
      service.waitForSandboxReady({ executionId: 'exec-1' }, 'tenant-1'),
    ).resolves.toMatchObject({ runtimeHandle: 'runtime-1' });
    expect(runtimeDriver.healthCheck).toHaveBeenCalledWith('runtime-1');
  });

  it('最近失败 session 优先暴露创建失败日志', async () => {
    sandboxService.findByConversationId.mockResolvedValue(null);
    sandboxService.findLatestByConversationId.mockResolvedValue({
      id: 'sandbox-failed',
      status: 'failed',
    });
    sandboxService.getSandboxLogs.mockResolvedValue([
      { level: 'system', message: 'Sandbox creation failed: image missing' },
    ]);
    await expect(
      service.waitForSandboxReady(
        { agentConversationId: 'conv-1' },
        'tenant-1',
      ),
    ).rejects.toThrow('Sandbox creation failed: image missing');
  });

  it('requestPrompt 在事务无关的 guest transport 上转发完整输入', async () => {
    sandboxService.getSandboxSession.mockResolvedValue({
      id: 'sandbox-1',
      status: 'ready',
      runtimeHandle: 'runtime-1',
    });
    runtimeDriver.requestGuest.mockResolvedValue({ ok: true, body: {} });
    await service.requestPrompt(
      { executionId: 'exec-1' },
      'tenant-1',
      'session-1',
      [{ type: 'text', text: 'hello' }],
    );
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-1',
      '/v1/prompt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sessionId: 'session-1',
          content: [{ type: 'text', text: 'hello' }],
          cwd: '/workspace/',
        }),
      }),
    );
  });
});
