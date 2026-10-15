import { describe, expect, it, vi } from 'vitest';
import { DecisionController } from '../decision.controller';
import type { DecisionService } from '../decision.service';
import { ListDecisionRecordsQuerySchema } from '../dto/decision-record.dto';

const TENANT_ID = '019577a0-0000-7000-8000-000000000099';
const SUBJECT_ID = '019577a0-0000-7000-8000-0000000000aa';

describe('DecisionController', () => {
  it('按租户与筛选条件委托 listRecords', async () => {
    const page = {
      data: [],
      meta: { total: 0, page: 1, limit: 20, pageSize: 20, totalPages: 0 },
    };
    const listRecords = vi.fn().mockResolvedValue(page);
    const controller = new DecisionController({
      listRecords,
    } as unknown as DecisionService);
    const query = ListDecisionRecordsQuerySchema.parse({
      subjectType: 'routing_decision',
      subjectId: SUBJECT_ID,
    });

    await expect(
      controller.listDecisionRecords(TENANT_ID, query),
    ).resolves.toBe(page);
    expect(listRecords).toHaveBeenCalledWith(TENANT_ID, {
      kind: undefined,
      subjectType: 'routing_decision',
      subjectId: SUBJECT_ID,
      page: 1,
      limit: 20,
    });
  });
});

describe('ListDecisionRecordsQuerySchema', () => {
  it('pageSize 作为 limit 别名，limit 上限 100', () => {
    expect(
      ListDecisionRecordsQuerySchema.parse({ page: '2', pageSize: '50' }),
    ).toMatchObject({ page: 2, limit: 50 });
    expect(
      ListDecisionRecordsQuerySchema.safeParse({ limit: '101' }).success,
    ).toBe(false);
  });

  it('拒绝未知 subjectType 与非 uuid subjectId', () => {
    expect(
      ListDecisionRecordsQuerySchema.safeParse({ subjectType: 'execution' })
        .success,
    ).toBe(false);
    expect(
      ListDecisionRecordsQuerySchema.safeParse({ subjectId: 'not-a-uuid' })
        .success,
    ).toBe(false);
  });
});
