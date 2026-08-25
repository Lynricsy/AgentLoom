import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type { PluginRecord } from '../../database/schema';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { QueryPluginsDto } from './dto/plugin.dto';
import {
  PluginAlreadyExistsException,
  PluginInactiveException,
  PluginNotFoundException,
  PluginValidationException,
  PluginVersionConflictException,
} from './plugin.exceptions';
import { PluginService } from './plugin.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const PLUGIN_ID = '00000000-0000-0000-0000-000000000004';
const SOURCE_TENANT_ID = '00000000-0000-0000-0000-000000000005';
const NOW = new Date('2025-01-01T00:00:00.000Z');

const VALID_MANIFEST = {
  pluginId: 'com.example.review',
  name: 'Review Analyzer',
  version: '1.0.0',
  author: '狐娘',
  description: '分析评论的插件',
  license: 'MIT',
  minPlatformVersion: '1.0.0',
  permissions: ['network:outbound'],
  metadata: { category: 'analysis' },
};

const VALID_NODE_DEFINITIONS = [
  {
    type: 'review-analyzer',
    title: '评论分析器',
  },
];

function createPlugin(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id: PLUGIN_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginId: 'com.example.review',
    name: 'Review Analyzer',
    version: '1.0.0',
    author: '狐娘',
    description: '分析评论的插件',
    license: 'MIT',
    status: 'registered',
    manifest: {
      id: 'com.example.review',
      name: 'Review Analyzer',
      version: '1.0.0',
      author: '狐娘',
      description: '分析评论的插件',
      license: 'MIT',
      minPlatformVersion: '1.0.0',
      permissions: ['network:outbound'],
      metadata: { category: 'analysis' },
    },
    nodeDefinitions: VALID_NODE_DEFINITIONS,
    storageKey: null,
    signature: null,
    contentHash: null,
    wasmBundleUrl: null,
    permissions: ['network:outbound'],
    installedBy: USER_ID,
    metadata: { category: 'analysis' },
    occVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createSelectChain(result: unknown) {
  const where = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectChainWithPagination(result: unknown) {
  const offset = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit, offset };
}

function createSelectChainWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createInsertChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
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

function createQueryDto(
  overrides: Partial<QueryPluginsDto> = {},
): QueryPluginsDto {
  return Object.assign(new QueryPluginsDto(), overrides);
}

describe('PluginService', () => {
  let service: PluginService;
  let db: Record<string, ReturnType<typeof vi.fn>>;
  let storageService: {
    upload: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    db = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (callback: (tx: typeof db) => unknown) =>
        callback(db),
      ),
    };

    storageService = {
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginService,
        { provide: DRIZZLE, useValue: db },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get(PluginService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('应当在缺少 orgId 时回退查询组织并创建插件记录', async () => {
      const selectOrg = createSelectChainWithLimit([{ id: ORG_ID }]);
      const selectExisting = createSelectChainWithLimit([]);
      const insertPlugin = createInsertChain([createPlugin()]);

      db.select
        .mockReturnValueOnce(selectOrg)
        .mockReturnValueOnce(selectExisting);
      db.insert.mockReturnValue(insertPlugin);

      const result = await service.register(
        TENANT_ID,
        undefined,
        USER_ID,
        VALID_MANIFEST,
        VALID_NODE_DEFINITIONS,
        'plugins/review.alp',
      );

      expect(selectOrg.limit).toHaveBeenCalledWith(1);
      expect(insertPlugin.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          orgId: ORG_ID,
          pluginId: 'com.example.review',
          manifest: expect.objectContaining({
            id: 'com.example.review',
            minPlatformVersion: '1.0.0',
          }),
          permissions: ['network:outbound'],
          storageKey: 'plugins/review.alp',
          installedBy: USER_ID,
          status: 'registered',
        }),
      );
      expect(result).toEqual(createPlugin());
    });

    it('插件已存在时应抛出 409', async () => {
      const selectExisting = createSelectChainWithLimit([createPlugin()]);
      db.select.mockReturnValue(selectExisting);

      await expect(
        service.register(
          TENANT_ID,
          ORG_ID,
          USER_ID,
          VALID_MANIFEST,
          VALID_NODE_DEFINITIONS,
        ),
      ).rejects.toBeInstanceOf(PluginAlreadyExistsException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('manifest 无效时应抛出 422', async () => {
      await expect(
        service.register(
          TENANT_ID,
          ORG_ID,
          USER_ID,
          {
            name: 'Broken Plugin',
            version: '1.0.0',
            author: '狐娘',
          },
          VALID_NODE_DEFINITIONS,
        ),
      ).rejects.toBeInstanceOf(PluginValidationException);

      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('缺少 minPlatformVersion 时应抛出 SDK 校验错误', async () => {
      await expect(
        service.register(
          TENANT_ID,
          ORG_ID,
          USER_ID,
          {
            ...VALID_MANIFEST,
            minPlatformVersion: undefined,
          },
          VALID_NODE_DEFINITIONS,
        ),
      ).rejects.toMatchObject({
        constructor: PluginValidationException,
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'minPlatformVersion' }),
        ]),
      });
    });

    it('存在非法权限值时应抛出 SDK 校验错误', async () => {
      await expect(
        service.register(
          TENANT_ID,
          ORG_ID,
          USER_ID,
          {
            ...VALID_MANIFEST,
            permissions: ['network.read'],
          },
          VALID_NODE_DEFINITIONS,
        ),
      ).rejects.toMatchObject({
        constructor: PluginValidationException,
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'permissions.0' }),
        ]),
      });
    });
  });

  describe('findAll', () => {
    it('应当返回分页后的插件列表', async () => {
      const selectData = createSelectChainWithPagination([
        createPlugin({ name: 'Review Analyzer A' }),
      ]);
      const selectCount = createSelectChain([{ count: 1 }]);

      db.select
        .mockReturnValueOnce(selectData)
        .mockReturnValueOnce(selectCount);

      const result = await service.findAll(
        TENANT_ID,
        createQueryDto({ page: 2, pageSize: 10, search: 'Review' }),
      );

      expect(selectData.limit).toHaveBeenCalledWith(10);
      expect(selectData.offset).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        data: [createPlugin({ name: 'Review Analyzer A' })],
        meta: {
          page: 2,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
      });
    });
  });

  describe('findById', () => {
    it('应当返回指定插件', async () => {
      const selectPlugin = createSelectChain([createPlugin()]);
      db.select.mockReturnValue(selectPlugin);

      const result = await service.findById(PLUGIN_ID, TENANT_ID);

      expect(result).toEqual(createPlugin());
    });

    it('未找到时应抛出 404', async () => {
      const selectPlugin = createSelectChain([]);
      db.select.mockReturnValue(selectPlugin);

      await expect(
        service.findById(PLUGIN_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(PluginNotFoundException);
    });
  });

  describe('findByPluginId', () => {
    it('应当在缺少 orgId 时回退按 tenant 查询组织后返回插件', async () => {
      const selectOrg = createSelectChainWithLimit([{ id: ORG_ID }]);
      const selectPlugin = createSelectChainWithLimit([createPlugin()]);

      db.select
        .mockReturnValueOnce(selectOrg)
        .mockReturnValueOnce(selectPlugin);

      const result = await service.findByPluginId(
        'com.example.review',
        undefined,
        TENANT_ID,
      );

      expect(result).toEqual(createPlugin());
      expect(selectPlugin.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('updateStatus', () => {
    it('应当在 OCC 通过时更新插件状态', async () => {
      const updatedPlugin = createPlugin({
        status: 'active',
        occVersion: 2,
        updatedAt: NOW,
      });
      const updatePlugin = createUpdateChain([updatedPlugin]);
      db.update.mockReturnValue(updatePlugin);

      const result = await service.updateStatus(
        PLUGIN_ID,
        TENANT_ID,
        'active',
        1,
      );

      expect(updatePlugin.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual(updatedPlugin);
    });

    it('更新不存在插件时应抛出 404', async () => {
      const updatePlugin = createUpdateChain([]);
      const selectPlugin = createSelectChain([]);
      db.update.mockReturnValue(updatePlugin);
      db.select.mockReturnValue(selectPlugin);

      await expect(
        service.updateStatus(PLUGIN_ID, TENANT_ID, 'active', 1),
      ).rejects.toBeInstanceOf(PluginNotFoundException);
    });

    it('版本冲突时应抛出 409 并携带 currentVersion', async () => {
      const updatePlugin = createUpdateChain([]);
      const selectPlugin = createSelectChain([createPlugin({ occVersion: 3 })]);
      db.update.mockReturnValue(updatePlugin);
      db.select.mockReturnValue(selectPlugin);

      await expect(
        service.updateStatus(PLUGIN_ID, TENANT_ID, 'active', 1),
      ).rejects.toMatchObject({
        constructor: PluginVersionConflictException,
        extensions: { currentVersion: 3 },
      });
    });
  });

  describe('updateRegistrationArtifacts', () => {
    it('应当用 OCC 回写插件归档、签名、WASM URL 和 metadata', async () => {
      const updatedPlugin = createPlugin({
        name: 'Updated Review Analyzer',
        version: '1.0.1',
        manifest: {
          ...VALID_MANIFEST,
          id: 'com.example.review',
          pluginId: undefined,
          name: 'Updated Review Analyzer',
          version: '1.0.1',
          metadata: {
            source: 'generated-app-private-plugin',
            wasmBundleUrl: 'plugins/review/plugin.wasm',
          },
        },
        storageKey: 'plugins/review/archive.alp',
        signature: 'signature',
        contentHash: 'a'.repeat(64),
        wasmBundleUrl: 'plugins/review/plugin.wasm',
        metadata: {
          source: 'generated-app-private-plugin',
          wasmBundleUrl: 'plugins/review/plugin.wasm',
        },
        occVersion: 2,
      });
      const updatePlugin = createUpdateChain([updatedPlugin]);
      db.update.mockReturnValue(updatePlugin);

      const result = await service.updateRegistrationArtifacts(
        PLUGIN_ID,
        TENANT_ID,
        1,
        {
          ...VALID_MANIFEST,
          name: 'Updated Review Analyzer',
          version: '1.0.1',
          metadata: {
            source: 'generated-app-private-plugin',
            wasmBundleUrl: 'plugins/review/plugin.wasm',
          },
        },
        VALID_NODE_DEFINITIONS,
        'plugins/review/archive.alp',
        {
          signature: 'signature',
          contentHash: 'a'.repeat(64),
          wasmBundleUrl: 'plugins/review/plugin.wasm',
        },
      );

      expect(updatePlugin.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Review Analyzer',
          version: '1.0.1',
          storageKey: 'plugins/review/archive.alp',
          signature: 'signature',
          contentHash: 'a'.repeat(64),
          wasmBundleUrl: 'plugins/review/plugin.wasm',
          metadata: {
            source: 'generated-app-private-plugin',
            wasmBundleUrl: 'plugins/review/plugin.wasm',
          },
          updatedAt: NOW,
        }),
      );
      expect(result).toEqual(updatedPlugin);
    });

    it('更新归档时版本冲突应抛出 409 并携带 currentVersion', async () => {
      const updatePlugin = createUpdateChain([]);
      const selectPlugin = createSelectChain([createPlugin({ occVersion: 4 })]);
      db.update.mockReturnValue(updatePlugin);
      db.select.mockReturnValue(selectPlugin);

      await expect(
        service.updateRegistrationArtifacts(
          PLUGIN_ID,
          TENANT_ID,
          1,
          VALID_MANIFEST,
          VALID_NODE_DEFINITIONS,
          'plugins/review/archive.alp',
        ),
      ).rejects.toMatchObject({
        constructor: PluginVersionConflictException,
        extensions: { currentVersion: 4 },
      });
    });
  });

  describe('remove', () => {
    it('应删除插件并清理本租户前缀的对象', async () => {
      const plugin = createPlugin({
        storageKey: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/archive.alp`,
        wasmBundleUrl: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/plugin.wasm`,
      });
      db.select.mockReturnValue(createSelectChain([plugin]));
      db.delete.mockReturnValue(createDeleteChain([{ id: PLUGIN_ID }]));

      await expect(
        service.remove(PLUGIN_ID, TENANT_ID),
      ).resolves.toBeUndefined();

      expect(storageService.delete).toHaveBeenCalledTimes(2);
      expect(storageService.delete).toHaveBeenCalledWith(plugin.storageKey);
      expect(storageService.delete).toHaveBeenCalledWith(plugin.wasmBundleUrl);
    });

    it('不得删除指向其他租户前缀的对象', async () => {
      const plugin = createPlugin({
        storageKey:
          'tenants/99999999-9999-4999-8999-999999999999/plugins/com.example.review/1.0.0/archive.alp',
        wasmBundleUrl: null,
      });
      db.select.mockReturnValue(createSelectChain([plugin]));
      db.delete.mockReturnValue(createDeleteChain([{ id: PLUGIN_ID }]));

      await service.remove(PLUGIN_ID, TENANT_ID);

      expect(storageService.delete).not.toHaveBeenCalled();
    });

    it('对象删除失败不应影响删除结果', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const plugin = createPlugin({
        storageKey: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/archive.alp`,
        wasmBundleUrl: null,
      });
      db.select.mockReturnValue(createSelectChain([plugin]));
      db.delete.mockReturnValue(createDeleteChain([{ id: PLUGIN_ID }]));
      storageService.delete.mockRejectedValueOnce(new Error('minio down'));

      await expect(
        service.remove(PLUGIN_ID, TENANT_ID),
      ).resolves.toBeUndefined();
    });

    it('删除不存在插件时应抛出 404 且不动对象', async () => {
      db.select.mockReturnValue(createSelectChain([]));

      await expect(service.remove(PLUGIN_ID, TENANT_ID)).rejects.toBeInstanceOf(
        PluginNotFoundException,
      );
      expect(db.delete).not.toHaveBeenCalled();
      expect(storageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('findActiveByPluginId', () => {
    it('插件未激活时应抛出 422', async () => {
      const selectPlugin = createSelectChainWithLimit([
        createPlugin({ status: 'disabled' }),
      ]);
      db.select.mockReturnValue(selectPlugin);

      await expect(
        service.findActiveByPluginId('com.example.review', ORG_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(PluginInactiveException);
    });
  });

  describe('findActiveWasmPluginForRouting', () => {
    it('应在 SQL 层过滤 active 状态并返回带 WASM 的插件', async () => {
      const activePlugin = createPlugin({
        status: 'active',
        wasmBundleUrl: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/plugin.wasm`,
      });
      const selectActive = createSelectChainWithLimit([activePlugin]);
      db.select.mockReturnValueOnce(selectActive);

      await expect(
        service.findActiveWasmPluginForRouting(TENANT_ID, 'com.example.review'),
      ).resolves.toEqual(activePlugin);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(selectActive.limit).toHaveBeenCalledWith(1);
    });

    it('无 active 行但存在同名插件时应抛 422 inactive', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([{ id: PLUGIN_ID }]));

      await expect(
        service.findActiveWasmPluginForRouting(TENANT_ID, 'com.example.review'),
      ).rejects.toBeInstanceOf(PluginInactiveException);
    });

    it('插件完全不存在时应抛 404', async () => {
      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.findActiveWasmPluginForRouting(TENANT_ID, 'com.example.absent'),
      ).rejects.toBeInstanceOf(PluginNotFoundException);
    });

    it('active 插件缺少 WASM 产物时应抛 422', async () => {
      db.select.mockReturnValueOnce(
        createSelectChainWithLimit([
          createPlugin({ status: 'active', wasmBundleUrl: null }),
        ]),
      );

      await expect(
        service.findActiveWasmPluginForRouting(TENANT_ID, 'com.example.review'),
      ).rejects.toBeInstanceOf(PluginValidationException);
    });
  });

  describe('cloneMarketplacePlugin', () => {
    it('应把 listing 价格与源版本写入 clone metadata 快照', async () => {
      const sourcePlugin = createPlugin({
        status: 'active',
        version: '2.1.0',
        contentHash: 'sha256:source-hash',
        wasmBundleUrl: 'tenants/source/plugins/com.example.review/plugin.wasm',
      });
      const selectOrg = createSelectChainWithLimit([{ id: ORG_ID }]);
      const selectExisting = createSelectChainWithLimit([]);
      const insertPlugin = createInsertChain([
        createPlugin({ id: 'clone-id' }),
      ]);

      db.select
        .mockReturnValueOnce(selectOrg)
        .mockReturnValueOnce(selectExisting);
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('artifact')]),
      );
      db.insert.mockReturnValue(insertPlugin);

      await service.cloneMarketplacePlugin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        source: {
          listingId: 'listing-9',
          listingTitle: '收费插件 listing',
          pricingModel: 'per_execution',
          pricePerExecution: '1.5',
          plugin: sourcePlugin,
        },
      });

      expect(insertPlugin.values).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            cloned_from_marketplace: {
              listingId: 'listing-9',
              listingTitle: '收费插件 listing',
              sourceTenantId: TENANT_ID,
              sourceOrgId: ORG_ID,
              sourcePluginDbId: PLUGIN_ID,
              sourcePluginId: 'com.example.review',
              clonedAt: NOW.toISOString(),
              upgradedAt: null,
              pricingModel: 'per_execution',
              pricePerExecution: '1.50000000',
              sourceVersion: '2.1.0',
              sourceContentHash: 'sha256:source-hash',
            },
          }),
        }),
      );
    });

    it('应把源产物复制到目标租户前缀并写入新 key', async () => {
      const sourcePlugin = createPlugin({
        status: 'active',
        version: '2.1.0',
        storageKey: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/2.1.0/archive.alp`,
        wasmBundleUrl: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/2.1.0/plugin.wasm`,
      });
      const insertPlugin = createInsertChain([
        createPlugin({ id: 'clone-id' }),
      ]);

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));
      db.insert.mockReturnValue(insertPlugin);
      storageService.download.mockImplementation(async () =>
        Readable.from([Buffer.from('artifact')]),
      );

      await service.cloneMarketplacePlugin({
        tenantId: TENANT_ID,
        userId: USER_ID,
        source: {
          listingId: 'listing-9',
          listingTitle: '收费插件 listing',
          pricingModel: 'free',
          pricePerExecution: null,
          plugin: sourcePlugin,
        },
      });

      expect(storageService.download).toHaveBeenNthCalledWith(
        1,
        sourcePlugin.wasmBundleUrl,
      );
      expect(storageService.download).toHaveBeenNthCalledWith(
        2,
        sourcePlugin.storageKey,
      );
      expect(storageService.upload).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/plugins/com.example.review/2.1.0/plugin.wasm`,
        Buffer.from('artifact'),
        8,
        'application/wasm',
      );
      expect(storageService.upload).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/plugins/com.example.review/2.1.0/archive.alp`,
        Buffer.from('artifact'),
        8,
        'application/zip',
      );
      expect(insertPlugin.values).toHaveBeenCalledWith(
        expect.objectContaining({
          storageKey: `tenants/${TENANT_ID}/plugins/com.example.review/2.1.0/archive.alp`,
          wasmBundleUrl: `tenants/${TENANT_ID}/plugins/com.example.review/2.1.0/plugin.wasm`,
        }),
      );
    });

    it('源插件缺少 WASM 产物时应拒绝安装且不复制对象', async () => {
      const sourcePlugin = createPlugin({
        status: 'active',
        wasmBundleUrl: null,
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));

      await expect(
        service.cloneMarketplacePlugin({
          tenantId: TENANT_ID,
          userId: USER_ID,
          source: {
            listingId: 'listing-9',
            listingTitle: '无产物 listing',
            pricingModel: 'free',
            pricePerExecution: null,
            plugin: sourcePlugin,
          },
        }),
      ).rejects.toBeInstanceOf(PluginValidationException);

      expect(storageService.download).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('落库失败时应清理已复制的目标对象', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const sourcePlugin = createPlugin({
        status: 'active',
        version: '2.1.0',
        storageKey: null,
        wasmBundleUrl: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/2.1.0/plugin.wasm`,
      });

      db.select
        .mockReturnValueOnce(createSelectChainWithLimit([{ id: ORG_ID }]))
        .mockReturnValueOnce(createSelectChainWithLimit([]));
      storageService.download.mockResolvedValue(
        Readable.from([Buffer.from('artifact')]),
      );
      db.insert.mockImplementation(() => {
        throw new Error('insert failed');
      });

      await expect(
        service.cloneMarketplacePlugin({
          tenantId: TENANT_ID,
          userId: USER_ID,
          source: {
            listingId: 'listing-9',
            listingTitle: '收费插件 listing',
            pricingModel: 'free',
            pricePerExecution: null,
            plugin: sourcePlugin,
          },
        }),
      ).rejects.toThrow('insert failed');

      expect(storageService.delete).toHaveBeenCalledWith(
        `tenants/${TENANT_ID}/plugins/com.example.review/2.1.0/plugin.wasm`,
      );
    });
  });

  describe('upgradeMarketplaceClone', () => {
    function createCloneRecord(overrides: Partial<PluginRecord> = {}) {
      return createPlugin({
        id: 'clone-id',
        status: 'active',
        version: '1.0.0',
        contentHash: 'sha256:old',
        storageKey: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/archive.alp`,
        wasmBundleUrl: `tenants/${TENANT_ID}/plugins/com.example.review/1.0.0/plugin.wasm`,
        occVersion: 3,
        metadata: {
          cloned_from_marketplace: {
            listingId: 'listing-9',
            listingTitle: '收费插件 listing',
            sourceTenantId: SOURCE_TENANT_ID,
            sourceOrgId: ORG_ID,
            sourcePluginDbId: PLUGIN_ID,
            sourcePluginId: 'com.example.review',
            clonedAt: '2024-06-01T00:00:00.000Z',
            upgradedAt: null,
            pricingModel: 'free',
            pricePerExecution: null,
            sourceVersion: '1.0.0',
            sourceContentHash: 'sha256:old',
          },
        },
        ...overrides,
      });
    }

    function createNewSourcePlugin(overrides: Partial<PluginRecord> = {}) {
      return createPlugin({
        status: 'active',
        version: '2.0.0',
        contentHash: 'sha256:new',
        storageKey: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/2.0.0/archive.alp`,
        wasmBundleUrl: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/2.0.0/plugin.wasm`,
        ...overrides,
      });
    }

    function createSource(plugin: PluginRecord) {
      return {
        listingId: 'listing-9',
        listingTitle: '收费插件 listing',
        pricingModel: 'per_execution' as const,
        pricePerExecution: '2.5',
        plugin,
      };
    }

    it('应复制新版本产物、OCC 更新记录并清理旧产物', async () => {
      const clone = createCloneRecord();
      const sourcePlugin = createNewSourcePlugin();
      const updateChain = createUpdateChain([
        createPlugin({ id: 'clone-id', version: '2.0.0' }),
      ]);

      db.select.mockReturnValueOnce(createSelectChain([clone]));
      db.update.mockReturnValue(updateChain);
      storageService.download.mockImplementation(async () =>
        Readable.from([Buffer.from('artifact')]),
      );

      const result = await service.upgradeMarketplaceClone({
        tenantId: TENANT_ID,
        userId: USER_ID,
        cloneDbId: 'clone-id',
        source: createSource(sourcePlugin),
      });

      const wasmKeyPattern = new RegExp(
        `^tenants/${TENANT_ID}/plugins/com\\.example\\.review/2\\.0\\.0/[0-9a-f-]{36}/plugin\\.wasm$`,
      );
      const archiveKeyPattern = new RegExp(
        `^tenants/${TENANT_ID}/plugins/com\\.example\\.review/2\\.0\\.0/[0-9a-f-]{36}/archive\\.alp$`,
      );

      expect(storageService.upload).toHaveBeenCalledWith(
        expect.stringMatching(wasmKeyPattern),
        Buffer.from('artifact'),
        8,
        'application/wasm',
      );
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '2.0.0',
          contentHash: 'sha256:new',
          wasmBundleUrl: expect.stringMatching(wasmKeyPattern),
          storageKey: expect.stringMatching(archiveKeyPattern),
        }),
      );
      // name/description 是安装方自己的标签，升级不覆盖
      expect(updateChain.set.mock.calls[0][0]).not.toHaveProperty('name');
      expect(updateChain.set.mock.calls[0][0]).not.toHaveProperty(
        'description',
      );
      // 旧版本产物在记录写成功后才清理
      expect(storageService.delete).toHaveBeenCalledWith(clone.wasmBundleUrl);
      expect(storageService.delete).toHaveBeenCalledWith(clone.storageKey);
      expect(result.version).toBe('2.0.0');
    });

    it('应保留原 clonedAt、写入 upgradedAt 并重新快照价格', async () => {
      const clone = createCloneRecord();
      const updateChain = createUpdateChain([
        createPlugin({ id: 'clone-id', version: '2.0.0' }),
      ]);

      db.select.mockReturnValueOnce(createSelectChain([clone]));
      db.update.mockReturnValue(updateChain);
      storageService.download.mockImplementation(async () =>
        Readable.from([Buffer.from('artifact')]),
      );

      await service.upgradeMarketplaceClone({
        tenantId: TENANT_ID,
        userId: USER_ID,
        cloneDbId: 'clone-id',
        source: createSource(createNewSourcePlugin()),
      });

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            cloned_from_marketplace: expect.objectContaining({
              clonedAt: '2024-06-01T00:00:00.000Z',
              upgradedAt: NOW.toISOString(),
              pricingModel: 'per_execution',
              pricePerExecution: '2.50000000',
              sourceVersion: '2.0.0',
              sourceContentHash: 'sha256:new',
            }),
          }),
        }),
      );
    });

    it('listing 换绑到别的插件时应拒绝升级', async () => {
      const clone = createCloneRecord();
      const otherPlugin = createNewSourcePlugin({
        id: '00000000-0000-0000-0000-000000000099',
        pluginId: 'com.other.plugin',
      });

      db.select.mockReturnValueOnce(createSelectChain([clone]));

      await expect(
        service.upgradeMarketplaceClone({
          tenantId: TENANT_ID,
          userId: USER_ID,
          cloneDbId: 'clone-id',
          source: createSource(otherPlugin),
        }),
      ).rejects.toBeInstanceOf(PluginValidationException);
      expect(storageService.download).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('源插件 db id 换掉(同 pluginId 换记录)时也应拒绝升级', async () => {
      const clone = createCloneRecord();
      const rebound = createNewSourcePlugin({
        id: '00000000-0000-0000-0000-000000000098',
      });

      db.select.mockReturnValueOnce(createSelectChain([clone]));

      await expect(
        service.upgradeMarketplaceClone({
          tenantId: TENANT_ID,
          userId: USER_ID,
          cloneDbId: 'clone-id',
          source: createSource(rebound),
        }),
      ).rejects.toBeInstanceOf(PluginValidationException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('非 marketplace 副本应拒绝升级', async () => {
      db.select.mockReturnValueOnce(
        createSelectChain([createPlugin({ id: 'clone-id' })]),
      );

      await expect(
        service.upgradeMarketplaceClone({
          tenantId: TENANT_ID,
          userId: USER_ID,
          cloneDbId: 'clone-id',
          source: createSource(createNewSourcePlugin()),
        }),
      ).rejects.toBeInstanceOf(PluginValidationException);
    });

    it('OCC 冲突时应回滚新复制的产物并抛 409', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const clone = createCloneRecord();

      db.select.mockReturnValueOnce(createSelectChain([clone]));
      db.update.mockReturnValue(createUpdateChain([]));
      storageService.download.mockImplementation(async () =>
        Readable.from([Buffer.from('artifact')]),
      );

      await expect(
        service.upgradeMarketplaceClone({
          tenantId: TENANT_ID,
          userId: USER_ID,
          cloneDbId: 'clone-id',
          source: createSource(createNewSourcePlugin()),
        }),
      ).rejects.toBeInstanceOf(PluginVersionConflictException);

      expect(storageService.delete).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `^tenants/${TENANT_ID}/plugins/com\\.example\\.review/2\\.0\\.0/[0-9a-f-]{36}/plugin\\.wasm$`,
          ),
        ),
      );
      // 旧产物必须留着：记录还指向它
      expect(storageService.delete).not.toHaveBeenCalledWith(
        clone.wasmBundleUrl,
      );
    });

    it('同版本新内容也必须复制产物并写入新 key', async () => {
      const clone = createCloneRecord();
      // 发布方就地重发同 version 的新二进制：只有 contentHash 变化
      const rebuiltSource = createNewSourcePlugin({
        version: '1.0.0',
        contentHash: 'sha256:rebuilt',
        storageKey: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/1.0.0/archive.alp`,
        wasmBundleUrl: `tenants/${SOURCE_TENANT_ID}/plugins/com.example.review/1.0.0/plugin.wasm`,
      });
      const updateChain = createUpdateChain([
        createPlugin({ id: 'clone-id', version: '1.0.0' }),
      ]);

      db.select.mockReturnValueOnce(createSelectChain([clone]));
      db.update.mockReturnValue(updateChain);
      storageService.download.mockImplementation(async () =>
        Readable.from([Buffer.from('rebuilt-artifact')]),
      );

      await service.upgradeMarketplaceClone({
        tenantId: TENANT_ID,
        userId: USER_ID,
        cloneDbId: 'clone-id',
        source: createSource(rebuiltSource),
      });

      const uniqueKeyPattern = new RegExp(
        `^tenants/${TENANT_ID}/plugins/com\\.example\\.review/1\\.0\\.0/[0-9a-f-]{36}/plugin\\.wasm$`,
      );

      // 复制必须真的发生：否则库里写着新 contentHash，对象里还是旧字节
      expect(storageService.download).toHaveBeenCalledWith(
        rebuiltSource.wasmBundleUrl,
      );
      expect(storageService.upload).toHaveBeenCalledWith(
        expect.stringMatching(uniqueKeyPattern),
        Buffer.from('rebuilt-artifact'),
        16,
        'application/wasm',
      );

      const updatePayload = updateChain.set.mock.calls[0][0] as {
        wasmBundleUrl: string;
        contentHash: string | null;
      };
      expect(updatePayload.wasmBundleUrl).toMatch(uniqueKeyPattern);
      expect(updatePayload.wasmBundleUrl).not.toBe(clone.wasmBundleUrl);
      expect(updatePayload.contentHash).toBe('sha256:rebuilt');
      // 旧 key 在记录切换后清理，不会与新 key 冲突
      expect(storageService.delete).toHaveBeenCalledWith(clone.wasmBundleUrl);
    });

    it('源插件缺少 WASM 产物时应拒绝升级', async () => {
      const clone = createCloneRecord();

      db.select.mockReturnValueOnce(createSelectChain([clone]));

      await expect(
        service.upgradeMarketplaceClone({
          tenantId: TENANT_ID,
          userId: USER_ID,
          cloneDbId: 'clone-id',
          source: createSource(createNewSourcePlugin({ wasmBundleUrl: null })),
        }),
      ).rejects.toBeInstanceOf(PluginValidationException);
    });
  });

  describe('resolveUsageSourceContext', () => {
    it('非 marketplace clone 的免费插件应返回 null billingAmount', async () => {
      const plugin = createPlugin({
        status: 'active',
        metadata: { category: 'analysis' },
      });

      await expect(service.resolveUsageSourceContext(plugin)).resolves.toEqual({
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: PLUGIN_ID,
        sourcePluginId: 'com.example.review',
        sourceListingId: null,
        pricingModel: 'free',
        billingAmount: null,
        currency: 'USD',
      });
    });

    it('旧 clone（无价格快照）的已上架收费插件应回退查询 listing 计费', async () => {
      const clonedPlugin = createPlugin({
        id: 'plugin-copy-id',
        status: 'active',
        metadata: {
          cloned_from_marketplace: {
            listingId: 'listing-1',
            listingTitle: '公开插件 listing',
            sourceTenantId: TENANT_ID,
            sourceOrgId: ORG_ID,
            sourcePluginDbId: PLUGIN_ID,
            sourcePluginId: 'com.example.review',
            clonedAt: NOW.toISOString(),
          },
        },
      });
      db.select.mockReturnValue(
        createSelectChainWithLimit([
          {
            id: 'listing-1',
            pricingModel: 'per_execution',
            pricePerExecution: '0.25000000',
          },
        ]),
      );

      await expect(
        service.resolveUsageSourceContext(clonedPlugin),
      ).resolves.toEqual({
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: PLUGIN_ID,
        sourcePluginId: 'com.example.review',
        sourceListingId: 'listing-1',
        pricingModel: 'per_execution',
        billingAmount: '0.25000000',
        currency: 'USD',
      });
    });

    it('旧 clone（无价格快照）的源 listing 未上架时应回退为免费', async () => {
      const clonedPlugin = createPlugin({
        id: 'plugin-copy-id',
        status: 'active',
        metadata: {
          cloned_from_marketplace: {
            listingId: 'listing-2',
            listingTitle: '已下架插件 listing',
            sourceTenantId: TENANT_ID,
            sourceOrgId: ORG_ID,
            sourcePluginDbId: PLUGIN_ID,
            sourcePluginId: 'com.example.review',
            clonedAt: NOW.toISOString(),
          },
        },
      });
      db.select.mockReturnValue(createSelectChainWithLimit([]));

      await expect(
        service.resolveUsageSourceContext(clonedPlugin),
      ).resolves.toEqual({
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: PLUGIN_ID,
        sourcePluginId: 'com.example.review',
        sourceListingId: 'listing-2',
        pricingModel: 'free',
        billingAmount: null,
        currency: 'USD',
      });
    });

    it('含价格快照的 clone 在源 listing 下架后仍应按快照价计费', async () => {
      const clonedPlugin = createPlugin({
        id: 'plugin-copy-id',
        status: 'active',
        metadata: {
          cloned_from_marketplace: {
            listingId: 'listing-3',
            listingTitle: '已下架但快照有价的 listing',
            sourceTenantId: TENANT_ID,
            sourceOrgId: ORG_ID,
            sourcePluginDbId: PLUGIN_ID,
            sourcePluginId: 'com.example.review',
            clonedAt: NOW.toISOString(),
            pricingModel: 'per_execution',
            pricePerExecution: '0.75000000',
            sourceVersion: '1.0.0',
            sourceContentHash: 'sha256:abc',
          },
        },
      });

      await expect(
        service.resolveUsageSourceContext(clonedPlugin),
      ).resolves.toEqual({
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: PLUGIN_ID,
        sourcePluginId: 'com.example.review',
        sourceListingId: 'listing-3',
        pricingModel: 'per_execution',
        billingAmount: '0.75000000',
        currency: 'USD',
      });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('含 free 快照的 clone 应免计费且不查询 listing', async () => {
      const clonedPlugin = createPlugin({
        id: 'plugin-copy-id',
        status: 'active',
        metadata: {
          cloned_from_marketplace: {
            listingId: 'listing-4',
            listingTitle: '免费 listing',
            sourceTenantId: TENANT_ID,
            sourceOrgId: ORG_ID,
            sourcePluginDbId: PLUGIN_ID,
            sourcePluginId: 'com.example.review',
            clonedAt: NOW.toISOString(),
            pricingModel: 'free',
            pricePerExecution: null,
            sourceVersion: '1.0.0',
            sourceContentHash: null,
          },
        },
      });

      await expect(
        service.resolveUsageSourceContext(clonedPlugin),
      ).resolves.toEqual({
        sourceTenantId: TENANT_ID,
        sourceOrgId: ORG_ID,
        sourcePluginDbId: PLUGIN_ID,
        sourcePluginId: 'com.example.review',
        sourceListingId: 'listing-4',
        pricingModel: 'free',
        billingAmount: null,
        currency: 'USD',
      });
      expect(db.select).not.toHaveBeenCalled();
    });
  });
});
