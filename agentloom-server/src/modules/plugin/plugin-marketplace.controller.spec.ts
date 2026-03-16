import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { DrizzleDB } from '../../database/database.module';
import type { MarketplaceListing, PluginRecord } from '../../database/schema';
import { MarketplaceListingNotFoundException } from '../marketplace/marketplace.exceptions';
import { PluginNotFoundException } from './plugin.exceptions';
import { PluginMarketplaceController } from './plugin-marketplace.controller';
import {
  QueryPluginListingsSchema,
  SubmitPluginListingSchema,
  UpdatePluginListingSchema,
} from './dto/plugin-marketplace.dto';
import type { PluginService } from './plugin.service';

const mocks = vi.hoisted(() => {
  const createMockDb = () => {
    const selectResults: unknown[] = [];
    const insertResults: unknown[] = [];
    const updateResults: unknown[] = [];
    const insertValues: unknown[] = [];
    const updateValues: unknown[] = [];
    const selectFields: unknown[] = [];

    return {
      __selectResults: selectResults,
      __insertResults: insertResults,
      __updateResults: updateResults,
      __insertValues: insertValues,
      __updateValues: updateValues,
      __selectFields: selectFields,
      select: vi.fn((fields?: unknown) => {
        selectFields.push(fields);

        const buildQueryChain = () => {
          const limitWithOffset = vi.fn(() => ({
            offset: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
          }));

          return {
            orderBy: vi.fn(() => ({
              limit: limitWithOffset,
            })),
            limit: vi.fn(() => Promise.resolve(selectResults.shift() ?? [])),
          };
        };

        return {
          from: vi.fn(() => ({
            where: vi.fn(() =>
              fields === undefined
                ? buildQueryChain()
                : Promise.resolve(selectResults.shift() ?? []),
            ),
          })),
        };
      }),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => {
          insertValues.push(values);
          return {
            returning: vi.fn().mockResolvedValue(insertResults.shift() ?? []),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: unknown) => {
          updateValues.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue(updateResults.shift() ?? []),
            })),
          };
        }),
      })),
    };
  };

  const createMockPluginService = () => ({
    findById: vi.fn(),
  });

  return { createMockDb, createMockPluginService };
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PLUGIN_ID = '33333333-3333-4333-8333-333333333333';
const PLUGIN_ID_2 = '44444444-4444-4444-8444-444444444444';
const LISTING_ID = '55555555-5555-4555-8555-555555555555';
const LISTING_ID_2 = '66666666-6666-4666-8666-666666666666';
const ORG_ID = '77777777-7777-4777-8777-777777777777';

function getRoles(controller: object, methodName: string): string[] | undefined {
  const handler = Reflect.get(controller, methodName);

  return typeof handler === 'function'
    ? (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined)
    : undefined;
}

function getHttpCode(controller: object, methodName: string): number | undefined {
  const handler = Reflect.get(controller, methodName);

  return typeof handler === 'function'
    ? (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined)
    : undefined;
}

