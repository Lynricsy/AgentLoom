import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Test } from '@nestjs/testing';

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
});
