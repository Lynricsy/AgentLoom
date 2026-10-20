import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.module';
import { ResourceSourceService } from '../resource-source/resource-source.service';
import { SkillService, type SkillUploadFile } from './skill.service';
import {
  SkillAlreadyArchivedException,
  SkillBuiltinReadonlyException,
  SkillFileNotFoundException,
  SkillNameConflictException,
  SkillNotFoundException,
  SkillVersionConflictException,
} from './skill.exceptions';
import { SkillStorageService } from './skill-storage.service';

// ─── vi.hoisted mock factories ─────────────────────────────────────────────��─
const mocks = vi.hoisted(() => {
  const createMockStorageService = () => ({
    uploadSkillFile: vi.fn().mockResolvedValue(undefined),
    downloadSkillFile: vi.fn(),
    deleteSkillFiles: vi.fn().mockResolvedValue(undefined),
    listSkillFiles: vi.fn().mockResolvedValue([]),
    getSkillContent: vi.fn(),
    getSkillFileMap: vi.fn().mockResolvedValue({}),
  });

  const getTenantDb = vi.fn();

  return { createMockStorageService, getTenantDb };
});

vi.mock('../../common/providers/tenant-aware-db.provider', async () => {
  const actual = await vi.importActual<
    typeof import('../../common/providers/tenant-aware-db.provider')
  >('../../common/providers/tenant-aware-db.provider');
  return { ...actual, getTenantDb: mocks.getTenantDb };
});

vi.mock('../organization/slug.utils', () => ({
  generateSlug: vi.fn((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-'),
  ),
  appendSlugSuffix: vi.fn((slug: string) => `${slug}-1`),
}));

// ─── Drizzle chain helpers ───────────────────────────────────────────────────
function createSelectChain(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(result);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockResolvedValue(result);
  return chain;
}

function createSelectChainWithPagination(result: any) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockResolvedValue(result);
  return chain;
}

function createInsertChain(result: any) {
  const chain: any = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  return chain;
}

function createUpdateChain(result: any) {
  const chain: any = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(result);
  return chain;
}

function createDeleteChain(result?: any) {
  const chain: any = {};
  chain.where = vi.fn().mockResolvedValue(result ?? undefined);
  return chain;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SKILL_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeSkillRecord(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: SKILL_ID,
    tenantId: TENANT_ID,
    name: 'Test Skill',
    slug: 'test-skill',
    description: 'A test skill',
    content: '# Hello',
    frontmatter: null,
    isBuiltin: false,
    status: 'active',
    fileCount: 1,
    totalSizeBytes: 0,
    version: 1,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    sourceKind: 'manual',
    ...overrides,
  };
}

