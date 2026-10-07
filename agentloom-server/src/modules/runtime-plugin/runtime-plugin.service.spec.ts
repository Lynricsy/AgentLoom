import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import type { PluginManifest } from '@agentloom/plugin-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { TenantOrganizationResolver } from '../../common/providers/tenant-organization.resolver';
import { DRIZZLE } from '../../database/database.module';
import type { RuntimePluginRecord } from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  RuntimePluginAlreadyExistsException,
  RuntimePluginInactiveException,
  RuntimePluginNotFoundException,
  RuntimePluginVersionConflictException,
} from './runtime-plugin.exceptions';
import {
  RuntimePluginService,
  toRuntimePluginResponse,
} from './runtime-plugin.service';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ORG_ID = '00000000-0000-4000-8000-000000000003';
const RECORD_ID = '00000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-01-01T00:00:00.000Z');

const MANIFEST: PluginManifest = {
  id: 'com.example.demo-rt',
  name: 'Demo RT',
  version: '0.1.0',
  author: 'AgentLoom',
  description: 'demo runtime plugin',
  license: 'MIT',
  minPlatformVersion: '0.1.0',
  permissions: [],
  kind: 'runtime',
  runtime: {
    dshVersion: '0.2.0-rc.2',
    patch: './cordis.patch.yml',
    entry: './dist/index.js',
    configSchema: { type: 'object' },
  },
};

const STORAGE_KEY = `tenants/${TENANT_ID}/runtime-plugins/com.example.demo-rt/0.1.0/archive.alp`;

function createRecord(
  overrides: Partial<RuntimePluginRecord> = {},
): RuntimePluginRecord {
  return {
    id: RECORD_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginId: 'com.example.demo-rt',
    name: 'Demo RT',
    version: '0.1.0',
    author: 'AgentLoom',
    description: 'demo runtime plugin',
    license: 'MIT',
    status: 'registered',
    manifest: { ...MANIFEST },
    bundlePatch: '- insert: []\n',
    configSchema: { type: 'object' },
    storageKey: STORAGE_KEY,
    contentHash: 'a'.repeat(64),
    signature: 'sig',
    sizeBytes: 3,
    installedBy: USER_ID,
    occVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createSelectChainWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createInsertChain(result: unknown) {
  const returning =
    result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function createDeleteChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  return { where, returning };
}

describe('RuntimePluginService', () => {
  let service: RuntimePluginService;
  let db: Record<string, Mock>;
  let storageService: {
    upload: Mock;
    download: Mock;
    delete: Mock;
  };

  beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuntimePluginService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: storageService },
        TenantOrganizationResolver,
      ],
    }).compile();

    service = module.get(RuntimePluginService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function registerParams() {
    return {
      tenantId: TENANT_ID,
      orgId: ORG_ID,
      userId: USER_ID,
      manifest: MANIFEST,
      rawManifest: { ...MANIFEST },
      archive: Buffer.from('zip'),
      bundlePatch: '- insert: []\n',
      signature: 'sig',
      contentHash: 'a'.repeat(64),
      status: 'active' as const,
    };
  }

  describe('register', () => {
    it('按 tenants/<tenantId>/runtime-plugins/<pluginId>/<version>/archive.alp 上传并落库', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));
      const insert = createInsertChain([createRecord({ status: 'active' })]);
      db.insert.mockReturnValue(insert);

      const result = await service.register(registerParams());

      expect(storageService.upload).toHaveBeenCalledWith(
        STORAGE_KEY,
        Buffer.from('zip'),
        3,
        'application/zip',
      );
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          orgId: ORG_ID,
          pluginId: 'com.example.demo-rt',
          version: '0.1.0',
          status: 'active',
          storageKey: STORAGE_KEY,
          bundlePatch: '- insert: []\n',
          configSchema: { type: 'object' },
          sizeBytes: 3,
          installedBy: USER_ID,
        }),
      );
      expect(result.status).toBe('active');
    });

    it('落库失败时删除已上传对象并抛出原始错误', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));
      db.insert.mockReturnValue(createInsertChain(new Error('db down')));

      await expect(service.register(registerParams())).rejects.toThrow(
        'db down',
      );
      expect(storageService.delete).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it('同组织同 pluginId+version 已存在时 409 且不上传', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([createRecord()]),
      );

      await expect(service.register(registerParams())).rejects.toBeInstanceOf(
        RuntimePluginAlreadyExistsException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });
  });

  describe('findActiveById', () => {
    it('非 active 状态抛出 RuntimePluginInactiveException', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([createRecord({ status: 'disabled' })]),
      );

      await expect(
        service.findActiveById(RECORD_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(RuntimePluginInactiveException);
    });

    it('不存在时抛出 RuntimePluginNotFoundException', async () => {
      db.select.mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.findActiveById(RECORD_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(RuntimePluginNotFoundException);
    });

    it('active 时返回完整记录', async () => {
      const record = createRecord({ status: 'active' });
      db.select.mockReturnValueOnce(createSelectChainWithLimit([record]));

      await expect(service.findActiveById(RECORD_ID, TENANT_ID)).resolves.toBe(
        record,
      );
    });
  });

  describe('updateStatus', () => {
    it('occVersion 不匹配时抛出版本冲突', async () => {
      db.update.mockReturnValue(createUpdateChain([]));
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([createRecord({ occVersion: 3 })]),
      );

      await expect(
        service.updateStatus(RECORD_ID, TENANT_ID, 'active', 1),
      ).rejects.toBeInstanceOf(RuntimePluginVersionConflictException);
    });
  });

  describe('remove', () => {
    it('先删存储对象再删行', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([createRecord()]),
      );
      const deleteChain = createDeleteChain([{ id: RECORD_ID }]);
      db.delete.mockReturnValue(deleteChain);

      await service.remove(RECORD_ID, TENANT_ID);

      expect(storageService.delete).toHaveBeenCalledWith(STORAGE_KEY);
      expect(storageService.delete.mock.invocationCallOrder[0]).toBeLessThan(
        deleteChain.where.mock.invocationCallOrder[0],
      );
    });
  });

  describe('downloadArchive', () => {
    it('把存储流收集为 Buffer', async () => {
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('ab'), Buffer.from('c')]),
      );

      await expect(service.downloadArchive(createRecord())).resolves.toEqual(
        Buffer.from('abc'),
      );
      expect(storageService.download).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  describe('toRuntimePluginResponse', () => {
    it('不暴露 storageKey / signature / bundlePatch / manifest', () => {
      const response = toRuntimePluginResponse(createRecord());

      expect(response).not.toHaveProperty('storageKey');
      expect(response).not.toHaveProperty('signature');
      expect(response).not.toHaveProperty('bundlePatch');
      expect(response).not.toHaveProperty('manifest');
      expect(response.createdAt).toBe(NOW.toISOString());
    });
  });
});
