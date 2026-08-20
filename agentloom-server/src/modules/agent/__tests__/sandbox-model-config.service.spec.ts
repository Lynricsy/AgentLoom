/**
 * Sandbox 模型配置服务回归：直接验证 payload 边界与 guest session 初始化错误语义。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxModelConfigService } from '../sandbox-model-config.service';

const session = {
  id: 'session-1',
  agentId: 'agent-1',
  mode: 'workflow',
  context: { history: [], cwd: '/workspace/' },
  status: 'active',
  systemPrompt: '  system prompt  ',
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe('SandboxModelConfigService', () => {
  let service: SandboxModelConfigService;
  let runtimeDriver: { requestGuest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    runtimeDriver = { requestGuest: vi.fn() };
    service = new SandboxModelConfigService(
      {} as never,
      runtimeDriver as never,
      undefined,
      undefined,
    );
  });

  it('无 pi generator 时仍保留 systemPrompt、MCP 与 nativeToolPolicy', async () => {
    await expect(
      service.buildContainerSessionPayload({
        session: session as never,
        mcpServers: { search: { url: 'https://mcp.test' } as never },
        runtimeConfig: { nativeToolPolicy: { bash: false } } as never,
      }),
    ).resolves.toEqual({
      systemPrompt: 'system prompt',
      mcpServers: { search: { url: 'https://mcp.test' } },
      nativeToolPolicy: { bash: false },
    });
  });

  it('容器初始化使用短超时并在 ok 时完成', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: true, status: 200 });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await service.initializeContainerSession('runtime-1', {
      sessionId: 'session-1',
    });
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-1',
      '/v1/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(timeout).toHaveBeenCalledWith(5_000);
    timeout.mockRestore();
  });

  it('不可重试 HTTP 状态保持原错误消息', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: false, status: 401 });
    await expect(
      service.initializeContainerSession('runtime-1', {
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Container session init failed with status 401');
  });
});
