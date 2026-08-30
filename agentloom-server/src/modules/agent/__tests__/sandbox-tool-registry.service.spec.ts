/**
 * Sandbox 工具注册服务回归：验证注册生命周期、回调令牌与外部 HTTP 工具不占用租户事务。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxToolRegistryService } from '../sandbox-tool-registry.service';

const session = {
  id: 'session-1',
  agentId: 'agent-1',
  mode: 'workflow',
  context: { history: [], cwd: '/workspace/' },
  status: 'active',
  tenantId: 'tenant-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe('SandboxToolRegistryService', () => {
  let service: SandboxToolRegistryService;
  let db: { transaction: ReturnType<typeof vi.fn> };
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    db = { transaction: vi.fn() };
    service = new SandboxToolRegistryService(db as never);
    service.initializeSession(session.id);
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  it('runtimeConfig HTTP tool 可注册、解析并在事务外执行', async () => {
    const provider = service.createRuntimeConfigToolProvider(
      session as never,
      {
        tools: [
          {
            toolId: 'http-1',
            toolType: 'http',
            name: 'fetch_status',
            enabled: true,
            url: 'https://api.example.test/status',
            method: 'POST',
            parameterOverrides: { fixed: true },
          },
        ],
      } as never,
    );
    expect(provider).not.toBeNull();
    service.registerSessionToolProvider(session.id, provider!);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const runtimeTool = await service.resolveSessionTool(
      session.id,
      'fetch_status',
    );
    await expect(
      runtimeTool.execute?.(
        { body: { supplied: true }, fixed: false },
        {
          toolCallId: 'call-1',
          messages: [],
          abortSignal: undefined,
          context: undefined,
        },
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('disposeSession 同时移除 provider 与 callback token', async () => {
    service.registerSessionToolProvider(session.id, async () => ({}));
    service.disposeSession(session.id);
    await expect(
      service.resolveSessionTool(session.id, 'missing'),
    ).rejects.toThrow();
    expect(() =>
      service.assertValidSessionToolCallbackToken(session.id, 'token'),
    ).toThrow();
  });

  it('缺失和错误 callback token 保持 UnauthorizedException 语义', async () => {
    service.registerSessionToolProvider(session.id, async () => ({}));
    const payload = await service.buildRemoteToolExecutionPayload(session.id);
    expect(payload).toEqual({});
    expect(() =>
      service.assertValidSessionToolCallbackToken(session.id),
    ).toThrow('callback token is required');
    expect(() =>
      service.assertValidSessionToolCallbackToken(session.id, 'wrong'),
    ).toThrow('callback token is invalid');
  });
});
