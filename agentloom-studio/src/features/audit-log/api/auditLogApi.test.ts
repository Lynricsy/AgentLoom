import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAuditLogSearchParams,
  fetchAuditLogDetail,
  fetchAuditLogResourceSequence,
  fetchAuditLogs,
} from './auditLogApi'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
  },
}))

describe('auditLogApi', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('builds the frozen audit log search params contract', () => {
    expect(
      buildAuditLogSearchParams({
        from: '2026-03-17T00:00:00.000Z',
        to: '2026-03-18T00:00:00.000Z',
        eventType: 'workflow.updated',
        resourceType: 'workflow_definition',
        resourceId: 'wf-1',
        executionId: 'exec-1',
        actorType: 'user',
        actorId: 'user-1',
        page: 2,
        pageSize: 50,
      }),
    ).toEqual({
      from: '2026-03-17T00:00:00.000Z',
      to: '2026-03-18T00:00:00.000Z',
      eventType: 'workflow.updated',
      resourceType: 'workflow_definition',
      resourceId: 'wf-1',
      executionId: 'exec-1',
      actorType: 'user',
      actorId: 'user-1',
      page: '2',
      pageSize: '50',
    })
  })

  it('passes list filters to GET /audit-logs', async () => {
    const response = {
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1,
      },
    }

    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    })

    await expect(
      fetchAuditLogs({
        eventType: 'workflow.updated',
        actorType: 'service',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual(response)

    expect(getMock).toHaveBeenCalledWith('audit-logs', {
      searchParams: {
        eventType: 'workflow.updated',
        actorType: 'service',
        page: '1',
        pageSize: '20',
      },
    })
  })

  it('unwraps detail and sequence responses', async () => {
    getMock
      .mockReturnValueOnce({
        json: vi.fn().mockResolvedValue({
          data: { id: 'log-1', eventType: 'workflow.updated' },
        }),
      })
      .mockReturnValueOnce({
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'log-1', eventType: 'workflow.updated' }],
        }),
      })

    await expect(fetchAuditLogDetail('log-1')).resolves.toEqual({
      id: 'log-1',
      eventType: 'workflow.updated',
    })
    await expect(
      fetchAuditLogResourceSequence('workflow_definition', 'wf-1'),
    ).resolves.toEqual([{ id: 'log-1', eventType: 'workflow.updated' }])

    expect(getMock).toHaveBeenNthCalledWith(1, 'audit-logs/log-1')
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      'audit-logs/resources/workflow_definition/wf-1/sequence',
    )
  })
})
