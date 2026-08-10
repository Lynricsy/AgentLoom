import 'reflect-metadata';

import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { DrizzleDB } from '../../database/database.module';
import type {
  MarketplaceListing,
  MarketplaceReviewResult,
  PluginRecord,
} from '../../database/schema';
import {
  MarketplaceListingConflictException,
  MarketplaceListingNotFoundException,
} from '../marketplace/marketplace.exceptions';
import {
  PluginInactiveException,
  PluginNotFoundException,
  PluginPermissionDeniedException,
} from './plugin.exceptions';
import { PluginMarketplaceController } from './plugin-marketplace.controller';
import type { PluginMarketplaceReviewService } from './plugin-marketplace-review.service';
import {
  QueryPluginEarningsHistorySchema,
  QueryPluginEarningsRankingSchema,
  QueryPluginEarningsSummarySchema,
  QueryPluginEarningsTrendSchema,
} from './dto/plugin-earnings.dto';
import {
  QueryPluginListingsSchema,
  SubmitPluginListingSchema,
  UpdatePluginListingSchema,
} from './dto/plugin-marketplace.dto';
import type { PluginEarningsService } from './plugin-earnings.service';
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
    resolveOrganizationId: vi.fn(),
  });

  const createMockPluginMarketplaceReviewService = () => ({
    review: vi.fn(),
  });

  const createMockPluginEarningsService = () => ({
    getDashboardSummary: vi.fn(),
    getDashboardTrends: vi.fn(),
    getDashboardRanking: vi.fn(),
    getDashboardHistory: vi.fn(),
  });

  return {
    createMockDb,
    createMockPluginService,
    createMockPluginMarketplaceReviewService,
    createMockPluginEarningsService,
  };
});

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PLUGIN_ID = '33333333-3333-4333-8333-333333333333';
const PLUGIN_ID_2 = '44444444-4444-4444-8444-444444444444';
const LISTING_ID = '55555555-5555-4555-8555-555555555555';
const LISTING_ID_2 = '66666666-6666-4666-8666-666666666666';
const ORG_ID = '77777777-7777-4777-8777-777777777777';

function getRoles(
  controller: object,
  methodName: string,
): string[] | undefined {
  const handler = Reflect.get(controller, methodName);

  return typeof handler === 'function'
    ? (Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined)
    : undefined;
}

