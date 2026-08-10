import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const undiciMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  agentOptions: [] as unknown[],
}));

vi.mock('undici', () => ({
  fetch: undiciMocks.fetch,
  Agent: class MockAgent {
    constructor(options: unknown) {
      undiciMocks.agentOptions.push(options);
    }
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(() => Buffer.from('test-pem')) };
});

import { FirecrackerRuntimeService } from '../firecracker-runtime.service';
import { SandboxRuntimeNotFoundException } from '../sandbox.exceptions';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FirecrackerRuntimeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undiciMocks.agentOptions.length = 0;
    process.env.APP_FIRECRACKER_RUNTIME_URL =
      'https://firecracker-runtime:8443';
    process.env.APP_FIRECRACKER_RUNTIME_SERVER_NAME = 'firecracker-runtime';
  });

  it('通过 mTLS manager 创建 microVM 并返回 opaque runtime handle', async () => {
    undiciMocks.fetch.mockResolvedValueOnce(
      jsonResponse({ runtimeHandle: 'runtime-1', state: 'running' }, 201),
    );
    const service = new FirecrackerRuntimeService();

    await expect(
      service.createRuntime('session-1', {
        cpu: 1.5,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ runtimeHandle: 'runtime-1' });

    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      'https://firecracker-runtime:8443/v1/vms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id: 'session-1',
          cpu: 1.5,
          memoryMiB: 512,
          diskGiB: 2,
          lifecycleMode: 'persistent',
        }),
      }),
    );
    expect(undiciMocks.agentOptions[0]).toEqual(
      expect.objectContaining({
        connect: expect.objectContaining({
          rejectUnauthorized: true,
          servername: 'firecracker-runtime',
          ca: Buffer.from('test-pem'),
          cert: Buffer.from('test-pem'),
          key: Buffer.from('test-pem'),
        }),
      }),
    );
  });

  it('manager 重启恢复出 stopped persistent runtime 时显式 start 且复用 handle', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'stopped' }, 200),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const service = new FirecrackerRuntimeService();

    await expect(
      service.createRuntime('session-1', {
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ runtimeHandle: 'runtime-1' });

    expect(undiciMocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://firecracker-runtime:8443/v1/vms/runtime-1:start',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('inspectRuntime 返回 manager lifecycle state 并明确映射 404', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'stopped' }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    const service = new FirecrackerRuntimeService();

    await expect(service.inspectRuntime('runtime-1')).resolves.toEqual({
      state: 'stopped',
    });
    const notFoundError = await service
      .inspectRuntime('missing-runtime')
      .then(() => null)
      .catch((error: unknown) => error);
    expect(notFoundError).toBeInstanceOf(SandboxRuntimeNotFoundException);
    expect(JSON.stringify(notFoundError)).not.toContain('missing-runtime');
  });

  it('只通过 manager guest proxy 转发 session 请求', async () => {
    undiciMocks.fetch.mockResolvedValueOnce(jsonResponse({ sessionId: 's1' }));
    const service = new FirecrackerRuntimeService();
    const body = JSON.stringify({ sessionId: 's1' });

    const response = await service.requestGuest('runtime-1', '/v1/session', {
      method: 'POST',
      body,
    });

    expect(response.ok).toBe(true);
    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      'https://firecracker-runtime:8443/v1/vms/runtime-1/guest/v1/session',
      expect.objectContaining({ method: 'POST', body }),
    );
  });

  it('为 guest exec handle 加 runtime namespace 并解码输出', async () => {
    const output = `${JSON.stringify({ level: 'stdout', data: Buffer.from('hello').toString('base64') })}\n`;
    undiciMocks.fetch
      .mockResolvedValueOnce(jsonResponse({ execId: 'guest-exec' }, 201))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(output));
              controller.close();
            },
          }),
          { status: 200 },
        ),
      );
    const service = new FirecrackerRuntimeService();
    const handle = await service.createExec('runtime-1', { command: 'pwd' });
    const events: string[] = [];

    await service.attachExecOutput(handle.execId, (level, message) => {
      events.push(`${level}:${message}`);
    });

    expect(handle).toEqual({ execId: 'runtime-1:guest-exec' });
    expect(events).toEqual(['stdout:hello']);
  });

  it('规范化 manager 地址、默认 session 生命周期，并拒绝未知 runtime 状态', async () => {
    process.env.APP_FIRECRACKER_RUNTIME_URL = 'https://manager.example/';
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'running' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-2', state: 'starting' }, 201),
      );
    const service = new FirecrackerRuntimeService();

    await expect(
      service.createRuntime('session-1', {
        cpu: 1,
        memory: 256,
        disk: 1,
        timeout: 1,
        restoreWorkspaceId: 'workspace-1',
      }),
    ).resolves.toEqual({ runtimeHandle: 'runtime-1' });
    expect(undiciMocks.fetch).toHaveBeenNthCalledWith(
      1,
      'https://manager.example/v1/vms',
      expect.objectContaining({
        body: JSON.stringify({
          id: 'session-1',
          cpu: 1,
          memoryMiB: 256,
          diskGiB: 1,
          lifecycleMode: 'session',
          workspaceId: 'workspace-1',
        }),
      }),
    );
    await expect(
      service.createRuntime('session-2', {
        cpu: 1,
        memory: 256,
        disk: 1,
        timeout: 1,
      }),
    ).rejects.toThrow('Firecracker runtime is starting');
  });

  it('start/stop/delete 均编码 handle，delete 明确保留或清除磁盘', async () => {
    undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const service = new FirecrackerRuntimeService();

    await service.startRuntime('runtime/1');
    await service.stopRuntime('runtime/1');
    await service.deleteRuntime('runtime/1', { removeVolumes: false });
    await service.deleteRuntime('runtime/1');

    expect(undiciMocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1:start',
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1:stop',
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1?deleteDisk=false',
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1?deleteDisk=true',
    ]);
  });

  it('healthCheck 仅在 running 且 guest 健康时为真，并吞掉 manager 错误', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'r1', state: 'stopped' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'r1', state: 'running' }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error('manager unavailable'));
    const service = new FirecrackerRuntimeService();

    await expect(service.healthCheck('r1')).resolves.toBe(false);
    await expect(service.healthCheck('r1')).resolves.toBe(false);
    await expect(service.healthCheck('r1')).resolves.toBe(false);
  });

  it('暴露编码后的 guest URL，并规范化无前导斜杠的 guest path', async () => {
    undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const service = new FirecrackerRuntimeService();

    await expect(service.getPromptUrl('runtime/1')).resolves.toContain(
      '/runtime%2F1/guest/v1/prompt',
    );
    await expect(service.getSessionUrl('runtime/1')).resolves.toContain(
      '/runtime%2F1/guest/v1/session',
    );
    await service.requestGuest('runtime/1', 'health');
    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1/guest/health',
      expect.any(Object),
    );
  });

  it('attachLogs 根据 guest 健康响应报告可观察级别', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const service = new FirecrackerRuntimeService();
    const events: Array<[string, string]> = [];

    await service.attachLogs('r1', (level, message) =>
      events.push([level, message]),
    );
    await service.attachLogs('r1', (level, message) =>
      events.push([level, message]),
    );

    expect(events).toEqual([
      ['info', 'Firecracker guest health status=204'],
      ['error', 'Firecracker guest health status=503'],
    ]);
  });

  it('archive 获取/恢复保留二进制内容并映射 guest 错误', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(new Response('archive', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const service = new FirecrackerRuntimeService();

    const archive = await service.getArchive('r1', '/workspace/a b');
    const chunks: Buffer[] = [];
    for await (const chunk of archive) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('archive');
    await expect(
      service.putArchive('r1', Readable.from('data'), '/workspace'),
    ).resolves.toBeUndefined();
    await expect(service.getArchive('r1', '/bad')).rejects.toThrow(
      'Guest archive failed with status 500',
    );
    await expect(
      service.putArchive('r1', Readable.from('data'), '/bad'),
    ).rejects.toThrow('Guest archive restore failed with status 500');
  });

  it('文本文件读写与预检透传内容、限额并映射失败状态', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(new Response('hello', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 413 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 507 }));
    const service = new FirecrackerRuntimeService();

    await expect(service.readTextFile('r1', '/a b', 5)).resolves.toEqual(
      Buffer.from('hello'),
    );
    await expect(
      service.validateTextFileWrite('r1', '/a b', 5),
    ).resolves.toBeUndefined();
    await expect(
      service.writeTextFile('r1', '/a b', 'hello', 5),
    ).resolves.toBeUndefined();
    await expect(service.readTextFile('r1', '/bad', 5)).rejects.toThrow(
      'Guest file read failed with status 413',
    );
    await expect(
      service.validateTextFileWrite('r1', '/bad', 5),
    ).rejects.toThrow('Guest file write validation failed with status 403');
    await expect(service.writeTextFile('r1', '/bad', 'x', 5)).rejects.toThrow(
      'Guest file write failed with status 507',
    );
  });

  it('exec wait/kill/stats/processes 规范化响应并拒绝错误 handle 或 guest 错误', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(jsonResponse({ exitCode: 7, signal: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(jsonResponse({ cpuPercent: 2, memoryUsageMb: 3 }))
      .mockResolvedValueOnce(jsonResponse([{ pid: 1, command: 'init' }]))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const service = new FirecrackerRuntimeService();

    await expect(service.waitForExecExit('r1:e/1')).resolves.toEqual({
      exitCode: 7,
      signal: null,
    });
    await expect(service.killExec('r1:e/1')).resolves.toBeUndefined();
    expect(undiciMocks.fetch.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ signal: 'TERM' }) }),
    );
    await expect(service.killExec('r1:e/1', 'KILL')).rejects.toThrow(
      'Kill guest exec failed with status 409',
    );
    await expect(service.getRuntimeStats('r1')).resolves.toEqual({
      cpuPercent: 2,
      memoryUsageMb: 3,
    });
    await expect(service.listRuntimeProcesses('r1')).resolves.toEqual([
      { pid: 1, command: 'init' },
    ]);
    await expect(service.getRuntimeStats('r1')).rejects.toThrow(
      'read guest stats failed with status 500',
    );
    await expect(service.waitForExecExit('missing-colon')).rejects.toThrow(
      'Invalid Firecracker exec handle',
    );
    await expect(service.killExec(':missing-runtime')).rejects.toThrow(
      'Invalid Firecracker exec handle',
    );
    await expect(service.killExec('runtime:')).rejects.toThrow(
      'Invalid Firecracker exec handle',
    );
  });

  it('manager 非 guest 错误统一映射且复用 mTLS dispatcher', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'broken' }, 500))
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'r1', state: 'running' }),
      );
    delete process.env.APP_FIRECRACKER_RUNTIME_SERVER_NAME;
    const service = new FirecrackerRuntimeService();

    await expect(service.inspectRuntime('r1')).rejects.toThrow(
      'Firecracker runtime request failed (500)',
    );
    await expect(service.inspectRuntime('r1')).resolves.toEqual({
      state: 'running',
    });
    expect(undiciMocks.agentOptions).toHaveLength(1);
    expect(undiciMocks.agentOptions[0]).toEqual(
      expect.objectContaining({
        connect: expect.objectContaining({ servername: 'firecracker-runtime' }),
      }),
    );
  });
});
