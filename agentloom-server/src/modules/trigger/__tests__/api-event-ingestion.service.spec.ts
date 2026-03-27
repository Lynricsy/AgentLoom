import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { ExecutionService } from '../../execution/execution.service';
import { EventSourceAdapterRegistry } from '../adapters/event-source-adapter.registry';
import { ApiEventIngestionService } from '../api-event-ingestion.service';
import { TriggerHistoryService } from '../trigger-history.service';
import { TriggerService } from '../trigger.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  createMockDb: () => ({
    select: vi.fn(),
  }),
  createMockExecutionService: () => ({
    runWorkflow: vi.fn(),
  }),
  createMockTriggerHistoryService: () => ({
    record: vi.fn(),
  }),
  createMockTriggerService: () => ({
    markTriggered: vi.fn(),
  }),
  createMockAdapterRegistry: () => ({
    getAdapter: vi.fn(),
  }),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const WORKFLOW_ID = '019391d4-b000-7000-0000-000000000002';
const TRIGGER_ID = '019391d4-c000-7000-0000-000000000003';
const EXECUTION_ID = '019391d4-e000-7000-0000-000000000005';
const NOW = new Date('2025-01-01T00:00:00.000Z');

const baseTrigger = {
  id: TRIGGER_ID,
  workflowDefinitionId: WORKFLOW_ID,
  tenantId: TENANT_ID,
  name: 'API Event Trigger',
  description: null,
  type: 'api_event' as const,
  config: {
    eventSource: 'github',
    eventType: 'push',
    filterRules: [],
  },
  isEnabled: true,
  lastTriggeredAt: null,
  nextFireAt: null,
  triggerCount: 0,
  createdBy: '019391d4-d000-7000-0000-000000000004',
  createdAt: NOW,
  updatedAt: NOW,
};

const mockAdapter = {
  name: 'github',
  validateEvent: vi.fn().mockReturnValue(true),
  matchesTrigger: vi.fn().mockReturnValue(true),
};