function getHttpCode(
  controller: object,
  methodName: string,
): number | undefined {
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

function createListing(
  overrides: Partial<MarketplaceListing> = {},
): MarketplaceListing {
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

function createReviewResult(
  overrides: Partial<MarketplaceReviewResult> = {},
): MarketplaceReviewResult {
  return {
    outcome: 'passed',
    checks: [],
    reviewedAt: new Date('2025-01-02T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('PluginMarketplaceController', () => {
  let controller: PluginMarketplaceController;
  let db: ReturnType<typeof mocks.createMockDb>;
  let pluginService: ReturnType<typeof mocks.createMockPluginService>;
  let pluginMarketplaceReviewService: ReturnType<
    typeof mocks.createMockPluginMarketplaceReviewService
  >;
  let pluginEarningsService: ReturnType<
    typeof mocks.createMockPluginEarningsService
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    db = mocks.createMockDb();
    pluginService = mocks.createMockPluginService();
    pluginMarketplaceReviewService =
      mocks.createMockPluginMarketplaceReviewService();
    pluginEarningsService = mocks.createMockPluginEarningsService();
    pluginService.resolveOrganizationId.mockResolvedValue(ORG_ID);
    controller = new PluginMarketplaceController(
      db as unknown as DrizzleDB,
      pluginService as unknown as PluginService,
      pluginEarningsService as unknown as PluginEarningsService,
      pluginMarketplaceReviewService as unknown as PluginMarketplaceReviewService,
    );
  });

  describe('submit', () => {
    it('应声明 owner/admin/creator 角色与 201 状态码，并在审查通过后上架插件 listing', async () => {
      const plugin = createPlugin({ status: 'active' });
      const createdListing = createListing();
      const reviewResult = createReviewResult();
      const updatedListing = createListing({
        status: 'listed',
        reviewResult,
        publishedAt: new Date('2025-01-02T00:00:00.000Z'),
      });

      pluginService.findById.mockResolvedValue(plugin);
      pluginMarketplaceReviewService.review.mockReturnValue(reviewResult);
      db.__selectResults.push([]);
      db.__insertResults.push([createdListing]);
      db.__updateResults.push([updatedListing]);

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

      expect(getRoles(controller, 'submit')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(getHttpCode(controller, 'submit')).toBe(HttpStatus.CREATED);
      expect(pluginService.findById).toHaveBeenCalledWith(PLUGIN_ID, TENANT_ID);
      expect(pluginMarketplaceReviewService.review).toHaveBeenCalledWith({
        title: '插件上架标题',
        summary: '这是一个用于测试的插件市场上架摘要',
        tags: ['analysis', 'automation'],
        plugin,
      });
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
      expect(db.__updateValues).toHaveLength(1);
      expect(db.__updateValues[0]).toMatchObject({
        status: 'listed',
        reviewResult,
      });
      expect(result).toEqual({ data: updatedListing, reviewResult });
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
      pluginService.findById.mockRejectedValue(
        new PluginNotFoundException(PLUGIN_ID),
      );

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

    it('插件未激活时应抛出异常', async () => {
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'registered' }),
      );

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
      ).rejects.toBeInstanceOf(PluginInactiveException);
    });

    it('当前用户不是 installedBy 时应拒绝提交', async () => {
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active', installedBy: PLUGIN_ID_2 }),
      );

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
      ).rejects.toBeInstanceOf(PluginPermissionDeniedException);
    });

    it('已上架 listing 再次提交时应抛出冲突异常', async () => {
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );
      db.__selectResults.push([
        createListing({
          status: 'listed',
          publishedAt: new Date('2025-01-02T00:00:00.000Z'),
        }),
      ]);

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
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
    });

    it('已有 review_failed listing 时应按新数据重新提交并返回审查结果', async () => {
      const plugin = createPlugin({ status: 'active' });
      const existingListing = createListing({ status: 'review_failed' });
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const updatedListing = createListing({
        status: 'review_failed',
        title: '重新提交后的插件标题',
        pricingModel: 'per_execution',
        pricePerExecution: '0.12500000',
        reviewResult,
      });

      pluginService.findById.mockResolvedValue(plugin);
      pluginMarketplaceReviewService.review.mockReturnValue(reviewResult);
      db.__selectResults.push([existingListing]);
      db.__updateResults.push([], [updatedListing]);

      const result = await controller.submit(
        SubmitPluginListingSchema.parse({
          pluginDbId: PLUGIN_ID,
          title: '重新提交后的插件标题',
          summary: '这是一个用于重新提交插件市场上架的测试摘要',
          pricingModel: 'per_execution',
          pricePerExecution: '0.12500000',
          tags: ['retry'],
        }),
        TENANT_ID,
        USER_ID,
      );

      expect(db.__updateValues[0]).toMatchObject({
        status: 'pending_review',
        title: '重新提交后的插件标题',
        pricingModel: 'per_execution',
        pricePerExecution: '0.12500000',
      });
      expect(db.__updateValues[1]).toMatchObject({
        status: 'review_failed',
        reviewResult,
      });
      expect(result).toEqual({ data: updatedListing, reviewResult });
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

      await expect(
        controller.findById(LISTING_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });
  });

  describe('earnings dashboard', () => {
    it('应��回收益总览', async () => {
      const summary = {
        totalRevenue: '100.00000000',
        totalDeveloperShare: '59.50000000',
        totalPlatformShare: '30.00000000',
        totalListingCommission: '10.50000000',
        pendingPayout: '20.00000000',
        completedPayout: '39.50000000',
        totalExecutions: 12,
        pluginCount: 3,
      };
      const currentMonthSummary = {
        ...summary,
        totalRevenue: '12.50000000',
      };
      pluginService.resolveOrganizationId.mockResolvedValue(ORG_ID);
      pluginEarningsService.getDashboardSummary
        .mockResolvedValueOnce(summary)
        .mockResolvedValueOnce(currentMonthSummary);

      const result = await controller.getEarningsSummary(
        QueryPluginEarningsSummarySchema.parse({
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
        TENANT_ID,
      );

      expect(getRoles(controller, 'getEarningsSummary')).toEqual([
        'owner',
        'admin',
      ]);
      expect(pluginService.resolveOrganizationId).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(pluginEarningsService.getDashboardSummary).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          orgId: ORG_ID,
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
      );
      expect(pluginEarningsService.getDashboardSummary).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ orgId: ORG_ID }),
      );
      expect(result).toEqual({
        totalRevenue: '100.00000000',
        currentMonthRevenue: '12.50000000',
        totalExecutions: 12,
        activePlugins: 3,
      });
    });

    it('应返回收益趋势', async () => {
      const trends = [
        {
          bucket: '2025-01-01 00:00:00+00',
          totalRevenue: '10.00000000',
          developerShare: '5.95000000',
          platformShare: '3.00000000',
          listingCommission: '1.05000000',
          totalExecutions: 2,
        },
      ];
      pluginService.resolveOrganizationId.mockResolvedValue(ORG_ID);
      pluginEarningsService.getDashboardTrends.mockResolvedValue(trends);

      const result = await controller.getEarningsTrends(
        QueryPluginEarningsTrendSchema.parse({
          interval: 'day',
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
        TENANT_ID,
      );

      expect(getRoles(controller, 'getEarningsTrends')).toEqual([
        'owner',
        'admin',
      ]);
      expect(result).toEqual([
        {
          month: '2025-01',
          revenue: '10.00000000',
          executions: 2,
        },
      ]);
    });

    it('应返回收益排行', async () => {
      const ranking = [
        {
          pluginDbId: PLUGIN_ID,
          pluginId: 'com.example.plugin',
          pluginName: '示例插件',
          totalRevenue: '10.00000000',
          developerShare: '5.95000000',
          platformShare: '3.00000000',
          listingCommission: '1.05000000',
          totalExecutions: 2,
        },
      ];
      pluginService.resolveOrganizationId.mockResolvedValue(ORG_ID);
      pluginEarningsService.getDashboardRanking.mockResolvedValue(ranking);

      const result = await controller.getEarningsRanking(
        QueryPluginEarningsRankingSchema.parse({
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
          limit: 5,
        }),
        TENANT_ID,
      );

      expect(getRoles(controller, 'getEarningsRanking')).toEqual([
        'owner',
        'admin',
      ]);
      expect(result).toEqual([
        {
          pluginId: 'com.example.plugin',
          pluginName: '示例插件',
          executionCount: 2,
          revenue: '10.00000000',
          percentage: 100,
        },
      ]);
    });

    it('应返回收益结算历史', async () => {
      const history = {
        data: [
          {
            id: 'earning-1',
            pluginId: 'com.example.plugin',
            pluginName: '示例插件',
            periodStart: new Date('2025-01-01T00:00:00.000Z'),
            periodEnd: new Date('2025-01-31T23:59:59.999Z'),
            totalExecutions: 2,
            totalRevenue: '10.00000000',
            developerShare: '5.95000000',
            platformShare: '3.00000000',
            listingCommission: '1.05000000',
            payoutStatus: 'pending',
            createdAt: new Date('2025-02-01T00:00:00.000Z'),
          },
        ],
        meta: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      };
      pluginService.resolveOrganizationId.mockResolvedValue(ORG_ID);
      pluginEarningsService.getDashboardHistory.mockResolvedValue(history);

      const result = await controller.getEarningsHistory(
        QueryPluginEarningsHistorySchema.parse({
          periodStart: '2025-01-01T00:00:00.000Z',
          periodEnd: '2025-01-31T23:59:59.999Z',
        }),
        TENANT_ID,
      );

      expect(getRoles(controller, 'getEarningsHistory')).toEqual([
        'owner',
        'admin',
      ]);
      expect(result).toEqual({
        data: [
          {
            id: 'earning-1',
            periodStart: new Date('2025-01-01T00:00:00.000Z'),
            periodEnd: new Date('2025-01-31T23:59:59.999Z'),
            pluginId: 'com.example.plugin',
            pluginName: '示例插件',
            totalExecutions: 2,
            totalRevenue: '10.00000000',
            developerShare: '5.95000000',
            platformShare: '3.00000000',
            listingCommission: '1.05000000',
            payoutStatus: 'pending',
            createdAt: new Date('2025-02-01T00:00:00.000Z'),
          },
        ],
        meta: history.meta,
      });
    });
  });

  describe('update', () => {
    it('应更新 listing 并在切换为免费模式时清空价格', async () => {
      const currentPlugin = createPlugin({ status: 'active' });
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
      pluginService.findById
        .mockResolvedValueOnce(currentPlugin)
        .mockResolvedValueOnce(
          createPlugin({
            id: PLUGIN_ID_2,
            status: 'active',
            installedBy: USER_ID,
          }),
        );

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

      expect(getRoles(controller, 'update')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(getHttpCode(controller, 'update')).toBe(HttpStatus.OK);
      expect(pluginService.findById).toHaveBeenNthCalledWith(
        1,
        PLUGIN_ID,
        TENANT_ID,
      );
      expect(pluginService.findById).toHaveBeenNthCalledWith(
        2,
        PLUGIN_ID_2,
        TENANT_ID,
      );
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

  describe('unlist', () => {
    it('应下架 listed 状态的插件 listing', async () => {
      const currentListing = createListing({
        status: 'listed',
        publishedAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      const updatedListing = createListing({
        status: 'unlisted',
        publishedAt: currentListing.publishedAt,
        unlistedAt: new Date('2025-01-03T00:00:00.000Z'),
      });

      db.__selectResults.push([currentListing]);
      db.__updateResults.push([updatedListing]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      const result = await controller.unlist(LISTING_ID, TENANT_ID, USER_ID);

      expect(getRoles(controller, 'unlist')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(result).toEqual({ data: updatedListing });
      expect(db.__updateValues[0]).toMatchObject({
        status: 'unlisted',
      });
    });
  });

  describe('relist', () => {
    it('应重新审查 unlisted 状态的插件 listing', async () => {
      const currentListing = createListing({
        status: 'unlisted',
        unlistedAt: new Date('2025-01-03T00:00:00.000Z'),
      });
      const reviewResult = createReviewResult();
      const updatedListing = createListing({
        status: 'listed',
        reviewResult,
        publishedAt: new Date('2025-01-04T00:00:00.000Z'),
      });

      db.__selectResults.push([currentListing]);
      db.__updateResults.push([], [updatedListing]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );
      pluginMarketplaceReviewService.review.mockReturnValue(reviewResult);

      const result = await controller.relist(LISTING_ID, TENANT_ID, USER_ID);

      expect(getRoles(controller, 'relist')).toEqual([
        'owner',
        'admin',
        'creator',
      ]);
      expect(db.__updateValues[0]).toMatchObject({
        status: 'pending_review',
        submittedBy: USER_ID,
      });
      expect(db.__updateValues[1]).toMatchObject({
        status: 'listed',
        reviewResult,
      });
      expect(result).toEqual({ data: updatedListing, reviewResult });
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
      expect(
        QueryPluginListingsSchema.parse({ page: '2', pageSize: '5' }),
      ).toEqual({
        page: 2,
        pageSize: 5,
      });
      expect(QueryPluginListingsSchema.parse({})).toEqual({
        page: 1,
        pageSize: 20,
      });
    });
  });
  describe('marketplace 状态与权限补充分支', () => {
    it('pending_review listing 禁止重复提交且不再次审查', async () => {
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );
      db.__selectResults.push([createListing({ status: 'pending_review' })]);

      await expect(
        controller.submit(
          SubmitPluginListingSchema.parse({
            pluginDbId: PLUGIN_ID,
            title: '重复提交插件',
            summary: '这是用于验证审查中 listing 禁止重复提交的摘要内容。',
            pricingModel: 'free',
          }),
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(pluginMarketplaceReviewService.review).not.toHaveBeenCalled();
    });

    it('首次提交收费 listing 审查失败时保留价格并转为 review_failed', async () => {
      const plugin = createPlugin({ status: 'active' });
      const created = createListing({
        pricingModel: 'per_execution',
        pricePerExecution: '0.50000000',
      });
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const failed = createListing({
        status: 'review_failed',
        pricingModel: 'per_execution',
        pricePerExecution: '0.50000000',
        reviewResult,
      });
      pluginService.findById.mockResolvedValue(plugin);
      db.__selectResults.push([]);
      db.__insertResults.push([created]);
      db.__updateResults.push([failed]);
      pluginMarketplaceReviewService.review.mockReturnValue(reviewResult);

      const result = await controller.submit(
        SubmitPluginListingSchema.parse({
          pluginDbId: PLUGIN_ID,
          title: '收费插件',
          summary: '这是用于验证收费 listing 审查失败状态转换的摘要内容。',
          pricingModel: 'per_execution',
          pricePerExecution: '0.50000000',
        }),
        TENANT_ID,
        USER_ID,
      );

      expect(db.__insertValues[0]).toMatchObject({
        tags: [],
        pricingModel: 'per_execution',
        pricePerExecution: '0.50000000',
      });
      expect(db.__updateValues[0]).toMatchObject({
        status: 'review_failed',
        publishedAt: null,
      });
      expect(result).toEqual({ data: failed, reviewResult });
    });

    it('无筛选 listing 查询返回空分页且 totalPages 为零', async () => {
      db.__selectResults.push([], []);

      const result = await controller.findAll(
        QueryPluginListingsSchema.parse({}),
        TENANT_ID,
      );

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
    });

    it('收益短 bucket 原样返回，零执行量排行百分比为零并回退插件名', async () => {
      pluginEarningsService.getDashboardTrends.mockResolvedValue([
        {
          bucket: '2025',
          totalRevenue: '0',
          developerShare: '0',
          platformShare: '0',
          listingCommission: '0',
          totalExecutions: 0,
        },
      ]);
      pluginEarningsService.getDashboardRanking.mockResolvedValue([
        {
          pluginDbId: PLUGIN_ID,
          pluginId: 'com.example.fallback',
          pluginName: null,
          totalRevenue: '0',
          developerShare: '0',
          platformShare: '0',
          listingCommission: '0',
          totalExecutions: 0,
        },
      ]);

      const trends = await controller.getEarningsTrends(
        QueryPluginEarningsTrendSchema.parse({ interval: 'month' }),
        TENANT_ID,
      );
      const ranking = await controller.getEarningsRanking(
        QueryPluginEarningsRankingSchema.parse({}),
        TENANT_ID,
      );

      expect(trends[0]).toMatchObject({ month: '2025', executions: 0 });
      expect(ranking[0]).toMatchObject({
        pluginName: 'com.example.fallback',
        percentage: 0,
      });
    });

    it('空更新直接返回当前 listing 且不写数据库', async () => {
      const listing = createListing();
      db.__selectResults.push([listing]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      const result = await controller.update(
        LISTING_ID,
        UpdatePluginListingSchema.parse({}),
        TENANT_ID,
        USER_ID,
      );

      expect(result).toEqual({ data: listing });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('更新全部可编辑字段且按次价格未显式传入时沿用原价格', async () => {
      const listing = createListing({
        pricingModel: 'per_execution',
        pricePerExecution: '0.25000000',
      });
      const updated = createListing({
        title: '全部字段更新',
        summary: '这是更新后的完整 listing 摘要内容',
        category: 'automation',
        pricingModel: 'per_execution',
        pricePerExecution: '0.25000000',
      });
      db.__selectResults.push([listing]);
      db.__updateResults.push([updated]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      const result = await controller.update(
        LISTING_ID,
        UpdatePluginListingSchema.parse({
          title: '全部字段更新',
          summary: '这是更新后的完整 listing 摘要内容',
          category: 'automation',
          tags: ['updated'],
          pricingModel: 'per_execution',
          pricePerExecution: '0.25000000',
        }),
        TENANT_ID,
        USER_ID,
      );

      expect(db.__updateValues[0]).toMatchObject({
        title: '全部字段更新',
        summary: '这是更新后的完整 listing 摘要内容',
        category: 'automation',
        tags: ['updated'],
        pricingModel: 'per_execution',
        pricePerExecution: '0.25000000',
      });
      expect(result).toEqual({ data: updated });
    });

    it('更新 returning 为空时报告 listing 不存在', async () => {
      db.__selectResults.push([createListing()]);
      db.__updateResults.push([]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      await expect(
        controller.update(
          LISTING_ID,
          UpdatePluginListingSchema.parse({ title: '更新但记录已删除' }),
          TENANT_ID,
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });

    it('listing 未绑定 pluginDbId 时拒绝更新、下架与重新上架', async () => {
      for (const action of ['update', 'unlist', 'relist'] as const) {
        db.__selectResults.push([
          createListing({ pluginDbId: null, status: 'listed' }),
        ]);

        const operation =
          action === 'update'
            ? controller.update(
                LISTING_ID,
                UpdatePluginListingSchema.parse({ title: '无绑定更新' }),
                TENANT_ID,
                USER_ID,
              )
            : action === 'unlist'
              ? controller.unlist(LISTING_ID, TENANT_ID, USER_ID)
              : controller.relist(LISTING_ID, TENANT_ID, USER_ID);

        await expect(operation).rejects.toBeInstanceOf(
          MarketplaceListingConflictException,
        );
      }
      expect(pluginService.findById).not.toHaveBeenCalled();
    });

    it('非 listed 状态禁止下架', async () => {
      db.__selectResults.push([createListing({ status: 'review_failed' })]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      await expect(
        controller.unlist(LISTING_ID, TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('下架 returning 为空时报告 listing 不存在', async () => {
      db.__selectResults.push([createListing({ status: 'listed' })]);
      db.__updateResults.push([]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );

      await expect(
        controller.unlist(LISTING_ID, TENANT_ID, USER_ID),
      ).rejects.toBeInstanceOf(MarketplaceListingNotFoundException);
    });

    it('listed 与 pending_review 状态均禁止 relist', async () => {
      for (const status of ['listed', 'pending_review'] as const) {
        db.__selectResults.push([createListing({ status })]);
        pluginService.findById.mockResolvedValueOnce(
          createPlugin({ status: 'active' }),
        );

        await expect(
          controller.relist(LISTING_ID, TENANT_ID, USER_ID),
        ).rejects.toBeInstanceOf(MarketplaceListingConflictException);
      }
      expect(pluginMarketplaceReviewService.review).not.toHaveBeenCalled();
    });

    it('review_failed listing 可 relist，复审失败时保留 unlistedAt', async () => {
      const unlistedAt = new Date('2025-01-03T00:00:00.000Z');
      const listing = createListing({ status: 'review_failed', unlistedAt });
      const reviewResult = createReviewResult({ outcome: 'failed' });
      const updated = createListing({
        status: 'review_failed',
        unlistedAt,
        reviewResult,
      });
      db.__selectResults.push([listing]);
      db.__updateResults.push([], [updated]);
      pluginService.findById.mockResolvedValue(
        createPlugin({ status: 'active' }),
      );
      pluginMarketplaceReviewService.review.mockReturnValue(reviewResult);

      const result = await controller.relist(LISTING_ID, TENANT_ID, USER_ID);

      expect(db.__updateValues[1]).toMatchObject({
        status: 'review_failed',
        publishedAt: null,
        unlistedAt,
      });
      expect(result).toEqual({ data: updated, reviewResult });
    });

    it('管理过程中插件失活或安装者不匹配均拒绝写入', async () => {
      for (const plugin of [
        createPlugin({ status: 'disabled' }),
        createPlugin({ status: 'active', installedBy: PLUGIN_ID_2 }),
      ]) {
        db.__selectResults.push([createListing({ status: 'listed' })]);
        pluginService.findById.mockResolvedValueOnce(plugin);

        await expect(
          controller.unlist(LISTING_ID, TENANT_ID, USER_ID),
        ).rejects.toBeInstanceOf(
          plugin.status === 'active'
            ? PluginPermissionDeniedException
            : PluginInactiveException,
        );
      }
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
