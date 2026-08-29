import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

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

import type { DrizzleDB } from '../../../database/database.module';
import type { SandboxRuntimeNode } from '../../../database/schema';
import {
  composeRuntimeHandle,
  splitRuntimeHandle,
} from '../sandbox-runtime-handle.util';
import { SandboxRuntimeNodeRegistryService } from '../sandbox-runtime-node-registry.service';
import {
  SandboxConfigValidationException,
  SandboxNodeAdminForbiddenException,
  SandboxNodeConflictException,
  SandboxNodeNotFoundException,
  SandboxRuntimeNotFoundException,
} from '../sandbox.exceptions';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';

function makeNode(
  id: string,
  overrides: Partial<SandboxRuntimeNode> = {},
): SandboxRuntimeNode {
  return {
    id,
    baseUrl: `https://${id}.internal:8443`,
    serverName: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

interface DbStub {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  /** 依次消费的查询结果，模拟同一测试内的多次查询。 */
  selectResults: unknown[][];
  insertResults: unknown[][];
  updateResults: unknown[][];
  deleteResults: unknown[][];
  selectCalls: number;
}

/**
 * Drizzle 链式 mock：builder 本身是 thenable，await 时弹出下一个预置结果，
 * 因此无需关心 where/limit/orderBy 的调用顺序与次数。
 */
function createDb(): DbStub {
  const stub: DbStub = {
    selectResults: [],
    insertResults: [],
    updateResults: [],
    deleteResults: [],
    selectCalls: 0,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  function builder(queue: unknown[][]): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(queue.shift() ?? []).then(resolve),
    };
    for (const method of [
      'from',
      'where',
      'limit',
      'orderBy',
      'values',
      'set',
      'onConflictDoNothing',
      'returning',
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    return chain;
  }

  stub.select.mockImplementation(() => {
    stub.selectCalls += 1;
    return builder(stub.selectResults);
  });
  stub.insert.mockImplementation(() => builder(stub.insertResults));
  stub.update.mockImplementation(() => builder(stub.updateResults));
  stub.delete.mockImplementation(() => builder(stub.deleteResults));
  return stub;
}

function createService(db: DbStub): SandboxRuntimeNodeRegistryService {
  return new SandboxRuntimeNodeRegistryService(db as unknown as DrizzleDB);
}

function capacityResponse(vmsUsed = 0): Response {
  return new Response(
    JSON.stringify({
      vmsUsed,
      vmsLimit: 10,
      vcpuUsed: 0,
      vcpuLimit: 32,
      memoryMiBUsed: 0,
      memoryMiBLimit: 65_536,
      diskGiBUsed: 0,
      diskGiBLimit: 500,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('SandboxRuntimeNodeRegistryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undiciMocks.agentOptions.length = 0;
    process.env.APP_DEPLOYMENT_MODE = 'private';
    process.env.APP_FIRECRACKER_RUNTIME_URL = 'https://seed-manager:8443/';
    process.env.APP_FIRECRACKER_RUNTIME_SERVER_NAME = 'firecracker-runtime';
    delete process.env.APP_SANDBOX_NODE_ADMIN_TENANT_IDS;
  });

  describe('首启引导', () => {
    it('表为空时按 env 播种 default 节点并规范化尾部斜杠', async () => {
      const db = createDb();
      db.selectResults.push([]);
      db.insertResults.push([{ id: 'default' }]);
      const service = createService(db);

      await service.onModuleInit();

      expect(db.insert).toHaveBeenCalledTimes(1);
      const chain = db.insert.mock.results[0]?.value as { values: Mock };
      expect(chain.values).toHaveBeenCalledWith({
        id: 'default',
        baseUrl: 'https://seed-manager:8443',
        serverName: 'firecracker-runtime',
        status: 'active',
      });
    });

    it('表非空时绝不回写，避免 env 覆盖 DB 真相', async () => {
      const db = createDb();
      db.selectResults.push([{ id: 'node-a' }]);
      const service = createService(db);

      await service.onModuleInit();

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('并发启动时 ON CONFLICT 未插入也不报错', async () => {
      const db = createDb();
      db.selectResults.push([]);
      db.insertResults.push([]);
      const service = createService(db);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('CRUD 校验', () => {
    it('拒绝不合规 id 与非 https 基址，且不落库', async () => {
      const db = createDb();
      const service = createService(db);

      await expect(
        service.createNode({ id: 'Bad_Id', baseUrl: 'https://a.internal' }),
      ).rejects.toBeInstanceOf(SandboxConfigValidationException);
      await expect(
        service.createNode({ id: 'node-a', baseUrl: 'http://a.internal' }),
      ).rejects.toBeInstanceOf(SandboxConfigValidationException);
      await expect(
        service.createNode({ id: 'node-a', baseUrl: 'not-a-url' }),
      ).rejects.toBeInstanceOf(SandboxConfigValidationException);
      await expect(
        service.createNode({ id: '-leading', baseUrl: 'https://a.internal' }),
      ).rejects.toBeInstanceOf(SandboxConfigValidationException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('接受 default 与合规 id，并去掉基址尾部斜杠', async () => {
      const db = createDb();
      db.insertResults.push([makeNode('default')]);
      const service = createService(db);

      await service.createNode({
        id: 'default',
        baseUrl: 'https://a.internal:8443//',
        serverName: '  sni.internal  ',
      });

      const chain = db.insert.mock.results[0]?.value as { values: Mock };
      expect(chain.values).toHaveBeenCalledWith({
        id: 'default',
        baseUrl: 'https://a.internal:8443',
        serverName: 'sni.internal',
        status: 'active',
      });
    });

    it('id 冲突映射为 409', async () => {
      const db = createDb();
      db.insertResults.push([]);
      const service = createService(db);

      await expect(
        service.createNode({ id: 'node-a', baseUrl: 'https://a.internal' }),
      ).rejects.toBeInstanceOf(SandboxNodeConflictException);
    });

    it('更新不存在的节点映射为 404，空白 serverName 归一为 null', async () => {
      const db = createDb();
      db.updateResults.push([]);
      db.updateResults.push([makeNode('node-a')]);
      const service = createService(db);

      await expect(
        service.updateNode('ghost', { status: 'disabled' }),
      ).rejects.toBeInstanceOf(SandboxNodeNotFoundException);

      await service.updateNode('node-a', { serverName: '   ' });
      const chain = db.update.mock.results[1]?.value as { set: Mock };
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ serverName: null }),
      );
    });

    it('删除不存在的节点映射为 404', async () => {
      const db = createDb();
      db.deleteResults.push([]);
      const service = createService(db);

      await expect(service.deleteNode('ghost')).rejects.toBeInstanceOf(
        SandboxNodeNotFoundException,
      );
    });
  });

  describe('缓存', () => {
    it('TTL 内复用快照，写操作后立即失效', async () => {
      const db = createDb();
      db.selectResults.push([makeNode('node-a')]);
      db.updateResults.push([makeNode('node-a', { status: 'disabled' })]);
      db.selectResults.push([makeNode('node-a', { status: 'disabled' })]);
      const service = createService(db);

      await service.listSchedulable();
      await service.listSchedulable();
      expect(db.selectCalls).toBe(1);

      await service.updateNode('node-a', { status: 'disabled' });
      await expect(service.listSchedulable()).resolves.toEqual([]);
      expect(db.selectCalls).toBe(2);
    });

    it('复用快照上 miss 时刷新一次，以接住其他进程刚注册的节点', async () => {
      const db = createDb();
      db.selectResults.push([]);
      db.selectResults.push([makeNode('node-new')]);
      const service = createService(db);

      await service.listSchedulable();
      expect(db.selectCalls).toBe(1);

      const node = await service.getNode('node-new');

      expect(node?.id).toBe('node-new');
      expect(db.selectCalls).toBe(2);
    });

    it('冷启动 miss 不重复查询——同一快照结果必然相同', async () => {
      const db = createDb();
      db.selectResults.push([]);
      const service = createService(db);

      await expect(service.getNode('node-new')).resolves.toBeUndefined();
      expect(db.selectCalls).toBe(1);
    });

    it('确实不存在的节点 fail-closed 抛 SandboxRuntimeNotFoundException', async () => {
      const db = createDb();
      db.selectResults.push([makeNode('node-a')]);
      db.selectResults.push([makeNode('node-a')]);
      const service = createService(db);

      await service.listSchedulable();
      await expect(service.getNodeOrThrow('ghost')).rejects.toBeInstanceOf(
        SandboxRuntimeNotFoundException,
      );
      expect(db.selectCalls).toBe(2);
    });

    it('listSchedulable 只返回 active 节点', async () => {
      const db = createDb();
      db.selectResults.push([
        makeNode('node-a'),
        makeNode('node-b', { status: 'draining' }),
        makeNode('node-c', { status: 'disabled' }),
      ]);
      const service = createService(db);

      await expect(service.listSchedulable()).resolves.toEqual([
        expect.objectContaining({ id: 'node-a' }),
      ]);
    });
  });

  describe('probeNode', () => {
    it('成功时返回容量快照，并按节点复用 mTLS dispatcher', async () => {
      undiciMocks.fetch.mockResolvedValue(capacityResponse(3));
      const service = createService(createDb());
      const node = makeNode('node-a');

      const first = await service.probeNode(node);
      await service.probeNode(node);

      expect(first).toEqual({
        healthy: true,
        capacity: expect.objectContaining({ vmsUsed: 3, vmsLimit: 10 }),
      });
      expect(undiciMocks.fetch).toHaveBeenCalledWith(
        'https://node-a.internal:8443/v1/capacity',
        expect.any(Object),
      );
      expect(undiciMocks.agentOptions).toHaveLength(1);
      expect(undiciMocks.agentOptions[0]).toEqual(
        expect.objectContaining({
          connect: expect.objectContaining({
            rejectUnauthorized: true,
            servername: 'node-a.internal',
            ca: Buffer.from('test-pem'),
          }),
        }),
      );
    });

    it('serverName 覆盖 SNI，且改址产生新 dispatcher', async () => {
      undiciMocks.fetch.mockResolvedValue(capacityResponse());
      const service = createService(createDb());

      await service.probeNode(makeNode('node-a', { serverName: 'sni.a' }));
      await service.probeNode(
        makeNode('node-a', { baseUrl: 'https://moved.internal:8443' }),
      );

      expect(undiciMocks.agentOptions).toHaveLength(2);
      expect(undiciMocks.agentOptions[0]).toEqual(
        expect.objectContaining({
          connect: expect.objectContaining({ servername: 'sni.a' }),
        }),
      );
      expect(undiciMocks.agentOptions[1]).toEqual(
        expect.objectContaining({
          connect: expect.objectContaining({ servername: 'moved.internal' }),
        }),
      );
    });

    it('非 2xx 与网络异常都归为 unhealthy', async () => {
      undiciMocks.fetch
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const service = createService(createDb());

      await expect(service.probeNode(makeNode('node-a'))).resolves.toEqual({
        healthy: false,
      });
      await expect(service.probeNode(makeNode('node-b'))).resolves.toEqual({
        healthy: false,
      });
    });
  });

  describe('listNodeStatuses', () => {
    it('把注册表条目与探针实况一并返回', async () => {
      undiciMocks.fetch
        .mockResolvedValueOnce(capacityResponse(1))
        .mockRejectedValueOnce(new Error('down'));
      const db = createDb();
      db.selectResults.push([makeNode('node-a'), makeNode('node-b')]);
      const service = createService(db);

      const statuses = await service.listNodeStatuses();

      expect(statuses).toEqual([
        {
          node: expect.objectContaining({ id: 'node-a' }),
          healthy: true,
          capacity: expect.objectContaining({ vmsUsed: 1 }),
        },
        {
          node: expect.objectContaining({ id: 'node-b' }),
          healthy: false,
          capacity: undefined,
        },
      ]);
    });
  });

  describe('removeNode 前置条件', () => {
    it('非 disabled 状态直接 409，不发探针也不删除', async () => {
      const db = createDb();
      db.selectResults.push([makeNode('node-a')]);
      const service = createService(db);

      await expect(service.removeNode('node-a', false)).rejects.toBeInstanceOf(
        SandboxNodeConflictException,
      );
      expect(undiciMocks.fetch).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('可达且仍有 microVM 时 409', async () => {
      undiciMocks.fetch.mockResolvedValueOnce(capacityResponse(2));
      const db = createDb();
      db.selectResults.push([makeNode('node-a', { status: 'disabled' })]);
      const service = createService(db);

      await expect(service.removeNode('node-a', false)).rejects.toBeInstanceOf(
        SandboxNodeConflictException,
      );
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('不可达且未 force 时 409', async () => {
      undiciMocks.fetch.mockRejectedValueOnce(new Error('unreachable'));
      const db = createDb();
      db.selectResults.push([makeNode('node-a', { status: 'disabled' })]);
      const service = createService(db);

      await expect(service.removeNode('node-a', false)).rejects.toBeInstanceOf(
        SandboxNodeConflictException,
      );
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('不可达 + force 时删除', async () => {
      undiciMocks.fetch.mockRejectedValueOnce(new Error('unreachable'));
      const db = createDb();
      db.selectResults.push([makeNode('node-a', { status: 'disabled' })]);
      db.deleteResults.push([{ id: 'node-a' }]);
      const service = createService(db);

      await expect(service.removeNode('node-a', true)).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('可达且空闲时删除', async () => {
      undiciMocks.fetch.mockResolvedValueOnce(capacityResponse(0));
      const db = createDb();
      db.selectResults.push([makeNode('node-a', { status: 'disabled' })]);
      db.deleteResults.push([{ id: 'node-a' }]);
      const service = createService(db);

      await expect(
        service.removeNode('node-a', false),
      ).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('节点不存在时 404', async () => {
      const db = createDb();
      db.selectResults.push([]);
      const service = createService(db);

      await expect(service.removeNode('ghost', true)).rejects.toBeInstanceOf(
        SandboxNodeNotFoundException,
      );
    });
  });

  describe('assertNodeAdmin', () => {
    it('private 部署无条件放行', () => {
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).not.toThrow();
    });

    it('saas 默认全部拒绝', () => {
      process.env.APP_DEPLOYMENT_MODE = 'saas';
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).toThrow(
        SandboxNodeAdminForbiddenException,
      );
    });

    it('saas 白名单命中时放行，未命中仍拒绝', () => {
      process.env.APP_DEPLOYMENT_MODE = 'saas';
      process.env.APP_SANDBOX_NODE_ADMIN_TENANT_IDS = ` other , ${TENANT_ID} `;
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).not.toThrow();
      expect(() => service.assertNodeAdmin('someone-else')).toThrow(
        SandboxNodeAdminForbiddenException,
      );
    });

    /**
     * `APP_DEPLOYMENT_MODE` 的默认值 saas 由 Zod 合成，只进 ConfigService，
     * 不回写 process.env——合法省略该变量时读到的是 undefined。若按
     * 「不等于 saas 就放行」实现，任意租户 owner/admin 都能操纵全局节点池。
     */
    it('变量缺省时按 saas 处理，仍然拒绝（fail-closed）', () => {
      delete process.env.APP_DEPLOYMENT_MODE;
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).toThrow(
        SandboxNodeAdminForbiddenException,
      );
    });

    it('变量缺省 + 白名单命中才放行', () => {
      delete process.env.APP_DEPLOYMENT_MODE;
      process.env.APP_SANDBOX_NODE_ADMIN_TENANT_IDS = TENANT_ID;
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).not.toThrow();
      expect(() => service.assertNodeAdmin('someone-else')).toThrow(
        SandboxNodeAdminForbiddenException,
      );
    });

    it('非法/未知 mode 值也不放行', () => {
      process.env.APP_DEPLOYMENT_MODE = 'PRIVATE';
      const service = createService(createDb());

      expect(() => service.assertNodeAdmin(TENANT_ID)).toThrow(
        SandboxNodeAdminForbiddenException,
      );
    });
  });
});

describe('runtime handle 编解码', () => {
  it('compose/split 往返保持原值', () => {
    const handle = composeRuntimeHandle(
      'node-a',
      '01a03f3c-b204-78c1-9016-d57371684020',
    );

    expect(handle).toBe('node-a/01a03f3c-b204-78c1-9016-d57371684020');
    expect(splitRuntimeHandle(handle)).toEqual({
      nodeId: 'node-a',
      managerHandle: '01a03f3c-b204-78c1-9016-d57371684020',
    });
  });

  it('按第一个斜杠切分，manager handle 内的斜杠原样保留', () => {
    expect(splitRuntimeHandle('node-a/vm/with/slashes')).toEqual({
      nodeId: 'node-a',
      managerHandle: 'vm/with/slashes',
    });
  });

  it('裸 handle 与空段一律 fail-closed', () => {
    for (const invalid of ['legacy-bare', '/vm-1', 'node-a/', '/', '']) {
      expect(() => splitRuntimeHandle(invalid)).toThrow(
        SandboxRuntimeNotFoundException,
      );
    }
  });

  it('与 exec handle 的 `:` 切分组合无歧义', () => {
    const execId = `${composeRuntimeHandle('node-a', 'vm-1')}:guest-exec-1`;
    const separator = execId.indexOf(':');

    expect(execId.slice(0, separator)).toBe('node-a/vm-1');
    expect(execId.slice(separator + 1)).toBe('guest-exec-1');
    expect(splitRuntimeHandle(execId.slice(0, separator))).toEqual({
      nodeId: 'node-a',
      managerHandle: 'vm-1',
    });
  });
});
