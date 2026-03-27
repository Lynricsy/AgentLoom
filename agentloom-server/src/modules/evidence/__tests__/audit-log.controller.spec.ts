import 'reflect-metadata';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { ListAuditLogsQuerySchema } from '../dto/audit-log.dto';
import { AuditLogController } from '../audit-log.controller';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const AUDIT_LOG_ID = '00000000-0000-4000-8000-000000000002';

function createMockAuditLogService() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findResourceSequence: vi.fn(),
  };
}

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: ReturnType<typeof createMockAuditLogService>;

  beforeEach(() => {
    service = createMockAuditLogService();
    controller = new AuditLogController(service as never);
  });

  it('should declare owner/admin runtime roles at controller level', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditLogController)).toEqual([
      'owner',
      'admin',
    ]);
  });

  it('should normalize snake_case query aliases into page/pageSize filters', () => {
    expect(
      ListAuditLogsQuerySchema.parse({
        page: 2,
        page_size: 5,
        resource_type: 'workflow',
        resource_id: 'wf-1',
        event_type: 'workflow.updated',
        execution_id: '00000000-0000-4000-8000-000000000010',
        actor_type: 'system',
      }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      resourceType: 'workflow',
      resourceId: 'wf-1',
      eventType: 'workflow.updated',
      executionId: '00000000-0000-4000-8000-000000000010',
      actorType: 'system',
    });
  });

  it('should coerce from/to ISO strings into Date filters', () => {
    expect(
      ListAuditLogsQuerySchema.parse({
        page_size: 5,
        from: '2026-03-17T09:00:00.000Z',
        to: '2026-03-17T10:00:00.000Z',
      }),
    ).toEqual({
      page: 1,
      pageSize: 5,
      from: new Date('2026-03-17T09:00:00.000Z'),
      to: new Date('2026-03-17T10:00:00.000Z'),
    });
  });

  it('should return list responses with knowledge-style data/meta envelope', async () => {
    service.list.mockResolvedValue({
      data: [{ id: AUDIT_LOG_ID }],
      total: 3,
    });

    await expect(
      controller.list(TENANT_ID, {
        page: 2,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      data: [{ id: AUDIT_LOG_ID }],
      meta: {
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      },
    });

    expect(service.list).toHaveBeenCalledWith(TENANT_ID, {
      page: 2,
      pageSize: 2,
    });
  });

  it('should return detail responses as { data }', async () => {
    service.findById.mockResolvedValue({ id: AUDIT_LOG_ID, summary: 'detail' });

    await expect(controller.findById(TENANT_ID, AUDIT_LOG_ID)).resolves.toEqual(
      {
        data: { id: AUDIT_LOG_ID, summary: 'detail' },
      },
    );
  });

  it('should return resource sequence responses as { data }', async () => {
    service.findResourceSequence.mockResolvedValue([{ id: AUDIT_LOG_ID }]);

    await expect(
      controller.findResourceSequence(TENANT_ID, 'workflow', 'wf-1'),
    ).resolves.toEqual({
      data: [{ id: AUDIT_LOG_ID }],
    });

    expect(service.findResourceSequence).toHaveBeenCalledWith(
      TENANT_ID,
      'workflow',
      'wf-1',
    );
  });
});
