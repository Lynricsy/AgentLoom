import { Test } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { PgDialect } from 'drizzle-orm/pg-core';

import { DRIZZLE } from '../../../database/database.module';
import { WorkspaceService } from '../workspace.service';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import type { WorkspaceSnapshot } from '../../../database/schema';
import { SANDBOX_RUNTIME_DRIVER } from '../../sandbox/sandbox-runtime-driver.port';

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

function renderSql(sql: Parameters<PgDialect['sqlToQuery']>[0]): string {
  return new PgDialect().sqlToQuery(sql).sql;
}

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000010';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000020';
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000030';
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000040';
const TEST_CONTAINER_ID = 'abc123def456';
const TEST_CONTAINER_ARCHIVE_PATH = `/tmp/agentloom-workspace-restore-${TEST_WORKSPACE_ID}.tar`;
const TEST_ARCHIVE_SIZE = Buffer.byteLength('fake-tar-data');

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

function createReadableStreamFromBuffer(buffer: Buffer): Readable {
  return Readable.from(buffer);
}

function writeTarString(
  buffer: Buffer,
  offset: number,
  length: number,
  value: string,
) {
  const encoded = Buffer.from(value);
  encoded.copy(buffer, offset, 0, Math.min(length, encoded.length));
}

function writeTarOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  value: number,
) {
  const encoded = Buffer.from(
    `${value.toString(8).padStart(length - 1, '0')}\0`,
  );
  encoded.copy(buffer, offset, 0, Math.min(length, encoded.length));
}

