import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { SandboxContainerNotFoundException } from '../sandbox.exceptions';

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
      service.createContainer('session-1', {
        cpu: 1.5,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ containerId: 'runtime-1' });

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
      service.createContainer('session-1', {
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ containerId: 'runtime-1' });

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
    await expect(
      service.inspectRuntime('missing-runtime'),
    ).rejects.toBeInstanceOf(SandboxContainerNotFoundException);
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
});
