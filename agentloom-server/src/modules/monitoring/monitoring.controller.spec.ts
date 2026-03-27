import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { MonitoringController } from './monitoring.controller';
import type { MonitoringService } from './monitoring.service';

const ORGANIZATION_ID = '019577a0-0000-7000-8000-000000001001';
const TENANT_ID = '019577a0-0000-7000-8000-000000001005';
const USER_ID = '019577a0-0000-7000-8000-000000001002';

function getMethodRoles(methodName: keyof MonitoringController) {
  const handler = Object.getOwnPropertyDescriptor(
    MonitoringController.prototype,
    methodName,
  )?.value;

  return handler ? Reflect.getMetadata(ROLES_KEY, handler) : undefined;
}

describe('MonitoringController', () => {
  let controller: MonitoringController;
  let service: {
    getDashboard: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      getDashboard: vi.fn(),
    };

    controller = new MonitoringController(
      service as unknown as MonitoringService,
    );
  });

  it('applies owner/admin roles to the monitoring handler', () => {
    expect(getMethodRoles('getDashboard')).toEqual(['owner', 'admin']);
  });

  it('passes org, tenant, user, and window through to the service and wraps the response', async () => {
    service.getDashboard.mockResolvedValue({
      summary: {
        scope: 'organization',
        window: '24h',
        lastUpdatedAt: '2026-03-18T05:30:00.000Z',
        executionCount: 12,
        successRate: 91.2,
        failureRate: 8.8,
        averageDurationMs: 42_000,
        queueDepth: 3,
        governanceBlocks: 1,
        activeAlerts: 2,
        metricSources: {
          execution: ['workflow-executions', 'execution-records', 'derived'],
          governance: ['resource-governance', 'audit-logs'],
          alerts: ['notifications', 'audit-logs', 'derived'],
          queueDepth: ['execution-queue', 'derived'],
        },
      },
      trend: [],
      alerts: [],
      hotspots: [],
      riskSummary: {
        level: 'warning',
        title: '当前组织风险抬升',
        summary: 'summary',
        explanation: 'explanation',
        governancePauseActive: false,
        lastEvaluatedAt: '2026-03-18T05:30:00.000Z',
      },
    });

    const result = await controller.getDashboard(
      ORGANIZATION_ID,
      TENANT_ID,
      USER_ID,
      { window: '24h' } as never,
    );

    expect(service.getDashboard).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      window: '24h',
    });
    expect(result).toEqual({
      data: expect.objectContaining({
        summary: expect.objectContaining({
          window: '24h',
          queueDepth: 3,
        }),
      }),
    });
  });

  it('declares a swagger 200 response for the monitoring endpoint', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MonitoringController.prototype,
      'getDashboard',
    )?.value;

    const responses = handler
      ? (Reflect.getMetadata(DECORATORS.API_RESPONSE, handler) as
          | Record<string, { description?: string }>
          | undefined)
      : undefined;

    expect(responses).toBeDefined();
    expect(
      Object.values(responses ?? {}).some(
        (response) => response.description === '组织级只读监控仪表板',
      ),
    ).toBe(true);
  });
});
