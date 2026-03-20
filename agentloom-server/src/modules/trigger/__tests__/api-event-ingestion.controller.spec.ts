import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ApiEventIngestionController } from '../api-event-ingestion.controller';
import type { IngestionResult } from '../api-event-ingestion.service';

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-e000-7000-0000-000000000005';

function createMockIngestionService() {
  return {
    ingestEvent: vi.fn(),
  };
}

function createMockRequest(tenantId = TENANT_ID) {
  return { tenantId } as { tenantId: string };
}

describe('ApiEventIngestionController', () => {
  let controller: ApiEventIngestionController;
  let ingestionService: ReturnType<typeof createMockIngestionService>;

  beforeEach(() => {
    vi.clearAllMocks();
    ingestionService = createMockIngestionService();
    controller = new ApiEventIngestionController(ingestionService as never);
  });

  describe('ingestEvent', () => {
    const validBody = {
      source: 'github',
      type: 'push',
      data: { ref: 'refs/heads/main' },
    };

    const successResult: IngestionResult = {
      triggeredCount: 1,
      executions: [{ triggerId: TRIGGER_ID, executionId: EXECUTION_ID }],
      skippedCount: 0,
    };

    it('应接受有效事件载荷并返回 ingestion 结果', async () => {
      ingestionService.ingestEvent.mockResolvedValue(successResult);

      const result = await controller.ingestEvent(
        createMockRequest(),
        validBody,
      );

      expect(result).toEqual(successResult);
      expect(ingestionService.ingestEvent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          source: 'github',
          type: 'push',
          data: { ref: 'refs/heads/main' },
        }),
      );
    });

    it('应在无匹配触发器时返回 triggeredCount=0', async () => {
      const emptyResult: IngestionResult = {
        triggeredCount: 0,
        executions: [],
        skippedCount: 0,
      };
      ingestionService.ingestEvent.mockResolvedValue(emptyResult);

      const result = await controller.ingestEvent(
        createMockRequest(),
        validBody,
      );

      expect(result).toEqual(emptyResult);
    });

    it('应在 data 缺失时使用默认空对象', async () => {
      const bodyWithoutData = { source: 'custom', type: 'event' };
      const emptyResult: IngestionResult = {
        triggeredCount: 0,
        executions: [],
        skippedCount: 0,
      };
      ingestionService.ingestEvent.mockResolvedValue(emptyResult);

      await controller.ingestEvent(createMockRequest(), bodyWithoutData);

      expect(ingestionService.ingestEvent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          source: 'custom',
          type: 'event',
          data: {},
        }),
      );
    });

    it('应对 source 为空字符串时抛出 ZodError', async () => {
      const invalidBody = { source: '', type: 'push', data: {} };

      try {
        await controller.ingestEvent(createMockRequest(), invalidBody);
        expect.unreachable('应抛出 ZodError');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
      }

      expect(ingestionService.ingestEvent).not.toHaveBeenCalled();
    });

    it('应对 type 为空字符串时抛出 ZodError', async () => {
      const invalidBody = { source: 'github', type: '', data: {} };

      try {
        await controller.ingestEvent(createMockRequest(), invalidBody);
        expect.unreachable('应抛出 ZodError');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
      }

      expect(ingestionService.ingestEvent).not.toHaveBeenCalled();
    });

    it('应对缺少必填字段时抛出 ZodError', async () => {
      const invalidBody = { data: {} };

      try {
        await controller.ingestEvent(createMockRequest(), invalidBody);
        expect.unreachable('应抛出 ZodError');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
      }

      expect(ingestionService.ingestEvent).not.toHaveBeenCalled();
    });

    it('应将 request.tenantId 正确传递给 service', async () => {
      const customTenantId = '019391d4-f000-7000-0000-000000000099';
      const emptyResult: IngestionResult = {
        triggeredCount: 0,
        executions: [],
        skippedCount: 0,
      };
      ingestionService.ingestEvent.mockResolvedValue(emptyResult);

      await controller.ingestEvent(
        createMockRequest(customTenantId),
        validBody,
      );

      expect(ingestionService.ingestEvent).toHaveBeenCalledWith(
        customTenantId,
        expect.anything(),
      );
    });

    it('应在 service 抛出异常时透传错误', async () => {
      const serviceError = new Error('数据库连接失败');
      ingestionService.ingestEvent.mockRejectedValue(serviceError);

      try {
        await controller.ingestEvent(createMockRequest(), validBody);
        expect.unreachable('应透传 service 错误');
      } catch (error) {
        expect(error).toBe(serviceError);
      }
    });

    it('应处理含多个执行结果的 ingestion 响应', async () => {
      const multiResult: IngestionResult = {
        triggeredCount: 2,
        executions: [
          { triggerId: 'trigger-1', executionId: 'exec-1' },
          { triggerId: 'trigger-2', executionId: 'exec-2' },
        ],
        skippedCount: 1,
      };
      ingestionService.ingestEvent.mockResolvedValue(multiResult);

      const result = await controller.ingestEvent(
        createMockRequest(),
        validBody,
      );

      expect(result.triggeredCount).toBe(2);
      expect(result.executions).toHaveLength(2);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('路由与装饰器元数据', () => {
    it('不应声明 @Public 装饰器（需要认证）', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        ApiEventIngestionController.prototype,
        'ingestEvent',
      );

      expect(descriptor?.value).toBeDefined();
      const isPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        descriptor?.value as object,
      );
      expect(isPublic).not.toBe(true);
    });

    it('类级别不应声明 @Public 装饰器', () => {
      const isPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        ApiEventIngestionController,
      );
      expect(isPublic).not.toBe(true);
    });

    it('应声明 HttpCode(202) 装饰器', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        ApiEventIngestionController.prototype,
        'ingestEvent',
      );

      const httpCode = Reflect.getMetadata(
        '__httpCode__',
        descriptor?.value as object,
      );
      expect(httpCode).toBe(HttpStatus.ACCEPTED);
    });
  });
});
