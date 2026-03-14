import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../../database/database.module';
import { TriggerHistoryService } from '../trigger-history.service';

const mocks = vi.hoisted(() => ({
  getTenantDb: vi.fn(),
  createMockDb: () => ({
    select: vi.fn(),
    insert: vi.fn(),
  }),
}));

vi.mock('../../../common/providers/tenant-aware-db.provider', () => ({
  getTenantDb: mocks.getTenantDb,
}));

const TENANT_ID = '019391d4-a000-7000-0000-000000000001';
const TRIGGER_ID = '019391d4-b000-7000-0000-000000000002';
const EXECUTION_ID = '019391d4-c000-7000-0000-000000000003';
const NOW = new Date('2025-01-01T00:00:00.000Z');

const historyRecord = {
  id: '019391d4-d000-7000-0000-000000000004',
  triggerId: TRIGGER_ID,
  tenantId: TENANT_ID,
  status: 'success' as const,
  executionId: EXECUTION_ID,
  errorMessage: null,
  payload: { source: 'cron' },
  triggeredAt: NOW,
};

function createInsertReturning(result: unknown) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectWhereResolved(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectPaginated(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

describe('TriggerHistoryService', () => {
  let service: TriggerHistoryService;
  let db: ReturnType<typeof mocks.createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();

    db = mocks.createMockDb();
    mocks.getTenantDb.mockReturnValue(db);

    const module = await Test.createTestingModule({
      providers: [
        TriggerHistoryService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    service = module.get(TriggerHistoryService);
  });

  describe('record', () => {
    it('应写入触发历史', async () => {
      db.insert.mockReturnValue(createInsertReturning([historyRecord]));

      await expect(
        service.record(TENANT_ID, {
          triggerId: TRIGGER_ID,
          status: 'success',
          executionId: EXECUTION_ID,
          payload: { source: 'cron' },
        }),
      ).resolves.toEqual(historyRecord);
    });
  });

  describe('findByTrigger', () => {
    it('应返回分页历史记录与 meta', async () => {
      db.select
        .mockReturnValueOnce(createSelectPaginated([historyRecord]))
        .mockReturnValueOnce(createSelectWhereResolved([{ count: 3 }]));

      await expect(
        service.findByTrigger(TENANT_ID, TRIGGER_ID, {
          page: 2,
          pageSize: 2,
          status: 'success',
        }),
      ).resolves.toEqual({
        data: [historyRecord],
        meta: {
          page: 2,
          pageSize: 2,
          total: 3,
          totalPages: 2,
        },
      });
    });
  });
});
