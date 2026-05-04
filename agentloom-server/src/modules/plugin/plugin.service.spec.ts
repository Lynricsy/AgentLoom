import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../database/database.module';
import type { PluginRecord } from '../../database/schema';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [PluginService, { provide: DRIZZLE, useValue: db }],
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
    it('应当删除插件', async () => {
      const deletePlugin = createDeleteChain([{ id: PLUGIN_ID }]);
      db.delete.mockReturnValue(deletePlugin);

      await expect(
        service.remove(PLUGIN_ID, TENANT_ID),
      ).resolves.toBeUndefined();
    });

    it('删除不存在插件时应抛出 404', async () => {
      const deletePlugin = createDeleteChain([]);
      db.delete.mockReturnValue(deletePlugin);

      await expect(service.remove(PLUGIN_ID, TENANT_ID)).rejects.toBeInstanceOf(
        PluginNotFoundException,
      );
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

    it('marketplace clone 的已上架收费插件应返回按次计费金额', async () => {
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

    it('marketplace clone 的源 listing 未上架时应回退为免费且 billingAmount 为 null', async () => {
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
  });
});