function createPlugin(overrides: Partial<PluginRecord> = {}): PluginRecord {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: PLUGIN_ID,
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    pluginId: 'com.example.plugin',
    name: '示例插件',
    version: '1.0.0',
    author: '狐娘',
    description: '一个示例插件',
    license: 'MIT',
    status: 'registered',
    manifest: { id: 'com.example.plugin', version: '1.0.0' },
    nodeDefinitions: [{ type: 'plugin-node' }],
    storageKey: null,
    signature: null,
    contentHash: null,
    wasmBundleUrl: null,
    permissions: [],
    installedBy: USER_ID,
    metadata: null,
    occVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  const now = new Date('2025-01-01T00:00:00.000Z');

  return {
    id: LISTING_ID,
    workflowVersionId: null,
    pluginDbId: PLUGIN_ID,
    listingType: 'plugin',
    pricingModel: 'free',
    pricePerExecution: null,
    tenantId: TENANT_ID,
    title: '插件上架标题',
    summary: '这是一个用于测试的插件市场上架摘要',
    tags: ['analysis', 'automation'],
    coverImageUrl: null,
    category: 'analysis',
    status: 'pending_review',
    useCount: 0,
    avgRating: null,
    reviewCount: 0,
    reviewResult: null,
    submittedBy: USER_ID,
    submittedAt: now,
    publishedAt: null,
    unlistedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PluginMarketplaceController', () => {
  let controller: PluginMarketplaceController;
  let db: ReturnType<typeof mocks.createMockDb>;
  let pluginService: ReturnType<typeof mocks.createMockPluginService>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = mocks.createMockDb();
    pluginService = mocks.createMockPluginService();
    controller = new PluginMarketplaceController(
      db as unknown as DrizzleDB,
      pluginService as unknown as PluginService,
    );
  });

  describe('submit', () => {
    it('应声明 owner/admin 角色与 201 状态码，并创建插件 listing', async () => {
      const plugin = createPlugin();
      const createdListing = createListing();
      pluginService.findById.mockResolvedValue(plugin);
      db.__insertResults.push([createdListing]);

      const result = await controller.submit(
        SubmitPluginListingSchema.parse({
          pluginDbId: PLUGIN_ID,
          title: '插件上架标题',
          summary: '这是一个用于测试的插件市场上架摘要',
          description: '更详细的插件描述',
          category: 'analysis',
          tags: ['analysis', 'automation'],
          pricingModel: 'free',
        }),
        TENANT_ID,
        USER_ID,
      );

      expect(getRoles(controller, 'submit')).toEqual(['owner', 'admin']);
      expect(getHttpCode(controller, 'submit')).toBe(HttpStatus.CREATED);
      expect(pluginService.findById).toHaveBeenCalledWith(PLUGIN_ID, TENANT_ID);
      expect(db.__insertValues).toHaveLength(1);
      expect(db.__insertValues[0]).toMatchObject({
        tenantId: TENANT_ID,
        pluginDbId: PLUGIN_ID,
        listingType: 'plugin',
        title: '插件上架标题',
        summary: '这是一个用于测试的插件市场上架摘要',
        category: 'analysis',
        tags: ['analysis', 'automation'],
        pricingModel: 'free',
        pricePerExecution: null,
        status: 'pending_review',
        submittedBy: USER_ID,
      });
      expect(result).toEqual({ data: createdListing });
    });

    it('应在按次计费缺少价格时失败', async () => {
      await expect(
        controller.submit(
          {
            pluginDbId: PLUGIN_ID,
            title: '收费插件',
            summary: '这是一个按次计费插件的测试摘要',
            pricingModel: 'per_execution',
          },
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toThrow();
    });

    it('应在插件不存在时抛出异常', async () => {
      pluginService.findById.mockRejectedValue(new PluginNotFoundException(PLUGIN_ID));

      await expect(
        controller.submit(
          SubmitPluginListingSchema.parse({
            pluginDbId: PLUGIN_ID,
            title: '插件上架标题',
            summary: '这是一个用于测试的插件市场上架摘要',
            pricingModel: 'free',
          }),
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(PluginNotFoundException);
    });
  });

  describe('findAll', () => {
    it('应分页返回插件 listings 与 meta 信息', async () => {
      const firstListing = createListing();
      const secondListing = createListing({
        id: LISTING_ID_2,
        pluginDbId: PLUGIN_ID_2,
        pricingModel: 'per_execution',
        pricePerExecution: '0.25000000',
      });

      db.__selectResults.push([firstListing, secondListing]);
      db.__selectResults.push([{ count: 3 }]);

      const result = await controller.findAll(
        QueryPluginListingsSchema.parse({
          status: 'pending_review',
          pricingModel: 'free',
          page: '2',
          pageSize: '2',
        }),
        TENANT_ID,
      );

      expect(getRoles(controller, 'findAll')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(result).toEqual({
        data: [firstListing, secondListing],
        meta: {
          page: 2,
          pageSize: 2,
          total: 3,
          totalPages: 2,
        },
      });
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('findById', () => {
    it('应返回单个插件 listing', async () => {
      const listing = createListing();
      db.__selectResults.push([listing]);

      const result = await controller.findById(LISTING_ID, TENANT_ID);

      expect(getRoles(controller, 'findById')).toEqual([
        'owner',
        'admin',
        'creator',
        'operator',
        'viewer',
      ]);
      expect(result).toEqual({ data: listing });
    });

    it('应在 listing 不存在时抛出异常', async () => {
      db.__selectResults.push([]);

      await expect(controller.findById(LISTING_ID, TENANT_ID)).rejects.toBeInstanceOf(
        MarketplaceListingNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('应更新 listing 并在切换为免费模式时清空价格', async () => {
      const currentListing = createListing({
        pricingModel: 'per_execution',
        pricePerExecution: '1.50000000',
      });
      const updatedListing = createListing({
        title: '更新后的插件标题',
        pluginDbId: PLUGIN_ID_2,
        pricingModel: 'free',
        pricePerExecution: null,
      });

      db.__selectResults.push([currentListing]);
      db.__updateResults.push([updatedListing]);
      pluginService.findById.mockResolvedValue(createPlugin({ id: PLUGIN_ID_2 }));

      const result = await controller.update(
        LISTING_ID,
        UpdatePluginListingSchema.parse({
          pluginDbId: PLUGIN_ID_2,
          title: '更新后的插件标题',
          pricingModel: 'free',
          occVersion: 3,
        }),
        TENANT_ID,
        USER_ID,
      );

      expect(getRoles(controller, 'update')).toEqual(['owner', 'admin']);
      expect(getHttpCode(controller, 'update')).toBe(HttpStatus.OK);
      expect(pluginService.findById).toHaveBeenCalledWith(PLUGIN_ID_2, TENANT_ID);
      expect(db.__updateValues).toHaveLength(1);
      expect(db.__updateValues[0]).toMatchObject({
        pluginDbId: PLUGIN_ID_2,
        title: '更新后的插件标题',
        pricingModel: 'free',
        pricePerExecution: null,
      });
      expect(result).toEqual({ data: updatedListing });
    });

    it('应在 listing 不存在时抛出异常', async () => {
      db.__selectResults.push([]);

      await expect(
        controller.update(
          LISTING_ID,
          UpdatePluginListingSchema.parse({ title: '更新后的插件标题' }),
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });
  });

  describe('DTO 校验', () => {
    it('应校验提交 DTO 的收费价格字段', () => {
      expect(() =>
        SubmitPluginListingSchema.parse({
          pluginDbId: PLUGIN_ID,
          title: '收费插件',
          summary: '这是一个按次计费插件的测试摘要',
          pricingModel: 'per_execution',
        }),
      ).toThrow();

      expect(
        SubmitPluginListingSchema.parse({
          pluginDbId: PLUGIN_ID,
          title: '收费插件',
          summary: '这是一个按次计费插件的测试摘要',
          pricingModel: 'per_execution',
          pricePerExecution: '0.12500000',
        }),
      ).toMatchObject({
        pricingModel: 'per_execution',
        pricePerExecution: '0.12500000',
      });
    });

    it('应校验更新 DTO 的收费价格字段', () => {
      expect(() =>
        UpdatePluginListingSchema.parse({
          pricingModel: 'per_execution',
        }),
      ).toThrow();
    });

    it('应对查询 DTO 进行类型转换并补齐默认值', () => {
      expect(QueryPluginListingsSchema.parse({ page: '2', pageSize: '5' })).toEqual({
        page: 2,
        pageSize: 5,
      });
      expect(QueryPluginListingsSchema.parse({})).toEqual({
        page: 1,
        pageSize: 20,
      });
    });
  });
});
