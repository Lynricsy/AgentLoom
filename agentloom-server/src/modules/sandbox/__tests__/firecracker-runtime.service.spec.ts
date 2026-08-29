import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Readable } from 'node:stream';

const undiciMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('undici', () => ({
  fetch: undiciMocks.fetch,
  Agent: class MockAgent {},
}));

import type { SandboxRuntimeNode } from '../../../database/schema';
import { FirecrackerRuntimeService } from '../firecracker-runtime.service';
import type {
  CapacitySnapshot,
  SandboxRuntimeNodeRegistryService,
} from '../sandbox-runtime-node-registry.service';
import {
  SandboxCreationException,
  SandboxRuntimeNotFoundException,
} from '../sandbox.exceptions';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeNode(
  id: string,
  baseUrl = 'https://firecracker-runtime:8443',
  status: 'active' | 'draining' | 'disabled' = 'active',
): SandboxRuntimeNode {
  return {
    id,
    baseUrl,
    serverName: null,
    status,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeCapacity(
  overrides: Partial<CapacitySnapshot> = {},
): CapacitySnapshot {
  return {
    vmsUsed: 0,
    vmsLimit: 10,
    vcpuUsed: 0,
    vcpuLimit: 32,
    memoryMiBUsed: 0,
    memoryMiBLimit: 65_536,
    diskGiBUsed: 0,
    diskGiBLimit: 500,
    ...overrides,
  };
}

const DISPATCHER = { sentinel: 'dispatcher' };
interface RegistryStub {
  nodes: SandboxRuntimeNode[];
  listSchedulable: Mock;
  probeNode: Mock;
  getNodeOrThrow: Mock;
  getDispatcher: Mock;
}

function createRegistry(nodes = [makeNode('default')]): RegistryStub {
  const stub: RegistryStub = {
    nodes,
    listSchedulable: vi.fn(async () =>
      stub.nodes.filter((node) => node.status === 'active'),
    ),
    probeNode: vi.fn(async () => ({
      healthy: true,
      capacity: makeCapacity(),
    })),
    getNodeOrThrow: vi.fn(async (nodeId: string) => {
      const node = stub.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) throw new SandboxRuntimeNotFoundException();
      return node;
    }),
    getDispatcher: vi.fn(() => DISPATCHER),
  };
  return stub;
}

function createService(
  registry: RegistryStub = createRegistry(),
): FirecrackerRuntimeService {
  return new FirecrackerRuntimeService(
    registry as unknown as SandboxRuntimeNodeRegistryService,
  );
}

describe('FirecrackerRuntimeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('通过 mTLS manager 创建 microVM 并返回带节点前缀的复合 handle', async () => {
    undiciMocks.fetch.mockResolvedValueOnce(
      jsonResponse({ runtimeHandle: 'runtime-1', state: 'running' }, 201),
    );
    const registry = createRegistry();
    const service = createService(registry);

    await expect(
      service.createRuntime('session-1', {
        cpu: 1.5,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ runtimeHandle: 'default/runtime-1' });

    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      'https://firecracker-runtime:8443/v1/vms',
      expect.objectContaining({
        method: 'POST',
        dispatcher: DISPATCHER,
        body: JSON.stringify({
          id: 'session-1',
          cpu: 1.5,
          memoryMiB: 512,
          diskGiB: 2,
          lifecycleMode: 'persistent',
        }),
      }),
    );
    expect(registry.getDispatcher).toHaveBeenCalledWith(registry.nodes[0]);
  });

  it('manager 重启恢复出 stopped persistent runtime 时显式 start 且复用 handle', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'stopped' }, 200),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const service = createService();

    await expect(
      service.createRuntime('session-1', {
        cpu: 1,
        memory: 512,
        disk: 2,
        timeout: 1,
        lifecycleMode: 'persistent',
      }),
    ).resolves.toEqual({ runtimeHandle: 'default/runtime-1' });

    expect(undiciMocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://firecracker-runtime:8443/v1/vms/runtime-1:start',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('复合 handle 按节点前缀路由到对应 manager 基址', async () => {
    undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const registry = createRegistry([
      makeNode('node-a', 'https://a.internal:8443'),
      makeNode('node-b', 'https://b.internal:8443'),
    ]);
    const service = createService(registry);

    await service.startRuntime('node-a/vm-1');
    await service.startRuntime('node-b/vm-2');

    expect(undiciMocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://a.internal:8443/v1/vms/vm-1:start',
      'https://b.internal:8443/v1/vms/vm-2:start',
    ]);
  });

  it('未注册节点与裸 handle 都 fail-closed，绝不回退到默认节点', async () => {
    const service = createService();

    await expect(service.startRuntime('ghost/vm-1')).rejects.toBeInstanceOf(
      SandboxRuntimeNotFoundException,
    );
    await expect(service.startRuntime('legacy-bare')).rejects.toBeInstanceOf(
      SandboxRuntimeNotFoundException,
    );
    expect(undiciMocks.fetch).not.toHaveBeenCalled();
  });

  it('inspectRuntime 返回 manager lifecycle state 并明确映射 404', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'stopped' }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    const service = createService();

    await expect(service.inspectRuntime('default/runtime-1')).resolves.toEqual({
      state: 'stopped',
    });
    const notFoundError = await service
      .inspectRuntime('default/missing-runtime')
      .then(() => null)
      .catch((error: unknown) => error);
    expect(notFoundError).toBeInstanceOf(SandboxRuntimeNotFoundException);
    expect(JSON.stringify(notFoundError)).not.toContain('missing-runtime');
  });

  it('只通过 manager guest proxy 转发 session 请求', async () => {
    undiciMocks.fetch.mockResolvedValueOnce(jsonResponse({ sessionId: 's1' }));
    const service = createService();
    const body = JSON.stringify({ sessionId: 's1' });

    const response = await service.requestGuest(
      'default/runtime-1',
      '/v1/session',
      { method: 'POST', body },
    );

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
    const service = createService();
    const handle = await service.createExec('default/runtime-1', {
      command: 'pwd',
    });
    const events: string[] = [];

    await service.attachExecOutput(handle.execId, (level, message) => {
      events.push(`${level}:${message}`);
    });

    expect(handle).toEqual({ execId: 'default/runtime-1:guest-exec' });
    expect(events).toEqual(['stdout:hello']);
    expect(undiciMocks.fetch).toHaveBeenNthCalledWith(
      2,
      'https://firecracker-runtime:8443/v1/vms/runtime-1/guest/v1/runtime/exec/guest-exec/output',
      expect.any(Object),
    );
  });

  it('默认 session 生命周期并拒绝未知 runtime 状态', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-1', state: 'running' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'runtime-2', state: 'starting' }, 201),
      );
    const service = createService();

    await expect(
      service.createRuntime('session-1', {
        cpu: 1,
        memory: 256,
        disk: 1,
        timeout: 1,
        restoreWorkspaceId: 'workspace-1',
      }),
    ).resolves.toEqual({ runtimeHandle: 'default/runtime-1' });
    expect(undiciMocks.fetch).toHaveBeenNthCalledWith(
      1,
      'https://firecracker-runtime:8443/v1/vms',
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

  it('start/stop/delete 均编码节点内 handle，delete 明确保留或清除磁盘', async () => {
    undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const service = createService();

    await service.startRuntime('default/runtime/1');
    await service.stopRuntime('default/runtime/1');
    await service.deleteRuntime('default/runtime/1', { removeVolumes: false });
    await service.deleteRuntime('default/runtime/1');

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
    const service = createService();

    await expect(service.healthCheck('default/r1')).resolves.toBe(false);
    await expect(service.healthCheck('default/r1')).resolves.toBe(false);
    await expect(service.healthCheck('default/r1')).resolves.toBe(false);
    await expect(service.healthCheck('ghost/r1')).resolves.toBe(false);
  });

  it('暴露编码后的 guest URL，并规范化无前导斜杠的 guest path', async () => {
    undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const service = createService();

    await expect(service.getPromptUrl('default/runtime/1')).resolves.toContain(
      '/runtime%2F1/guest/v1/prompt',
    );
    await expect(service.getSessionUrl('default/runtime/1')).resolves.toContain(
      '/runtime%2F1/guest/v1/session',
    );
    await service.requestGuest('default/runtime/1', 'health');
    expect(undiciMocks.fetch).toHaveBeenCalledWith(
      'https://firecracker-runtime:8443/v1/vms/runtime%2F1/guest/health',
      expect.any(Object),
    );
  });

  it('attachLogs 根据 guest 健康响应报告可观察级别', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const service = createService();
    const events: Array<[string, string]> = [];

    await service.attachLogs('default/r1', (level, message) =>
      events.push([level, message]),
    );
    await service.attachLogs('default/r1', (level, message) =>
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
    const service = createService();

    const archive = await service.getArchive('default/r1', '/workspace/a b');
    const chunks: Buffer[] = [];
    for await (const chunk of archive) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('archive');
    await expect(
      service.putArchive('default/r1', Readable.from('data'), '/workspace'),
    ).resolves.toBeUndefined();
    await expect(service.getArchive('default/r1', '/bad')).rejects.toThrow(
      'Guest archive failed with status 500',
    );
    await expect(
      service.putArchive('default/r1', Readable.from('data'), '/bad'),
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
    const service = createService();

    await expect(
      service.readTextFile('default/r1', '/a b', 5),
    ).resolves.toEqual(Buffer.from('hello'));
    await expect(
      service.validateTextFileWrite('default/r1', '/a b', 5),
    ).resolves.toBeUndefined();
    await expect(
      service.writeTextFile('default/r1', '/a b', 'hello', 5),
    ).resolves.toBeUndefined();
    await expect(service.readTextFile('default/r1', '/bad', 5)).rejects.toThrow(
      'Guest file read failed with status 413',
    );
    await expect(
      service.validateTextFileWrite('default/r1', '/bad', 5),
    ).rejects.toThrow('Guest file write validation failed with status 403');
    await expect(
      service.writeTextFile('default/r1', '/bad', 'x', 5),
    ).rejects.toThrow('Guest file write failed with status 507');
  });

  it('exec wait/kill/stats/processes 规范化响应并拒绝错误 handle 或 guest 错误', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(jsonResponse({ exitCode: 7, signal: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(jsonResponse({ cpuPercent: 2, memoryUsageMb: 3 }))
      .mockResolvedValueOnce(jsonResponse([{ pid: 1, command: 'init' }]))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const service = createService();

    await expect(service.waitForExecExit('default/r1:e/1')).resolves.toEqual({
      exitCode: 7,
      signal: null,
    });
    await expect(service.killExec('default/r1:e/1')).resolves.toBeUndefined();
    expect(undiciMocks.fetch.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ signal: 'TERM' }) }),
    );
    await expect(service.killExec('default/r1:e/1', 'KILL')).rejects.toThrow(
      'Kill guest exec failed with status 409',
    );
    await expect(service.getRuntimeStats('default/r1')).resolves.toEqual({
      cpuPercent: 2,
      memoryUsageMb: 3,
    });
    await expect(service.listRuntimeProcesses('default/r1')).resolves.toEqual([
      { pid: 1, command: 'init' },
    ]);
    await expect(service.getRuntimeStats('default/r1')).rejects.toThrow(
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

  it('manager 非 guest 错误统一映射且每次请求都取节点 dispatcher', async () => {
    undiciMocks.fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'broken' }, 500))
      .mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'r1', state: 'running' }),
      );
    const registry = createRegistry();
    const service = createService(registry);

    await expect(service.inspectRuntime('default/r1')).rejects.toThrow(
      'Firecracker runtime request failed (500)',
    );
    await expect(service.inspectRuntime('default/r1')).resolves.toEqual({
      state: 'running',
    });
    expect(registry.getDispatcher).toHaveBeenCalledTimes(2);
  });

  describe('容量感知调度', () => {
    it('优先选空闲内存比最大的节点，并跳过不健康节点', async () => {
      undiciMocks.fetch.mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'vm-1', state: 'running' }, 201),
      );
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443'),
        makeNode('node-b', 'https://b.internal:8443'),
        makeNode('node-c', 'https://c.internal:8443'),
      ]);
      registry.probeNode.mockImplementation(
        async (node: SandboxRuntimeNode) => {
          if (node.id === 'node-a') {
            return {
              healthy: true,
              capacity: makeCapacity({ memoryMiBUsed: 60_000 }),
            };
          }
          if (node.id === 'node-b') return { healthy: false };
          return {
            healthy: true,
            capacity: makeCapacity({ memoryMiBUsed: 1_024 }),
          };
        },
      );
      const service = createService(registry);

      await expect(
        service.createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        }),
      ).resolves.toEqual({ runtimeHandle: 'node-c/vm-1' });
      expect(undiciMocks.fetch).toHaveBeenCalledTimes(1);
      expect(undiciMocks.fetch.mock.calls[0]?.[0]).toBe(
        'https://c.internal:8443/v1/vms',
      );
    });

    it('剔除余量不足的节点，只把请求投给放得下的机器', async () => {
      undiciMocks.fetch.mockResolvedValueOnce(
        jsonResponse({ runtimeHandle: 'vm-1', state: 'running' }, 201),
      );
      const registry = createRegistry([
        makeNode('node-full', 'https://full.internal:8443'),
        makeNode('node-free', 'https://free.internal:8443'),
      ]);
      registry.probeNode.mockImplementation(async (node: SandboxRuntimeNode) =>
        node.id === 'node-full'
          ? {
              healthy: true,
              capacity: makeCapacity({ vmsUsed: 10, memoryMiBUsed: 0 }),
            }
          : {
              healthy: true,
              capacity: makeCapacity({ memoryMiBUsed: 32_768 }),
            },
      );
      const service = createService(registry);

      await expect(
        service.createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        }),
      ).resolves.toEqual({ runtimeHandle: 'node-free/vm-1' });
      expect(undiciMocks.fetch.mock.calls[0]?.[0]).toBe(
        'https://free.internal:8443/v1/vms',
      );
    });

    it('节点返回 503 时回退到下一个节点', async () => {
      undiciMocks.fetch
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(
          jsonResponse({ runtimeHandle: 'vm-1', state: 'running' }, 201),
        );
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443'),
        makeNode('node-b', 'https://b.internal:8443'),
      ]);
      registry.probeNode.mockImplementation(
        async (node: SandboxRuntimeNode) => ({
          healthy: true,
          capacity: makeCapacity({
            memoryMiBUsed: node.id === 'node-a' ? 0 : 1_024,
          }),
        }),
      );
      const service = createService(registry);

      await expect(
        service.createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        }),
      ).resolves.toEqual({ runtimeHandle: 'node-b/vm-1' });
      expect(undiciMocks.fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://a.internal:8443/v1/vms',
        'https://b.internal:8443/v1/vms',
      ]);
    });

    it('非容量类错误不换节点，直接上抛', async () => {
      undiciMocks.fetch.mockResolvedValueOnce(
        new Response(null, { status: 400 }),
      );
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443'),
        makeNode('node-b', 'https://b.internal:8443'),
      ]);
      const service = createService(registry);

      await expect(
        service.createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        }),
      ).rejects.toThrow('Firecracker runtime request failed (400)');
      expect(undiciMocks.fetch).toHaveBeenCalledTimes(1);
    });

    it('所有节点都失败时抛 SandboxCreationException 并列出尝试过的节点', async () => {
      undiciMocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443'),
        makeNode('node-b', 'https://b.internal:8443'),
      ]);
      const service = createService(registry);

      const error = await service
        .createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        })
        .then(() => null)
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(SandboxCreationException);
      expect((error as SandboxCreationException).detail).toContain('node-a');
      expect((error as SandboxCreationException).detail).toContain('node-b');
    });

    it('无 active 节点时立刻失败，不发任何 manager 请求', async () => {
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443', 'disabled'),
      ]);
      const service = createService(registry);

      const error = await service
        .createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        })
        .then(() => null)
        .catch((value: unknown) => value);

      expect((error as SandboxCreationException).detail).toContain(
        'No active sandbox runtime nodes registered',
      );
      expect(undiciMocks.fetch).not.toHaveBeenCalled();
    });

    it('全部节点探针失败时报告已探测节点，不盲发请求', async () => {
      const registry = createRegistry([
        makeNode('node-a', 'https://a.internal:8443'),
        makeNode('node-b', 'https://b.internal:8443'),
      ]);
      registry.probeNode.mockResolvedValue({ healthy: false });
      const service = createService(registry);

      const error = await service
        .createRuntime('session-1', {
          cpu: 1,
          memory: 512,
          disk: 1,
          timeout: 1,
        })
        .then(() => null)
        .catch((value: unknown) => value);

      expect((error as SandboxCreationException).detail).toContain(
        'No healthy sandbox runtime nodes (probed: node-a, node-b)',
      );
      expect(undiciMocks.fetch).not.toHaveBeenCalled();
    });
  });
});