function createTarArchive(
  entries: Array<{
    path: string;
    type: 'file' | 'directory';
    content?: Buffer | string;
  }>,
): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const content =
      entry.type === 'file'
        ? Buffer.isBuffer(entry.content)
          ? entry.content
          : Buffer.from(entry.content ?? '')
        : Buffer.alloc(0);
    const header = Buffer.alloc(512, 0);

    writeTarString(header, 0, 100, entry.path);
    writeTarOctal(header, 100, 8, entry.type === 'directory' ? 0o755 : 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, content.length);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] =
      entry.type === 'directory' ? '5'.charCodeAt(0) : '0'.charCodeAt(0);
    writeTarString(header, 257, 6, 'ustar');
    writeTarString(header, 263, 2, '00');

    const checksum = header.reduce((sum, value) => sum + value, 0);
    writeTarOctal(header, 148, 8, checksum);

    blocks.push(header, content);

    const padding = (512 - (content.length % 512)) % 512;
    if (padding > 0) {
      blocks.push(Buffer.alloc(padding, 0));
    }
  }

  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
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
      createExec: vi.fn(),
      attachExecOutput: vi.fn().mockResolvedValue(undefined),
      waitForExecExit: vi.fn().mockResolvedValue({
        running: false,
        exitCode: 0,
        pid: 123,
      }),
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: mockStorageService },
        { provide: SANDBOX_RUNTIME_DRIVER, useValue: mockDockerService },
      ],
    }).compile();

    service = module.get(WorkspaceService);
  });

  // ─── createFromSandbox ──────────────────────────────────────────────────

  describe('createFromSandbox', () => {
    it('应当从沙箱创建工作区快照并上传到 MinIO', async () => {
      const session = buildSandboxSession();
      const creatingSnapshot = buildSnapshot({ status: 'creating' });
      const readySnapshot = buildSnapshot({
        status: 'ready',
        sizeBytes: TEST_ARCHIVE_SIZE,
      });

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
        TEST_ARCHIVE_SIZE,
        'application/x-tar',
      );
      expect(result.sizeBytes).toBe(TEST_ARCHIVE_SIZE);
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
      mockDockerService.createExec
        .mockResolvedValueOnce({ execId: 'exec-apply' })
        .mockResolvedValueOnce({ execId: 'exec-cleanup' });

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
        '/tmp',
      );
      expect(mockDockerService.createExec).toHaveBeenNthCalledWith(
        1,
        TEST_CONTAINER_ID,
        {
          command: 'sh',
          args: [
            '-lc',
            `set -eu; test -f '${TEST_CONTAINER_ARCHIVE_PATH}'; mkdir -p '/workspace/'; find '/workspace/' -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xf '${TEST_CONTAINER_ARCHIVE_PATH}' -C '/workspace/' --strip-components=1`,
          ],
        },
      );
      expect(mockDockerService.createExec).toHaveBeenNthCalledWith(
        2,
        TEST_CONTAINER_ID,
        {
          command: 'sh',
          args: ['-lc', `rm -f '${TEST_CONTAINER_ARCHIVE_PATH}'`],
        },
      );
    });

    it('恢复命令失败时应当抛错并仍尝试清理临时目录', async () => {
      const snapshot = buildSnapshot({ status: 'ready' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockDockerService.createExec
        .mockResolvedValueOnce({ execId: 'exec-apply' })
        .mockResolvedValueOnce({ execId: 'exec-cleanup' });
      mockDockerService.attachExecOutput.mockImplementationOnce(
        async (
          _execId: string,
          callback: (level: string, message: string) => void,
        ) => {
          callback('stderr', 'copy failed');
        },
      );
      mockDockerService.waitForExecExit
        .mockResolvedValueOnce({
          running: false,
          exitCode: 2,
          pid: 123,
        })
        .mockResolvedValueOnce({
          running: false,
          exitCode: 0,
          pid: 124,
        });

      await expect(
        service.restoreToSandbox(
          TEST_WORKSPACE_ID,
          TEST_CONTAINER_ID,
          TEST_TENANT_ID,
        ),
      ).rejects.toThrow('Container command failed');

      expect(mockDockerService.createExec).toHaveBeenCalledTimes(2);
    });

    it('sizeBytes 为空时仍应尝试恢复归档内容', async () => {
      const snapshot = buildSnapshot({ status: 'ready', sizeBytes: null });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockDockerService.createExec
        .mockResolvedValueOnce({ execId: 'exec-apply' })
        .mockResolvedValueOnce({ execId: 'exec-cleanup' });

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
        '/tmp',
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
      expect(mockDockerService.createExec).not.toHaveBeenCalled();
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

    it('应为列表项补充来源语义', async () => {
      const snapshots = [
        buildSnapshot({ id: 'manual-1', name: 'manual-space' }),
        buildSnapshot({
          id: 'snapshot-1',
          name: 'saved-from-sandbox',
          config: { sourceSandboxSessionId: TEST_SESSION_ID },
        }),
        buildSnapshot({
          id: 'archive-1',
          name: 'execution-run-1-step-node-1-workspace',
          config: { sourceSandboxSessionId: TEST_SESSION_ID },
        }),
      ];
      const { dataChain, countChain } = createPaginatedChain(snapshots, 3);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      const result = await service.findAll(TEST_TENANT_ID);

      expect(result.data.map((item) => item.sourceKind)).toEqual([
        'manual',
        'sandbox_snapshot',
        'execution_archive',
      ]);
      expect(result.data.map((item) => item.isAutoArchived)).toEqual([
        false,
        false,
        true,
      ]);
    });

    it('includeAutoArchived=false 时应过滤执行归档快照', async () => {
      const { dataChain, countChain } = createPaginatedChain([], 0);
      db.select.mockReturnValueOnce(dataChain).mockReturnValueOnce(countChain);

      await service.findAll(TEST_TENANT_ID, {
        includeAutoArchived: false,
      });

      const whereCalls = dataChain.from().where.mock.calls;
      const [predicate] = whereCalls[0] ?? [];
      const rendered = renderSql(predicate).toLowerCase();
      expect(rendered).toContain('not ilike');
      expect(rendered).toContain('execution-%-step-%-workspace');
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('应当返回指定 ID 的快照', async () => {
      const snapshot = buildSnapshot();
      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));

      const result = await service.findOne(TEST_TENANT_ID, TEST_WORKSPACE_ID);

      expect(result.id).toBe(TEST_WORKSPACE_ID);
      expect(result.sourceKind).toBe('manual');
    });

    it('快照不存在时应当抛出 NotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.findOne(TEST_TENANT_ID, TEST_WORKSPACE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── preview helpers ───────────────────────────────────────────────────

  describe('preview', () => {
    it('getFileTree 应当从带 workspace 根目录的归档构建文件树', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 2048 });
      const archive = createTarArchive([
        { path: 'workspace/docs', type: 'directory' },
        {
          path: 'workspace/docs/readme.md',
          type: 'file',
          content: '# hello',
        },
        {
          path: 'workspace/cover.png',
          type: 'file',
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]),
        },
      ]);

      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockStorageService.download.mockResolvedValueOnce(
        createReadableStreamFromBuffer(archive),
      );

      const tree = await service.getFileTree(TEST_TENANT_ID, TEST_WORKSPACE_ID);

      expect(tree).toEqual([
        {
          name: 'docs',
          type: 'directory',
          path: 'docs',
          children: [
            {
              name: 'readme.md',
              type: 'file',
              path: 'docs/readme.md',
              size: 7,
            },
          ],
        },
        {
          name: 'cover.png',
          type: 'file',
          path: 'cover.png',
          size: 6,
        },
      ]);
    });

    it('getFilePreview 应当返回文本文件预览', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 1024 });
      const archive = createTarArchive([
        {
          path: 'workspace/readme.md',
          type: 'file',
          content: '# hello',
        },
      ]);

      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockStorageService.download.mockResolvedValueOnce(
        createReadableStreamFromBuffer(archive),
      );

      const preview = await service.getFilePreview(
        TEST_TENANT_ID,
        TEST_WORKSPACE_ID,
        'readme.md',
      );

      expect(preview).toEqual({
        kind: 'text',
        path: 'readme.md',
        fileName: 'readme.md',
        size: 7,
        mimeType: 'text/markdown',
        canDownload: true,
        content: '# hello',
        encoding: 'utf-8',
      });
    });

    it('getFilePreview 应当识别图片与 PDF 预览类型', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 2048 });
      const archive = createTarArchive([
        {
          path: 'workspace/cover.png',
          type: 'file',
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]),
        },
        {
          path: 'workspace/spec.pdf',
          type: 'file',
          content: Buffer.from('%PDF-1.4\n'),
        },
      ]);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([snapshot]))
        .mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockStorageService.download
        .mockResolvedValueOnce(createReadableStreamFromBuffer(archive))
        .mockResolvedValueOnce(createReadableStreamFromBuffer(archive));

      await expect(
        service.getFilePreview(TEST_TENANT_ID, TEST_WORKSPACE_ID, 'cover.png'),
      ).resolves.toMatchObject({
        kind: 'image',
        mimeType: 'image/png',
        canDownload: true,
      });

      await expect(
        service.getFilePreview(TEST_TENANT_ID, TEST_WORKSPACE_ID, 'spec.pdf'),
      ).resolves.toMatchObject({
        kind: 'pdf',
        mimeType: 'application/pdf',
        canDownload: true,
      });
    });

    it('getFilePreview 对不支持内嵌预览的二进制文件应返回 unsupported', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 1024 });
      const archive = createTarArchive([
        {
          path: 'workspace/archive.bin',
          type: 'file',
          content: Buffer.from([0xde, 0xad, 0x00, 0xbe, 0xef]),
        },
      ]);

      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockStorageService.download.mockResolvedValueOnce(
        createReadableStreamFromBuffer(archive),
      );

      await expect(
        service.getFilePreview(
          TEST_TENANT_ID,
          TEST_WORKSPACE_ID,
          'archive.bin',
        ),
      ).resolves.toMatchObject({
        kind: 'unsupported',
        mimeType: 'application/octet-stream',
        canDownload: true,
      });
    });

    it('getFileAsset 应当返回原始文件内容与 mimeType', async () => {
      const snapshot = buildSnapshot({ sizeBytes: 1024 });
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]);
      const archive = createTarArchive([
        {
          path: 'workspace/cover.png',
          type: 'file',
          content: pngBuffer,
        },
      ]);

      db.select.mockReturnValueOnce(createSelectChainWithLimit([snapshot]));
      mockStorageService.download.mockResolvedValueOnce(
        createReadableStreamFromBuffer(archive),
      );

      await expect(
        service.getFileAsset(TEST_TENANT_ID, TEST_WORKSPACE_ID, 'cover.png'),
      ).resolves.toEqual({
        path: 'cover.png',
        fileName: 'cover.png',
        size: pngBuffer.length,
        mimeType: 'image/png',
        content: pngBuffer,
      });
    });
  });
});
