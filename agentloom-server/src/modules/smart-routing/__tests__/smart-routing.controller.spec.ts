import 'reflect-metadata';

import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { ProviderHealthStatusesResponseDtoType } from '../dto/provider-health.dto';
import type { QueryRoutingDecisionsDto } from '../dto/query-routing-decisions.dto';
import type {
  SmartRoutingStrategiesResponseDtoType,
  SmartRoutingStrategyConfigSchemaResponseDtoType,
} from '../dto/smart-routing-strategies.dto';
import { SmartRoutingController } from '../smart-routing.controller';
import { SmartRoutingService } from '../smart-routing.service';

const { createMockSmartRoutingService } = vi.hoisted(() => ({
  createMockSmartRoutingService: () => ({
    listStrategies: vi.fn(),
    getProviderHealthStatuses: vi.fn(),
    getStrategyConfigSchema: vi.fn(),
    findByExecution: vi.fn(),
  }),
}));

describe('SmartRoutingController', () => {
  let controller: SmartRoutingController;
  let mockService: ReturnType<typeof createMockSmartRoutingService>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    mockService = createMockSmartRoutingService();
    controller = new SmartRoutingController(
      mockService as unknown as SmartRoutingService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应为 findRoutingDecisions 声明 Viewer+ RBAC', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'findRoutingDecisions',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, descriptor?.value)).toEqual([
      'owner',
      'admin',
      'creator',
      'operator',
      'viewer',
    ]);
  });

  it('应为 findRoutingDecisions 声明 200 HTTP 状态码', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'findRoutingDecisions',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, descriptor?.value)).toBe(
      200,
    );
  });

  it('应为 getStrategies 声明 Viewer+ RBAC', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getStrategies',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, descriptor?.value)).toEqual([
      'owner',
      'admin',
      'creator',
      'operator',
      'viewer',
    ]);
  });

  it('应为 getProviderHealth 声明 Viewer+ RBAC', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getProviderHealth',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, descriptor?.value)).toEqual([
      'owner',
      'admin',
      'creator',
      'operator',
      'viewer',
    ]);
  });

  it('应为 getStrategyConfigSchema 声明 Viewer+ RBAC', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getStrategyConfigSchema',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(ROLES_KEY, descriptor?.value)).toEqual([
      'owner',
      'admin',
      'creator',
      'operator',
      'viewer',
    ]);
  });

  it('应为 getStrategies 声明 200 HTTP 状态码', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getStrategies',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, descriptor?.value)).toBe(
      200,
    );
  });

  it('应为 getProviderHealth 声明 200 HTTP 状态码', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getProviderHealth',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, descriptor?.value)).toBe(
      200,
    );
  });

  it('应为 getStrategyConfigSchema 声明 200 HTTP 状态码', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      SmartRoutingController.prototype,
      'getStrategyConfigSchema',
    );

    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, descriptor?.value)).toBe(
      200,
    );
  });

  it('应委托 service.listStrategies 返回策略列表', () => {
    const response: SmartRoutingStrategiesResponseDtoType = {
      data: [
        {
          name: 'random',
          category: 'simple',
          requiresEmbedding: false,
          configSchema: { type: 'object', properties: {} },
        },
      ],
    };
    mockService.listStrategies.mockReturnValue(response);

    expect(controller.getStrategies()).toEqual(response);
    expect(mockService.listStrategies).toHaveBeenCalledWith();
  });

  it('应将 tenantId 正确委托给 service.getProviderHealthStatuses', async () => {
    const response: ProviderHealthStatusesResponseDtoType = {
      data: [
        {
          providerName: 'openai',
          modelId: 'model-1',
          status: 'degraded',
          failureCount: 2,
          lastFailureAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    };
    mockService.getProviderHealthStatuses.mockResolvedValue(response);

    await expect(controller.getProviderHealth('tenant-1')).resolves.toEqual(
      response,
    );
    expect(mockService.getProviderHealthStatuses).toHaveBeenCalledWith(
      'tenant-1',
    );
  });

  it('应将策略名称正确委托给 service.getStrategyConfigSchema', () => {
    const response: SmartRoutingStrategyConfigSchemaResponseDtoType = {
      data: {
        name: 'knn',
        configSchema: {
          type: 'object',
          properties: {
            topK: { type: 'integer' },
          },
        },
      },
    };
    mockService.getStrategyConfigSchema.mockReturnValue(response);

    expect(controller.getStrategyConfigSchema('knn')).toEqual(response);
    expect(mockService.getStrategyConfigSchema).toHaveBeenCalledWith('knn');
  });

  it('应将 tenantId 与 query 正确委托给 service.findByExecution', async () => {
    const query: QueryRoutingDecisionsDto = {
      executionId: '00000000-0000-0000-0000-000000000011',
      routingNodeId: 'routing-node-1',
      page: 2,
      pageSize: 10,
    };
    const response = {
      data: [{ id: 'decision-1' }],
      meta: { page: 2, pageSize: 10, total: 1, totalPages: 1 },
    };
    mockService.findByExecution.mockResolvedValue(response);

    await expect(
      controller.findRoutingDecisions('tenant-1', query),
    ).resolves.toEqual(response);
    expect(mockService.findByExecution).toHaveBeenCalledWith('tenant-1', query);
  });
});
