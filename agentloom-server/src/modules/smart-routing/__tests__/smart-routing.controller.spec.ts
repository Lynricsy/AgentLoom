import 'reflect-metadata';

import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import type { QueryRoutingDecisionsDto } from '../dto/query-routing-decisions.dto';
import { SmartRoutingController } from '../smart-routing.controller';

const { createMockSmartRoutingService } = vi.hoisted(() => ({
  createMockSmartRoutingService: () => ({
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
    controller = new SmartRoutingController(mockService as any);
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
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, descriptor?.value)).toBe(200);
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
