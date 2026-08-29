import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';

import type { SandboxRuntimeNode } from '../../../database/schema';
import { SandboxNodeController } from '../sandbox-node.controller';
import { SandboxRuntimeNodeRegistryService } from '../sandbox-runtime-node-registry.service';
import {
  SandboxNodeAdminForbiddenException,
  SandboxNodeConflictException,
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
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

const registry: Record<string, Mock> = {
  assertNodeAdmin: vi.fn(),
  listNodeStatuses: vi.fn(),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  removeNode: vi.fn(),
};

describe('SandboxNodeController', () => {
  let controller: SandboxNodeController;

  beforeEach(async () => {
    vi.clearAllMocks();
    registry.assertNodeAdmin.mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      controllers: [SandboxNodeController],
      providers: [
        { provide: SandboxRuntimeNodeRegistryService, useValue: registry },
      ],
    }).compile();

    controller = module.get(SandboxNodeController);
  });

  it('列表把注册表条目与探针实况序列化为 wire 形状', async () => {
    registry.listNodeStatuses.mockResolvedValue([
      {
        node: makeNode('default', { serverName: 'firecracker-runtime' }),
        healthy: true,
        capacity: {
          vmsUsed: 1,
          vmsLimit: 10,
          vcpuUsed: 2,
          vcpuLimit: 32,
          memoryMiBUsed: 512,
          memoryMiBLimit: 65_536,
          diskGiBUsed: 2,
          diskGiBLimit: 500,
        },
      },
      { node: makeNode('node-b', { status: 'disabled' }), healthy: false },
    ]);

    const result = await controller.listNodes(TENANT_ID);

    expect(result).toEqual({
      data: [
        {
          id: 'default',
          baseUrl: 'https://default.internal:8443',
          serverName: 'firecracker-runtime',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          healthy: true,
          capacity: expect.objectContaining({ vmsUsed: 1 }),
        },
        {
          id: 'node-b',
          baseUrl: 'https://node-b.internal:8443',
          serverName: null,
          status: 'disabled',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          healthy: false,
          capacity: null,
        },
      ],
    });
  });

  it('每个端点都先过节点管理门，拒绝时不触达注册表写操作', async () => {
    registry.assertNodeAdmin.mockImplementation(() => {
      throw new SandboxNodeAdminForbiddenException();
    });

    await expect(controller.listNodes(TENANT_ID)).rejects.toBeInstanceOf(
      SandboxNodeAdminForbiddenException,
    );
    await expect(
      controller.createNode(TENANT_ID, {
        id: 'node-a',
        baseUrl: 'https://a.internal:8443',
      }),
    ).rejects.toBeInstanceOf(SandboxNodeAdminForbiddenException);
    await expect(
      controller.updateNode(TENANT_ID, 'node-a', { status: 'disabled' }),
    ).rejects.toBeInstanceOf(SandboxNodeAdminForbiddenException);
    await expect(
      controller.deleteNode(TENANT_ID, 'node-a', { force: false }),
    ).rejects.toBeInstanceOf(SandboxNodeAdminForbiddenException);

    expect(registry.listNodeStatuses).not.toHaveBeenCalled();
    expect(registry.createNode).not.toHaveBeenCalled();
    expect(registry.updateNode).not.toHaveBeenCalled();
    expect(registry.removeNode).not.toHaveBeenCalled();
  });

  it('创建透传 dto 并返回序列化后的节点', async () => {
    registry.createNode.mockResolvedValue(makeNode('node-a'));

    const result = await controller.createNode(TENANT_ID, {
      id: 'node-a',
      baseUrl: 'https://a.internal:8443',
      status: 'draining',
    });

    expect(registry.createNode).toHaveBeenCalledWith({
      id: 'node-a',
      baseUrl: 'https://a.internal:8443',
      status: 'draining',
    });
    expect(result.data).toEqual(
      expect.objectContaining({ id: 'node-a', status: 'active' }),
    );
  });

  it('更新透传 nodeId 与补丁', async () => {
    registry.updateNode.mockResolvedValue(
      makeNode('node-a', { status: 'disabled' }),
    );

    const result = await controller.updateNode(TENANT_ID, 'node-a', {
      status: 'disabled',
    });

    expect(registry.updateNode).toHaveBeenCalledWith('node-a', {
      status: 'disabled',
    });
    expect(result.data.status).toBe('disabled');
  });

  it('删除把 force 透传给前置条件校验，并原样上抛 409', async () => {
    registry.removeNode.mockResolvedValueOnce(undefined);
    await expect(
      controller.deleteNode(TENANT_ID, 'node-a', { force: true }),
    ).resolves.toBeUndefined();
    expect(registry.removeNode).toHaveBeenCalledWith('node-a', true);

    registry.removeNode.mockRejectedValueOnce(
      new SandboxNodeConflictException('still hosts 2 microVM(s)'),
    );
    await expect(
      controller.deleteNode(TENANT_ID, 'node-a', { force: false }),
    ).rejects.toBeInstanceOf(SandboxNodeConflictException);
    expect(registry.removeNode).toHaveBeenLastCalledWith('node-a', false);
  });

  /**
   * 经真实 HTTP 管道跑一遍：DELETE 的 query schema 带 transform
   * （'true' → boolean），若 handler 上再挂一道显式 ZodValidationPipe，
   * 全局 pipe 转换后的 boolean 会撞上 string enum 而必然 422。
   * 直接调 controller 方法绕过 pipe，看不到这个回归，故必须走 HTTP。
   */
  describe('经全局 ZodValidationPipe 的 HTTP 管道', () => {
    let app: NestFastifyApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [SandboxNodeController],
        providers: [
          { provide: SandboxRuntimeNodeRegistryService, useValue: registry },
        ],
      }).compile();
      app = module.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      app.useGlobalPipes(new ZodValidationPipe());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('force 省略时按 false 解析，显式 true/false 都被接受', async () => {
      registry.removeNode.mockResolvedValue(undefined);

      for (const [query, expected] of [
        ['', false],
        ['?force=false', false],
        ['?force=true', true],
      ] as const) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ method: 'DELETE', url: `/sandbox-nodes/node-a${query}` });

        expect(response.statusCode).toBe(204);
        expect(registry.removeNode).toHaveBeenLastCalledWith(
          'node-a',
          expected,
        );
      }
    });

    it('非法 force 值被拒绝，不触达注册表', async () => {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'DELETE', url: '/sandbox-nodes/node-a?force=yes' });

      expect(response.statusCode).toBe(400);
      expect(registry.removeNode).not.toHaveBeenCalled();
    });

    it('创建请求经管道校验 id 与 https 基址', async () => {
      registry.createNode.mockResolvedValue(makeNode('node-a'));

      const rejected = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/sandbox-nodes',
          payload: { id: 'Bad_Id', baseUrl: 'http://a.internal' },
        });
      expect(rejected.statusCode).toBe(400);
      expect(registry.createNode).not.toHaveBeenCalled();

      const accepted = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/sandbox-nodes',
          payload: { id: 'node-a', baseUrl: 'https://a.internal:8443' },
        });
      expect(accepted.statusCode).toBe(201);
      expect(registry.createNode).toHaveBeenCalledWith({
        id: 'node-a',
        baseUrl: 'https://a.internal:8443',
      });
    });
  });
});
