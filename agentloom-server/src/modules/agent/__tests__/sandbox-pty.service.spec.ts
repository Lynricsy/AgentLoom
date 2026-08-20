/**
 * Sandbox PTY service 回归：直接验证 guest proxy 的路径、请求体与错误语义，
 * 不通过 facade 或真实 sandbox 会话。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxPtyService } from '../sandbox-pty.service';

const binding = { executionId: 'exec-001' };

describe('SandboxPtyService', () => {
  let service: SandboxPtyService;
  let sessionRuntime: { waitForSandboxReady: ReturnType<typeof vi.fn> };
  let runtimeDriver: { requestGuest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionRuntime = {
      waitForSandboxReady: vi.fn().mockResolvedValue({
        id: 'sandbox-001',
        status: 'ready',
        runtimeHandle: 'runtime-001',
      }),
    };
    runtimeDriver = { requestGuest: vi.fn() };
    service = new SandboxPtyService(
      sessionRuntime as never,
      runtimeDriver as never,
    );
  });

  it('listPtySessions 代理 GET 并返回 JSON', async () => {
    const result = [{ id: 'pty-001', status: 'running' }];
    runtimeDriver.requestGuest.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(result),
    });
    await expect(
      service.listPtySessions(binding, 'tenant-001'),
    ).resolves.toEqual(result);
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-001',
      '/v1/pty/sessions',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('listPtySessions 非 ok 保留状态错误', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      service.listPtySessions(binding, 'tenant-001'),
    ).rejects.toThrow('PTY sessions 查询失败: status=500');
  });

  it('ptyBufferDump 转发 offset 与 limit', async () => {
    const result = { lines: [{ lineNo: 1, text: 'hello' }], totalLines: 1 };
    runtimeDriver.requestGuest.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(result),
    });
    await expect(
      service.ptyBufferDump(binding, 'tenant-001', 'pty-001', {
        offset: 0,
        limit: 100,
      }),
    ).resolves.toEqual(result);
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-001',
      '/v1/pty/buffer-dump',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'pty-001', offset: 0, limit: 100 }),
      }),
    );
  });

  it('ptyBufferDump 转发 pattern', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ lines: [], totalLines: 0 }),
    });
    await service.ptyBufferDump(binding, 'tenant-001', 'pty-001', {
      pattern: 'error',
    });
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-001',
      '/v1/pty/buffer-dump',
      expect.objectContaining({
        body: JSON.stringify({ sessionId: 'pty-001', pattern: 'error' }),
      }),
    );
  });

  it('ptyBufferDump 非 ok 保持错误语义', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      service.ptyBufferDump(binding, 'tenant-001', 'pty-001'),
    ).rejects.toThrow('PTY buffer-dump 失败: status=404');
  });

  it('ptyWrite 代理数据并返回 JSON', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    await expect(
      service.ptyWrite(binding, 'tenant-001', 'pty-001', 'ls -la\n'),
    ).resolves.toEqual({ success: true });
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-001',
      '/v1/pty/write',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'pty-001', data: 'ls -la\n' }),
      }),
    );
  });

  it('ptyWrite 非 ok 保持错误语义', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: false, status: 400 });
    await expect(
      service.ptyWrite(binding, 'tenant-001', 'pty-001', 'x'),
    ).rejects.toThrow('PTY write 失败: status=400');
  });

  it('ptyWrite 原样转发 conversation 绑定给会话运行时', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    const conversationBinding = { agentConversationId: 'conv-001' };
    await service.ptyWrite(
      conversationBinding,
      'tenant-001',
      'pty-conv',
      'echo hi\n',
    );
    expect(sessionRuntime.waitForSandboxReady).toHaveBeenCalledWith(
      conversationBinding,
      'tenant-001',
    );
  });
});
