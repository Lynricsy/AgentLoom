import { Test } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import { DRIZZLE } from '../../../database/database.module';
import { WorkspaceService } from '../workspace.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import { DockerService } from '../../sandbox/docker.service';
import type { WorkspaceSnapshot } from '../../../database/schema';

// ─── Drizzle chain builders ─────────────────────────────────────────────────

function createSelectChainWithLimit(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createInsertChainReturning(result: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createUpdateChainReturning(result: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createUpdateChainNoReturning() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function createPaginatedChain(dataResult: unknown[], countResult: number) {
  return {
    dataChain: {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(dataResult),
            }),
          }),
        }),
      }),
    },
    countChain: {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ total: countResult }]),
      }),
    },
  };
}

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000010';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000020';
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000030';
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000040';
const TEST_CONTAINER_ID = 'abc123def456';

function buildSnapshot(
  overrides?: Partial<WorkspaceSnapshot>,
): WorkspaceSnapshot {
  return {
    id: TEST_WORKSPACE_ID,
    organizationId: TEST_ORG_ID,
    tenantId: TEST_TENANT_ID,
    name: 'test-snapshot',
    description: null,
    storageKey: `tenants/${TEST_TENANT_ID}/workspaces/${TEST_WORKSPACE_ID}/snapshot.tar`,
    sizeBytes: 1024,
    status: 'ready',
    config: null,
    createdById: TEST_USER_ID,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function buildSandboxSession(overrides?: Record<string, unknown>) {
  return {
    id: TEST_SESSION_ID,
    tenantId: TEST_TENANT_ID,
    containerId: TEST_CONTAINER_ID,
    status: 'ready',
    ...overrides,
  };
}

function createReadableStream(): Readable {
  return Readable.from(Buffer.from('fake-tar-data'));
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let mockStorageService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDockerService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockStorageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(createReadableStream()),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockDockerService = {
      getArchive: vi.fn().mockResolvedValue(createReadableStream()),
      putArchive: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: mockStorageService },
        { provide: DockerService, useValue: mockDockerService },
      ],
    }).compile();

    service = module.get(WorkspaceService);
  });

  // ─── createFromSandbox ──────────────────────────────────────────────────

  describe('createFromSandbox', () => {
    it('应当从沙箱创建工作区快照并上传到 MinIO', async () => {
      const session = buildSandboxSession();
      const creatingSnapshot = buildSnapshot({ status: 'creating' });
      const readySnapshot = buildSnapshot({ status: 'ready' });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([creatingSnapshot]),
      );
      db.update.mockReturnValueOnce(
        createUpdateChainReturning([readySnapshot]),
      );

      const result = await service.createFromSandbox(
        TEST_TENANT_ID,
        TEST_ORG_ID,
        TEST_USER_ID,
        TEST_SESSION_ID,
        'test-snapshot',
      );

      expect(result.status).toBe('ready');
      expect(mockDockerService.getArchive).toHaveBeenCalledWith(
        TEST_CONTAINER_ID,
        '/workspace/',
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.stringContaining('snapshot.tar'),
        expect.any(Object),
        undefined,
        'application/x-tar',
      );
    });

    it('沙箱会话不存在时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.createFromSandbox(
          TEST_TENANT_ID,
          TEST_ORG_ID,
          TEST_USER_ID,
          TEST_SESSION_ID,
          'test',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('沙箱容器未就绪（containerId 为空）时应当抛出 NotFoundException', async () => {
      const session = buildSandboxSession({ containerId: null });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));

      await expect(
        service.createFromSandbox(
          TEST_TENANT_ID,
          TEST_ORG_ID,
          TEST_USER_ID,
          TEST_SESSION_ID,
          'test',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Docker 归档失败时应当将快照标记为 deleted 并尝试清理 MinIO', async () => {
      const session = buildSandboxSession();
      const creatingSnapshot = buildSnapshot({ status: 'creating' });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([creatingSnapshot]),
      );
      db.update.mockReturnValueOnce(createUpdateChainNoReturning());
      mockDockerService.getArchive.mockRejectedValueOnce(
        new Error('Docker unavailable'),
      );

      await expect(
        service.createFromSandbox(
          TEST_TENANT_ID,
          TEST_ORG_ID,
          TEST_USER_ID,
          TEST_SESSION_ID,
          'test',
        ),
      ).rejects.toThrow('Docker unavailable');

      expect(db.update).toHaveBeenCalled();
      expect(mockStorageService.delete).toHaveBeenCalled();
    });

    it('MinIO 上传失败时应当将快照标记为 deleted 并尝试清理', async () => {
      const session = buildSandboxSession();
      const creatingSnapshot = buildSnapshot({ status: 'creating' });

      db.select.mockReturnValueOnce(createSelectChainWithLimit([session]));
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([creatingSnapshot]),
      );
      db.update.mockReturnValueOnce(createUpdateChainNoReturning());
      mockStorageService.upload.mockRejectedValueOnce(
        new Error('MinIO unavailable'),
      );

      await expect(
        service.createFromSandbox(
          TEST_TENANT_ID,
          TEST_ORG_ID,
          TEST_USER_ID,
          TEST_SESSION_ID,
          'test',
        ),
      ).rejects.toThrow('MinIO unavailable');

      expect(db.update).toHaveBeenCalled();
      expect(mockStorageService.delete).toHaveBeenCalled();
    });
  });

  // ─── restoreToSandbox ──────────────────────────────────────────────────

  describe('restoreToSandbox', () => {
    it('应当从 MinIO 下载归档并恢复到 Docker 容器', async () => {
      const snapshot = buildSnapshot({ status: 'ready' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));

      await service.restoreToSandbox(
        TEST_WORKSPACE_ID,
        TEST_CONTAINER_ID,
        TEST_TENANT_ID,
      );

      expect(mockStorageService.download).toHaveBeenCalledWith(
        snapshot.storageKey,
      );
      expect(mockDockerService.putArchive).toHaveBeenCalledWith(
        TEST_CONTAINER_ID,
        expect.any(Object),
        '/workspace/',
      );
    });

    it('快照不存在时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.restoreToSandbox(
          TEST_WORKSPACE_ID,
          TEST_CONTAINER_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('快照状态非 ready 时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.restoreToSandbox(
          TEST_WORKSPACE_ID,
          TEST_CONTAINER_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('空工作区快照恢复时应当直接跳过归档下载', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 0, status: 'ready' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));

      await service.restoreToSandbox(
        TEST_WORKSPACE_ID,
        TEST_CONTAINER_ID,
        TEST_TENANT_ID,
      );

      expect(mockStorageService.download).not.toHaveBeenCalled();
      expect(mockDockerService.putArchive).not.toHaveBeenCalled();
    });
  });

  // ─── createEmpty ────────────────────────────────────────────────────────

  describe('createEmpty', () => {
    it('应当创建空的工作区快照记录', async () => {
      const emptySnapshot = buildSnapshot({
        sizeBytes: 0,
        status: 'ready',
      });
      db.insert.mockReturnValueOnce(
        createInsertChainReturning([emptySnapshot]),
      );

      const result = await service.createEmpty(
        TEST_TENANT_ID,
        TEST_ORG_ID,
        TEST_USER_ID,
        'empty-workspace',
        'An empty workspace',
      );

      expect(result.status).toBe('ready');
      expect(result.sizeBytes).toBe(0);
      expect(db.insert).toHaveBeenCalledOnce();
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('应当删除 MinIO 对象并将快照标记为 deleted', async () => {
      const snapshot = buildSnapshot();
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      db.update.mockReturnValueOnce(createUpdateChainNoReturning());

      await service.delete(TEST_TENANT_ID, TEST_WORKSPACE_ID);

      expect(mockStorageService.delete).toHaveBeenCalledWith(
        snapshot.storageKey,
      );
      expect(db.update).toHaveBeenCalled();
    });

    it('快照不存在时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.delete(TEST_TENANT_ID, TEST_WORKSPACE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('MinIO 删除失败时应当记录警告但仍然标记为 deleted', async () => {
      const snapshot = buildSnapshot();
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      db.update.mockReturnValueOnce(createUpdateChainNoReturning());
      mockStorageService.delete.mockRejectedValueOnce(
        new Error('MinIO unavailable'),
      );

      await service.delete(TEST_TENANT_ID, TEST_WORKSPACE_ID);

      expect(db.update).toHaveBeenCalled();
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('应当返回非 deleted 状态的快照列表（分页）', async () => {
      const snapshots = [
        buildSnapshot({ id: 'snap-1', name: 'first' }),
        buildSnapshot({ id: 'snap-2', name: 'second' }),
      ];
      const { dataChain, countChain } = createPaginatedChain(snapshots, 2);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findAll(TEST_TENANT_ID);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('没有快照时应当返回空数组和 total 为 0', async () => {
      const { dataChain, countChain } = createPaginatedChain([], 0);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findAll(TEST_TENANT_ID);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('应当支持分页参数', async () => {
      const snapshots = [buildSnapshot({ id: 'snap-3', name: 'third' })];
      const { dataChain, countChain } = createPaginatedChain(snapshots, 5);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findAll(TEST_TENANT_ID, {
        page: 2,
        pageSize: 1,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(5);
    });

    it('应当支持搜索过滤', async () => {
      const snapshots = [buildSnapshot({ id: 'snap-4', name: 'my-workspace' })];
      const { dataChain, countChain } = createPaginatedChain(snapshots, 1);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findAll(TEST_TENANT_ID, {
        search: 'my-workspace',
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('应当返回指定 ID 的快照', async () => {
      const snapshot = buildSnapshot();
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));

      const result = await service.findOne(TEST_TENANT_ID, TEST_WORKSPACE_ID);

      expect(result.id).toBe(TEST_WORKSPACE_ID);
    });

    it('快照不存在时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.findOne(TEST_TENANT_ID, TEST_WORKSPACE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