describe('SkillService', () => {
  let service: SkillService;
  let storageService: ReturnType<typeof mocks.createMockStorageService>;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let resourceSourceService: {
    mapCurrentKinds: ReturnType<typeof vi.fn>;
    buildShareImportedExistsCondition: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    storageService = mocks.createMockStorageService();
    resourceSourceService = {
      mapCurrentKinds: vi.fn().mockResolvedValue(new Map()),
      buildShareImportedExistsCondition: vi.fn(() => ({
        type: 'share-imported',
      })),
    };

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };

    mocks.getTenantDb.mockReturnValue(db as unknown as DrizzleDB);

    const module = await Test.createTestingModule({
      providers: [
        SkillService,
        { provide: DRIZZLE, useValue: db },
        { provide: SkillStorageService, useValue: storageService },
        { provide: ResourceSourceService, useValue: resourceSourceService },
      ],
    }).compile();

    service = module.get(SkillService);

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('创建 Skill（无文件、无 frontmatter）', async () => {
      const record = makeSkillRecord();
      db.insert.mockReturnValue(createInsertChain([record]));

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'Test Skill',
        description: 'A test skill',
      });

      expect(result).toEqual(record);
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('创建 Skill 并解析 frontmatter', async () => {
      const contentWithFrontmatter =
        '---\ntitle: My Skill\nauthor: Fox\n---\n# Body';
      const record = makeSkillRecord({
        content: contentWithFrontmatter,
        frontmatter: { title: 'My Skill', author: 'Fox' },
      });
      db.insert.mockReturnValue(createInsertChain([record]));

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'Test Skill',
        description: 'A test skill',
        content: contentWithFrontmatter,
      });

      expect(result).toEqual(record);
    });

    it('slug 冲突时重试', async () => {
      const uniqueViolation = Object.assign(new Error('unique'), {
        code: '23505',
      });
      const record = makeSkillRecord({ slug: 'test-skill-1' });
      const insertChain = createInsertChain([]);
      insertChain.returning
        .mockRejectedValueOnce(uniqueViolation)
        .mockResolvedValueOnce([record]);

      db.insert.mockReturnValue(insertChain);

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'Test Skill',
        description: 'A test skill',
      });

      expect(result).toEqual(record);
      expect(insertChain.returning).toHaveBeenCalledTimes(2);
    });

    it('slug 冲突超过最大重试次数后抛出', async () => {
      const uniqueViolation = Object.assign(new Error('unique'), {
        code: '23505',
      });
      const insertChain = createInsertChain([]);
      insertChain.returning.mockRejectedValue(uniqueViolation);
      db.insert.mockReturnValue(insertChain);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Test Skill',
          description: 'A test skill',
        }),
      ).rejects.toThrow();
    });

    it('非唯一约束错误直接抛出', async () => {
      const otherError = new Error('connection failed');
      const insertChain = createInsertChain([]);
      insertChain.returning.mockRejectedValue(otherError);
      db.insert.mockReturnValue(insertChain);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Test Skill',
          description: 'A test skill',
        }),
      ).rejects.toThrow('connection failed');
    });

    it('名称冲突（skills_tenant_name_idx）抛 409 且不按 slug 重试', async () => {
      const nameViolation = Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint_name: 'skills_tenant_name_idx',
        }),
      });
      const insertChain = createInsertChain([]);
      insertChain.returning.mockRejectedValue(nameViolation);
      db.insert.mockReturnValue(insertChain);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Test Skill',
          description: 'A test skill',
        }),
      ).rejects.toThrow(SkillNameConflictException);
      expect(insertChain.returning).toHaveBeenCalledOnce();
    });

    it('上传文件后刷新 fileMeta', async () => {
      const record = makeSkillRecord();
      db.insert.mockReturnValue(createInsertChain([record]));

      const updatedRecord = makeSkillRecord({
        fileCount: 2,
        totalSizeBytes: 2000,
      });
      db.update.mockReturnValue(createUpdateChain([updatedRecord]));

      storageService.listSkillFiles.mockResolvedValue([
        { name: 'SKILL.md', size: 1000 },
        { name: 'data.json', size: 1000 },
      ]);

      const files: SkillUploadFile[] = [
        {
          fieldname: 'files',
          filename: 'SKILL.md',
          buffer: Buffer.from('# content'),
          mimetype: 'text/markdown',
        },
      ];

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        {
          name: 'Test Skill',
          description: 'A test skill',
        },
        files,
      );

      expect(result).toEqual(updatedRecord);
      expect(storageService.uploadSkillFile).toHaveBeenCalledOnce();
      expect(storageService.listSkillFiles).toHaveBeenCalledOnce();
    });

    it('从上传的 SKILL.md 文件中提取 content', async () => {
      const skillMdContent = '# From file';
      const record = makeSkillRecord({ content: skillMdContent });
      db.insert.mockReturnValue(createInsertChain([record]));

      const updatedRecord = makeSkillRecord({
        fileCount: 1,
        totalSizeBytes: 100,
      });
      db.update.mockReturnValue(createUpdateChain([updatedRecord]));
      storageService.listSkillFiles.mockResolvedValue([
        { name: 'SKILL.md', size: 100 },
      ]);

      const files: SkillUploadFile[] = [
        {
          fieldname: 'files',
          filename: 'SKILL.md',
          buffer: Buffer.from(skillMdContent),
          mimetype: 'text/markdown',
        },
      ];

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        {
          name: 'Test Skill',
          description: 'A test skill',
        },
        files,
      );

      expect(result).toEqual(updatedRecord);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('基本分页查询', async () => {
      const rows = [makeSkillRecord()];
      const paginatedChain = createSelectChainWithPagination(rows);
      const countChain = createSelectChain([{ total: 1 }]);

      db.select
        .mockReturnValueOnce(paginatedChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        search: undefined,
        status: undefined,
        isBuiltin: undefined,
        sourceKind: undefined,
      });

      expect(result.data).toEqual(rows);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('带过滤条件', async () => {
      const rows = [makeSkillRecord()];
      const paginatedChain = createSelectChainWithPagination(rows);
      const countChain = createSelectChain([{ total: 1 }]);

      db.select
        .mockReturnValueOnce(paginatedChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 10,
        status: 'active',
        isBuiltin: false,
        search: 'test',
        sourceKind: undefined,
      });

      expect(result.data).toEqual(rows);
    });

    it('空结果集', async () => {
      const paginatedChain = createSelectChainWithPagination([]);
      const countChain = createSelectChain([{ total: 0 }]);

      db.select
        .mockReturnValueOnce(paginatedChain)
        .mockReturnValueOnce(countChain);

      const result = await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        search: undefined,
        status: undefined,
        isBuiltin: undefined,
        sourceKind: undefined,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('返回找到的 Skill', async () => {
      const record = makeSkillRecord();
      db.select.mockReturnValue(createSelectChain([record]));

      const result = await service.findById(TENANT_ID, SKILL_ID);
      expect(result).toEqual(record);
    });

    it('未找到抛出 SkillNotFoundException', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(service.findById(TENANT_ID, SKILL_ID)).rejects.toThrow(
        SkillNotFoundException,
      );
    });

    it('内置 Skill 对租户可读', async () => {
      const record = makeSkillRecord({
        tenantId: '00000000-0000-0000-0000-000000000000',
        isBuiltin: true,
      });
      db.select.mockReturnValue(createSelectChain([record]));

      await expect(service.findById(TENANT_ID, SKILL_ID)).resolves.toEqual(
        record,
      );
    });
  });

  // ─── file operations ─────────────────────────────────────────────────────
  describe('file operations', () => {
    const file: SkillUploadFile = {
      fieldname: 'file',
      filename: 'scripts/run.sh',
      buffer: Buffer.from('echo hi'),
      mimetype: 'text/x-sh',
    };

    it('Skill 不存在（含他租户）时上传/列出/删除文件均 404 且不触达存储', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.uploadFile(TENANT_ID, SKILL_ID, file),
      ).rejects.toThrow(SkillNotFoundException);
      await expect(service.listFiles(TENANT_ID, SKILL_ID)).rejects.toThrow(
        SkillNotFoundException,
      );
      await expect(
        service.deleteFile(TENANT_ID, SKILL_ID, 'evil.md'),
      ).rejects.toThrow(SkillNotFoundException);
      await expect(
        service.downloadFile(TENANT_ID, SKILL_ID, 'evil.md'),
      ).rejects.toThrow(SkillNotFoundException);

      expect(storageService.uploadSkillFile).not.toHaveBeenCalled();
      expect(storageService.listSkillFiles).not.toHaveBeenCalled();
    });

    it('内置 Skill 上传/删除文件返回 403', async () => {
      db.select.mockReturnValue(
        createSelectChain([makeSkillRecord({ isBuiltin: true })]),
      );

      await expect(
        service.uploadFile(TENANT_ID, SKILL_ID, file),
      ).rejects.toThrow(SkillBuiltinReadonlyException);
      await expect(
        service.deleteFile(TENANT_ID, SKILL_ID, 'SKILL.md'),
      ).rejects.toThrow(SkillBuiltinReadonlyException);
      expect(storageService.uploadSkillFile).not.toHaveBeenCalled();
    });

    it('本租户 Skill 按相对路径上传文件并刷新元数据', async () => {
      db.select.mockReturnValue(createSelectChain([makeSkillRecord()]));
      const updateChain = createUpdateChain([]);
      updateChain.where = vi.fn().mockResolvedValue(undefined);
      db.update.mockReturnValue(updateChain);

      await service.uploadFile(TENANT_ID, SKILL_ID, file);

      expect(storageService.uploadSkillFile).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
        'scripts/run.sh',
        file.buffer,
        'text/x-sh',
      );
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('内置 Skill 的文件列表与下载来自内置种子目录', async () => {
      db.select.mockReturnValue(
        createSelectChain([
          makeSkillRecord({ isBuiltin: true, slug: 'self-evolution' }),
        ]),
      );

      const files = await service.listFiles(TENANT_ID, SKILL_ID);
      expect(files.map((entry) => entry.name)).toContain('SKILL.md');
      expect(files.map((entry) => entry.name)).toContain('sandbox.md');
      expect(storageService.listSkillFiles).not.toHaveBeenCalled();

      const stream = await service.downloadFile(
        TENANT_ID,
        SKILL_ID,
        'SKILL.md',
      );
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      expect(Buffer.concat(chunks).toString('utf-8')).toContain('---');

      await expect(
        service.downloadFile(TENANT_ID, SKILL_ID, 'missing.md'),
      ).rejects.toThrow(SkillFileNotFoundException);
    });
  });

  // ─── findByIds ───────────────────────────────────────────────────────────
  describe('findByIds', () => {
    it('返回多个 Skill', async () => {
      const records = [
        makeSkillRecord(),
        makeSkillRecord({ id: 'another-id' }),
      ];
      db.select.mockReturnValue(createSelectChain(records));

      const result = await service.findByIds(TENANT_ID, [
        SKILL_ID,
        'another-id',
      ]);
      expect(result).toEqual(records);
    });

    it('空 ID 数组返回空数组', async () => {
      const result = await service.findByIds(TENANT_ID, []);
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  // ─── getSkillFileMap ───────────────────────────────────────────────────
  describe('getSkillFileMap', () => {
    it('returns storage file map when extra files exist', async () => {
      storageService.getSkillFileMap.mockResolvedValue({
        'SKILL.md': '# Main',
        'resource-management.md': '## Resource management',
      });

      const result = await service.getSkillFileMap(
        TENANT_ID,
        SKILL_ID,
        '# Fallback',
      );

      expect(result).toEqual({
        'SKILL.md': '# Main',
        'resource-management.md': '## Resource management',
      });
      expect(storageService.getSkillFileMap).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
      );
    });

    it('falls back to stored content when no files were uploaded', async () => {
      storageService.getSkillFileMap.mockResolvedValue({});

      const result = await service.getSkillFileMap(
        TENANT_ID,
        SKILL_ID,
        '# Stored content',
      );

      expect(result).toEqual({ 'SKILL.md': '# Stored content' });
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────
  describe('update', () => {
    beforeEach(() => {
      db.select.mockReturnValue(createSelectChain([makeSkillRecord()]));
    });

    it('正常更新', async () => {
      const updatedRecord = makeSkillRecord({ name: 'Updated', version: 2 });
      db.update.mockReturnValue(createUpdateChain([updatedRecord]));

      const result = await service.update(TENANT_ID, USER_ID, SKILL_ID, {
        name: 'Updated',
        occVersion: 1,
      });

      expect(result).toEqual(updatedRecord);
    });

    it('OCC 版本冲突抛出 SkillVersionConflictException', async () => {
      db.update.mockReturnValue(createUpdateChain([]));

      await expect(
        service.update(TENANT_ID, USER_ID, SKILL_ID, {
          name: 'Updated',
          occVersion: 1,
        }),
      ).rejects.toThrow(SkillVersionConflictException);
    });

    it('不存在或他租户 Skill 抛 404 而不是版本冲突', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.update(TENANT_ID, USER_ID, SKILL_ID, {
          name: 'Updated',
          occVersion: 1,
        }),
      ).rejects.toThrow(SkillNotFoundException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('内置 Skill 不可更新', async () => {
      db.select.mockReturnValue(
        createSelectChain([makeSkillRecord({ isBuiltin: true })]),
      );

      await expect(
        service.update(TENANT_ID, USER_ID, SKILL_ID, {
          name: 'Updated',
          occVersion: 1,
        }),
      ).rejects.toThrow(SkillBuiltinReadonlyException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('改名撞上同租户已有名称时抛 409', async () => {
      const updateChain = createUpdateChain([]);
      updateChain.returning.mockRejectedValue(
        Object.assign(new Error('Failed query'), {
          cause: { code: '23505', constraint_name: 'skills_tenant_name_idx' },
        }),
      );
      db.update.mockReturnValue(updateChain);

      await expect(
        service.update(TENANT_ID, USER_ID, SKILL_ID, {
          name: 'Taken',
          occVersion: 1,
        }),
      ).rejects.toThrow(SkillNameConflictException);
    });

    it('更新时带内容和 frontmatter', async () => {
      const content = '---\ntitle: Updated\n---\n# New body';
      const updatedRecord = makeSkillRecord({
        content,
        frontmatter: { title: 'Updated' },
        version: 2,
      });
      db.update.mockReturnValue(createUpdateChain([updatedRecord]));

      const result = await service.update(TENANT_ID, USER_ID, SKILL_ID, {
        content,
        occVersion: 1,
      });

      expect(result).toEqual(updatedRecord);
    });

    it('更新时上传文件并刷新 fileMeta', async () => {
      const firstUpdate = makeSkillRecord({ version: 2 });
      const afterRefresh = makeSkillRecord({
        version: 2,
        fileCount: 1,
        totalSizeBytes: 500,
      });
      const updateChain1 = createUpdateChain([firstUpdate]);
      const updateChain2 = createUpdateChain([afterRefresh]);

      db.update
        .mockReturnValueOnce(updateChain1)
        .mockReturnValueOnce(updateChain2);

      storageService.listSkillFiles.mockResolvedValue([
        { name: 'test.txt', size: 500 },
      ]);

      const files: SkillUploadFile[] = [
        {
          fieldname: 'files',
          filename: 'test.txt',
          buffer: Buffer.from('hello'),
          mimetype: 'text/plain',
        },
      ];

      const result = await service.update(
        TENANT_ID,
        USER_ID,
        SKILL_ID,
        {
          occVersion: 1,
        },
        files,
      );

      expect(result).toEqual(afterRefresh);
      expect(storageService.uploadSkillFile).toHaveBeenCalledOnce();
    });

    it('更新内容无 frontmatter 时清除 frontmatter', async () => {
      const content = '# No frontmatter';
      const updatedRecord = makeSkillRecord({
        content,
        frontmatter: null,
        version: 2,
      });
      db.update.mockReturnValue(createUpdateChain([updatedRecord]));

      const result = await service.update(TENANT_ID, USER_ID, SKILL_ID, {
        content,
        occVersion: 1,
      });

      expect(result).toEqual(updatedRecord);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('正常删除', async () => {
      const record = makeSkillRecord();
      const selectChain = createSelectChain([record]);
      const deleteChain = createDeleteChain();

      db.select.mockReturnValue(selectChain);
      db.delete.mockReturnValue(deleteChain);

      await service.delete(TENANT_ID, SKILL_ID);

      expect(storageService.deleteSkillFiles).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
      );
      expect(db.delete).toHaveBeenCalledOnce();
    });

    it('未找到抛出 SkillNotFoundException', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(service.delete(TENANT_ID, SKILL_ID)).rejects.toThrow(
        SkillNotFoundException,
      );
    });

    it('内置 Skill 删除返回 403 且不删除', async () => {
      db.select.mockReturnValue(
        createSelectChain([makeSkillRecord({ isBuiltin: true })]),
      );

      await expect(service.delete(TENANT_ID, SKILL_ID)).rejects.toThrow(
        SkillBuiltinReadonlyException,
      );
      expect(db.delete).not.toHaveBeenCalled();
      expect(storageService.deleteSkillFiles).not.toHaveBeenCalled();
    });
  });

  // ─── archive ─────────────────────────────────────────────────────────────
  describe('archive', () => {
    it('正常归档', async () => {
      const record = makeSkillRecord({ status: 'active' });
      const archivedRecord = makeSkillRecord({ status: 'archived' });

      db.select.mockReturnValue(createSelectChain([record]));
      db.update.mockReturnValue(createUpdateChain([archivedRecord]));

      const result = await service.archive(TENANT_ID, USER_ID, SKILL_ID);
      expect(result).toEqual(archivedRecord);
    });

    it('未找到抛出 SkillNotFoundException', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(
        service.archive(TENANT_ID, USER_ID, SKILL_ID),
      ).rejects.toThrow(SkillNotFoundException);
    });

    it('内置 Skill 归档返回 403', async () => {
      db.select.mockReturnValue(
        createSelectChain([makeSkillRecord({ isBuiltin: true })]),
      );

      await expect(
        service.archive(TENANT_ID, USER_ID, SKILL_ID),
      ).rejects.toThrow(SkillBuiltinReadonlyException);
    });

    it('已归档抛出 SkillAlreadyArchivedException', async () => {
      const record = makeSkillRecord({ status: 'archived' });
      db.select.mockReturnValue(createSelectChain([record]));

      await expect(
        service.archive(TENANT_ID, USER_ID, SKILL_ID),
      ).rejects.toThrow(SkillAlreadyArchivedException);
    });
  });

  // ─── refreshFileMeta ────────────────────────────────────────────────────
  describe('refreshFileMeta', () => {
    it('正常刷新文件元数据', async () => {
      storageService.listSkillFiles.mockResolvedValue([
        { name: 'a.md', size: 100 },
        { name: 'b.json', size: 200 },
      ]);
      const updateChain = createUpdateChain([]);
      updateChain.where = vi.fn().mockResolvedValue(undefined);
      db.update.mockReturnValue(updateChain);

      await service.refreshFileMeta(TENANT_ID, SKILL_ID);

      expect(storageService.listSkillFiles).toHaveBeenCalledWith(
        TENANT_ID,
        SKILL_ID,
      );
      expect(db.update).toHaveBeenCalledOnce();
    });
  });
});