describe('ApiEventIngestionService', () => {
  let service: ApiEventIngestionService;
  let db: ReturnType<typeof mocks.createMockDb>;
  let executionService: ReturnType<typeof mocks.createMockExecutionService>;
  let historyService: ReturnType<typeof mocks.createMockTriggerHistoryService>;
  let triggerService: ReturnType<typeof mocks.createMockTriggerService>;
  let adapterRegistry: ReturnType<typeof mocks.createMockAdapterRegistry>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAdapter.validateEvent.mockReturnValue(true);
    mockAdapter.matchesTrigger.mockReturnValue(true);

    db = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(db);

    executionService = mocks.createMockExecutionService();
    historyService = mocks.createMockTriggerHistoryService();
    triggerService = mocks.createMockTriggerService();
    adapterRegistry = mocks.createMockAdapterRegistry();

    const module = await Test.createTestingModule({
      providers: [
        ApiEventIngestionService,
        { provide: DRIZZLE, useValue: db },
        { provide: ExecutionService, useValue: executionService },
        { provide: TriggerHistoryService, useValue: historyService },
        { provide: TriggerService, useValue: triggerService },
        { provide: EventSourceAdapterRegistry, useValue: adapterRegistry },
      ],
    }).compile();

    service = module.get(ApiEventIngestionService);
  });

  describe('ingestEvent', () => {
    const validDto = {
      source: 'github',
      type: 'push',
      data: { ref: 'refs/heads/main' },
    };

    it('应在无匹配触发器时返回 triggeredCount=0', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result).toEqual({
        triggeredCount: 0,
        executions: [],
        skippedCount: 0,
      });
      expect(executionService.runWorkflow).not.toHaveBeenCalled();
    });

    it('应触发匹配的 api_event 触发器并返回 triggeredCount=1', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger]),
        }),
      });
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);
      mockAdapter.matchesTrigger.mockReturnValue(true);
      executionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
      historyService.record.mockResolvedValue(undefined);
      triggerService.markTriggered.mockResolvedValue(undefined);

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result).toEqual({
        triggeredCount: 1,
        executions: [{ triggerId: TRIGGER_ID, executionId: EXECUTION_ID }],
        skippedCount: 0,
      });
      expect(executionService.runWorkflow).toHaveBeenCalledWith(
        WORKFLOW_ID,
        expect.objectContaining({
          inputParams: expect.objectContaining({
            _eventSource: 'github',
            _eventType: 'push',
          }),
          launchSource: 'api-event-trigger',
          triggerType: 'api',
        }),
        TENANT_ID,
        expect.any(String),
      );
    });

    it('适配器不匹配时应跳过触发器并增加 skippedCount', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger]),
        }),
      });
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);
      mockAdapter.matchesTrigger.mockReturnValue(false);

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result).toEqual({
        triggeredCount: 0,
        executions: [],
        skippedCount: 1,
      });
      expect(executionService.runWorkflow).not.toHaveBeenCalled();
    });

    it('validateEvent が false を返した場合はスキップして skippedCount を増やす', async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger]),
        }),
      });
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);
      mockAdapter.validateEvent.mockReturnValue(false);

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result).toEqual({
        triggeredCount: 0,
        executions: [],
        skippedCount: 1,
      });
      expect(mockAdapter.matchesTrigger).not.toHaveBeenCalled();
      expect(executionService.runWorkflow).not.toHaveBeenCalled();
    });

    it('source 不匹配时应回退到 generic 适配器', async () => {
      const genericAdapter = { ...mockAdapter, name: 'generic' };
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger]),
        }),
      });
      adapterRegistry.getAdapter
        .mockImplementationOnce(() => {
          throw new Error('unknown source');
        })
        .mockReturnValue(genericAdapter);
      genericAdapter.matchesTrigger = vi.fn().mockReturnValue(true);
      executionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
      historyService.record.mockResolvedValue(undefined);
      triggerService.markTriggered.mockResolvedValue(undefined);

      const result = await service.ingestEvent(TENANT_ID, {
        source: 'unknown-source',
        type: 'event',
        data: {},
      });

      expect(adapterRegistry.getAdapter).toHaveBeenCalledWith('generic');
      expect(result.triggeredCount).toBe(1);
    });

    it('执行失败时应写入失败历史并继续处理其余触发器', async () => {
      const trigger2 = {
        ...baseTrigger,
        id: 'trigger-2',
        workflowDefinitionId: 'wf-2',
      };
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger, trigger2]),
        }),
      });
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);
      mockAdapter.matchesTrigger.mockReturnValue(true);

      executionService.runWorkflow
        .mockRejectedValueOnce(new Error('execution failed'))
        .mockResolvedValueOnce({ id: EXECUTION_ID });

      historyService.record.mockResolvedValue(undefined);
      triggerService.markTriggered.mockResolvedValue(undefined);

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result.triggeredCount).toBe(1);
      expect(result.executions).toHaveLength(1);
      expect(historyService.record).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ status: 'failed', triggerId: TRIGGER_ID }),
      );
    });

    it('应对无效 dto 抛出 Zod 校验错误', async () => {
      await expect(
        service.ingestEvent(TENANT_ID, { source: '', type: 'push', data: {} }),
      ).rejects.toThrow();
    });

    it('应处理多个触发器并返回正确计数', async () => {
      const trigger2 = {
        ...baseTrigger,
        id: 'trigger-2-id',
        workflowDefinitionId: 'wf-2',
      };
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([baseTrigger, trigger2]),
        }),
      });
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);
      mockAdapter.matchesTrigger
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      executionService.runWorkflow.mockResolvedValue({ id: EXECUTION_ID });
      historyService.record.mockResolvedValue(undefined);
      triggerService.markTriggered.mockResolvedValue(undefined);

      const result = await service.ingestEvent(TENANT_ID, validDto);

      expect(result.triggeredCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });
  });
});
