import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { ResourceGovernanceService } from '../resource-governance/resource-governance.service';
import { MonitoringService } from './monitoring.service';

const NOW = new Date('2026-03-18T06:00:00.000Z');
const ORGANIZATION_ID = '019577a0-0000-7000-8000-000000001001';
const TENANT_ID = '019577a0-0000-7000-8000-000000001005';
const USER_ID = '019577a0-0000-7000-8000-000000001002';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let db: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let tenantDb: {
    execute: ReturnType<typeof vi.fn>;
    query: {
      workflowExecutions: { findMany: ReturnType<typeof vi.fn> };
      workflowDefinitions: { findMany: ReturnType<typeof vi.fn> };
      agentExecutionRecords: { findMany: ReturnType<typeof vi.fn> };
      notifications: { findMany: ReturnType<typeof vi.fn> };
      auditLogs: { findMany: ReturnType<typeof vi.fn> };
    };
  };
  let resourceGovernanceService: {
    getEffectiveState: ReturnType<typeof vi.fn>;
  };
  let agentTaskQueue: {
    getJobs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    tenantDb = {
      execute: vi.fn().mockResolvedValue(undefined),
      query: {
        workflowExecutions: { findMany: vi.fn() },
        workflowDefinitions: { findMany: vi.fn() },
        agentExecutionRecords: { findMany: vi.fn() },
        notifications: { findMany: vi.fn() },
        auditLogs: { findMany: vi.fn() },
      },
    };

    db = {
      transaction: vi.fn(async (callback: (tx: typeof tenantDb) => unknown) =>
        callback(tenantDb),
      ),
    };

    resourceGovernanceService = {
      getEffectiveState: vi.fn(),
    };

    agentTaskQueue = {
      getJobs: vi.fn(),
    };

    service = new MonitoringService(
      db as never,
      resourceGovernanceService as unknown as ResourceGovernanceService,
      agentTaskQueue as unknown as Queue,
    );
  });

  it('builds an organization-scoped monitoring dashboard with honest sources and tenant-filtered queue depth', async () => {
    resourceGovernanceService.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: { tenantId: TENANT_ID, apiRateLimitPerMinute: 100 },
      governance: {
        tenantControl: {
          scope: 'tenant',
          targetId: TENANT_ID,
          status: 'active',
          reason: null,
          updatedAt: null,
          updatedBy: null,
        },
        workflowControls: [
          {
            scope: 'workflow',
            targetId: 'workflow-2',
            status: 'paused',
            reason: 'incident response',
            updatedAt: NOW.toISOString(),
            updatedBy: USER_ID,
          },
        ],
        version: 1,
      },
    });
    tenantDb.query.workflowExecutions.findMany.mockResolvedValue([
      {
        id: 'execution-1',
        workflowDefinitionId: 'workflow-1',
        status: 'completed',
        createdAt: new Date('2026-03-18T05:40:00.000Z'),
        updatedAt: new Date('2026-03-18T05:41:00.000Z'),
      },
      {
        id: 'execution-2',
        workflowDefinitionId: 'workflow-1',
        status: 'failed',
        createdAt: new Date('2026-03-18T05:45:00.000Z'),
        updatedAt: new Date('2026-03-18T05:46:00.000Z'),
      },
      {
        id: 'execution-3',
        workflowDefinitionId: 'workflow-2',
        status: 'paused',
        createdAt: new Date('2026-03-18T05:55:00.000Z'),
        updatedAt: new Date('2026-03-18T05:58:00.000Z'),
      },
    ]);
    tenantDb.query.workflowDefinitions.findMany.mockResolvedValue([
      { id: 'workflow-1', name: '工作流 A' },
      { id: 'workflow-2', name: '工作流 B' },
    ]);
    tenantDb.query.agentExecutionRecords.findMany.mockResolvedValue([
      {
        executionId: 'execution-1',
        summaryData: { executionDurationMs: 40_000 },
      },
      {
        executionId: 'execution-2',
        summaryData: { executionDurationMs: 80_000 },
      },
    ]);
    tenantDb.query.notifications.findMany.mockResolvedValue([
      {
        type: 'resource_governance_execution_blocked',
        title: '新执行已被资源治理阻止',
        body: {
          workflowId: 'workflow-2',
          workflowName: '工作流 B',
          reason: 'workflow governance pause is preventing new workflow executions',
          requestedAt: '2026-03-18T05:50:00.000Z',
          resourceGovernanceUrl: '/settings/resource-quotas',
        },
        createdAt: new Date('2026-03-18T05:50:00.000Z'),
      },
      {
        type: 'resource_governance_execution_blocked',
        title: '新执行已被资源治理阻止',
        body: {
          workflowId: 'workflow-2',
          workflowName: '工作流 B',
          reason: 'workflow governance pause is preventing new workflow executions',
          requestedAt: '2026-03-18T05:50:00.000Z',
          resourceGovernanceUrl: '/settings/resource-quotas',
        },
        createdAt: new Date('2026-03-18T05:50:05.000Z'),
      },
      {
        type: 'execution_failed',
        title: '执行失败',
        body: {
          executionId: 'execution-2',
          errorReason: 'agent tool call failed',
          timelineUrl: '/executions/execution-2',
          requestedAt: '2026-03-18T05:46:00.000Z',
        },
        createdAt: new Date('2026-03-18T05:46:00.000Z'),
      },
    ]);
    tenantDb.query.auditLogs.findMany.mockResolvedValue([
      {
        eventType: 'resource-governance.execution-start.blocked',
        createdAt: new Date('2026-03-18T05:50:00.000Z'),
      },
      {
        eventType: 'resource-governance.execution-start.blocked',
        createdAt: new Date('2026-03-18T05:52:00.000Z'),
      },
    ]);
    agentTaskQueue.getJobs.mockResolvedValue([
      {
        id: 'job-1',
        timestamp: new Date('2026-03-18T05:57:00.000Z').getTime(),
        data: { tenantId: TENANT_ID, executionId: 'execution-3' },
      },
      {
        id: 'job-2',
        timestamp: new Date('2026-03-18T05:57:30.000Z').getTime(),
        data: { tenantId: 'other-tenant', executionId: 'execution-9' },
      },
    ]);

    const dashboard = await service.getDashboard({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      window: '1h',
    });

    expect(resourceGovernanceService.getEffectiveState).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      USER_ID,
    );
    expect(dashboard.summary).toEqual(
      expect.objectContaining({
        scope: 'organization',
        window: '1h',
        executionCount: 3,
        successRate: 50,
        failureRate: 50,
        averageDurationMs: 60_000,
        queueDepth: 1,
        governanceBlocks: 2,
      }),
    );
    expect(dashboard.summary.metricSources.execution).toEqual([
      'workflow-executions',
      'execution-records',
      'derived',
    ]);
    expect(
      dashboard.alerts.filter((alert) => alert.category === 'governance-block'),
    ).toHaveLength(1);
    expect(dashboard.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'anomalous-execution',
          linkTarget: {
            type: 'execution',
            href: '/executions/execution-2',
          },
        }),
      ]),
    );
    expect(dashboard.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'workflow',
          label: '工作流 B',
          status: 'governance-paused',
          linkTarget: {
            type: 'resource-governance',
            href: '/settings/resource-quotas',
          },
        }),
        expect.objectContaining({
          kind: 'execution',
          id: 'execution-execution-3',
          status: 'paused',
          queueDepth: 1,
        }),
      ]),
    );
    expect(dashboard.riskSummary).toEqual(
      expect.objectContaining({
        level: 'critical',
        governancePauseActive: true,
        primaryLinkTarget: {
          type: 'resource-governance',
          href: '/settings/resource-quotas',
        },
      }),
    );
    expect(dashboard.trend.length).toBeGreaterThan(0);
    expect(dashboard.trend.every((point) => point.queueDepth === null)).toBe(true);
  });

  it('returns a stable dashboard when the window has no executions, notifications, or queue jobs', async () => {
    resourceGovernanceService.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: { tenantId: TENANT_ID, apiRateLimitPerMinute: 100 },
      governance: {
        tenantControl: {
          scope: 'tenant',
          targetId: TENANT_ID,
          status: 'active',
          reason: null,
          updatedAt: null,
          updatedBy: null,
        },
        workflowControls: [],
        version: 0,
      },
    });
    tenantDb.query.workflowExecutions.findMany.mockResolvedValue([]);
    tenantDb.query.workflowDefinitions.findMany.mockResolvedValue([]);
    tenantDb.query.agentExecutionRecords.findMany.mockResolvedValue([]);
    tenantDb.query.notifications.findMany.mockResolvedValue([]);
    tenantDb.query.auditLogs.findMany.mockResolvedValue([]);
    agentTaskQueue.getJobs.mockResolvedValue([]);

    const dashboard = await service.getDashboard({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      window: '15m',
    });

    expect(dashboard.summary).toEqual(
      expect.objectContaining({
        executionCount: 0,
        successRate: 0,
        failureRate: 0,
        averageDurationMs: null,
        queueDepth: 0,
        governanceBlocks: 0,
        activeAlerts: 0,
      }),
    );
    expect(dashboard.alerts).toEqual([]);
    expect(dashboard.hotspots).toEqual([]);
    expect(dashboard.riskSummary.level).toBe('stable');
    expect(dashboard.trend.every((point) => point.queueDepth === null)).toBe(true);
  });
});
