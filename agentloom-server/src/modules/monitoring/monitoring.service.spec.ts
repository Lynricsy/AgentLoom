import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { ResourceGovernanceService } from '../resource-governance/resource-governance.service';
import { ResourceGovernanceAccessDeniedException } from '../resource-governance/resource-governance.exceptions';
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
          reason:
            'workflow governance pause is preventing new workflow executions',
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
          reason:
            'workflow governance pause is preventing new workflow executions',
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
    expect(dashboard.trend.every((point) => point.queueDepth === null)).toBe(
      true,
    );
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
    expect(dashboard.trend.every((point) => point.queueDepth === null)).toBe(
      true,
    );
  });
  it('coerces nullable snapshots and aggregates the full-day window across alert and hotspot variants', async () => {
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
    tenantDb.query.workflowExecutions.findMany.mockResolvedValue([
      {
        id: 'execution-completed',
        workflowDefinitionId: 'workflow-completed',
        status: 'completed',
        createdAt: new Date('2026-03-17T07:00:00.000Z'),
        updatedAt: new Date('2026-03-17T07:01:00.000Z'),
      },
      {
        id: 'execution-failed',
        workflowDefinitionId: 'workflow-failed',
        status: 'failed',
        createdAt: new Date('2026-03-17T11:00:00.000Z'),
        updatedAt: new Date('2026-03-17T11:01:00.000Z'),
      },
      {
        id: 'execution-running',
        workflowDefinitionId: 'workflow-running',
        status: 'running',
        createdAt: new Date('2026-03-18T05:00:00.000Z'),
        updatedAt: new Date('2026-03-18T05:30:00.000Z'),
      },
    ]);
    tenantDb.query.workflowDefinitions.findMany.mockResolvedValue([
      { id: 'workflow-completed', name: 'Completed workflow' },
      { id: 'workflow-failed', name: 'Failed workflow' },
    ]);
    tenantDb.query.agentExecutionRecords.findMany.mockResolvedValue([
      {
        executionId: 'execution-completed',
        summaryData: { executionDurationMs: 1_001 },
      },
      {
        executionId: 'execution-failed',
        summaryData: null,
      },
    ]);
    tenantDb.query.notifications.findMany.mockResolvedValue([
      {
        type: 'intervention_required',
        title: 'Needs input',
        body: null,
        createdAt: new Date('2026-03-18T05:01:00.000Z'),
      },
      {
        type: 'resource_governance_execution_terminated',
        title: 'Terminated',
        body: {
          executionId: 'execution-failed',
          effectedAt: '2026-03-18T05:02:00.000Z',
          timelineUrl: '/executions/execution-failed',
        },
        createdAt: new Date('2026-03-18T05:02:30.000Z'),
      },
      {
        type: 'execution_failed',
        title: 'Failed without details',
        body: {
          executionId: '   ',
          errorReason: '',
          timelineUrl: null,
        },
        createdAt: new Date('2026-03-18T05:03:00.000Z'),
      },
      {
        type: 'resource_governance_execution_blocked',
        title: 'Blocked without details',
        body: 42,
        createdAt: new Date('2026-03-18T05:04:00.000Z'),
      },
      {
        type: 'future_monitoring_signal',
        title: 'Unsupported',
        body: {},
        createdAt: new Date('2026-03-18T05:05:00.000Z'),
      },
    ]);
    tenantDb.query.auditLogs.findMany.mockResolvedValue([]);
    agentTaskQueue.getJobs.mockResolvedValue([
      {
        name: 'agent-task',
        timestamp: new Date('2026-03-18T05:10:00.000Z').getTime(),
        data: { tenantId: TENANT_ID },
      },
      {
        id: 22,
        name: 'agent-task',
        timestamp: new Date('2026-03-18T05:11:00.000Z').getTime(),
        data: { tenantId: TENANT_ID, executionId: 'execution-running' },
      },
      {
        id: 'job-running-2',
        timestamp: new Date('2026-03-18T05:12:00.000Z').getTime(),
        data: { tenantId: TENANT_ID, executionId: 'execution-running' },
      },
      {
        id: 'foreign-job',
        timestamp: new Date('2026-03-18T05:13:00.000Z').getTime(),
        data: { tenantId: 'another-tenant', executionId: 'execution-running' },
      },
      {
        id: 'missing-data',
        timestamp: new Date('2026-03-18T05:14:00.000Z').getTime(),
        data: null,
      },
    ]);

    const dashboard = await service.getDashboard({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      window: '24h',
    });

    expect(agentTaskQueue.getJobs).toHaveBeenCalledWith([
      'waiting',
      'active',
      'delayed',
      'prioritized',
    ]);
    expect(dashboard.summary).toEqual(
      expect.objectContaining({
        window: '24h',
        executionCount: 3,
        successRate: 50,
        failureRate: 50,
        averageDurationMs: 1_001,
        queueDepth: 3,
      }),
    );
    expect(dashboard.trend).toHaveLength(6);
    expect(dashboard.trend[0]?.bucketLabel).toBe('03-17 06:00');
    expect(dashboard.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Needs input',
          reason: '执行需要人工确认后才能继续。',
          affectedSummary: '有执行进入人工介入链路。',
          linkTarget: undefined,
        }),
        expect.objectContaining({
          title: 'Terminated',
          reason: '异常执行已被治理流程终止。',
          detectedAt: '2026-03-18T05:02:00.000Z',
          linkTarget: {
            type: 'execution',
            href: '/executions/execution-failed',
          },
        }),
        expect.objectContaining({
          title: 'Failed without details',
          reason: '执行失败，请进入执行详情查看时间线。',
          affectedSummary: '有执行在当前窗口内失败。',
          linkTarget: undefined,
        }),
        expect.objectContaining({
          title: 'Blocked without details',
          reason: '新的执行已被治理规则阻止。',
          affectedSummary: '某个工作流被治理规则阻止。',
          linkTarget: undefined,
        }),
      ]),
    );
    expect(dashboard.alerts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Unsupported' }),
      ]),
    );
    expect(dashboard.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'workflow-workflow-running',
          label: '工作流 workflow',
          status: 'running',
          failureRate: null,
        }),
        expect.objectContaining({
          id: 'execution-execution-running',
          status: 'running',
          queueDepth: 2,
          impactSummary:
            '该执行关联的 agent-task 队列中仍有 2 个作业等待或运行。',
        }),
        expect.objectContaining({
          id: 'execution-execution-failed',
          status: 'failed',
          failureRate: 100,
        }),
      ]),
    );
  });

  it('reports warning thresholds without a critical signal', async () => {
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
    tenantDb.query.workflowExecutions.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        id: `execution-${index}`,
        workflowDefinitionId: 'workflow-warning',
        status: index === 0 ? 'failed' : 'completed',
        createdAt: new Date(
          `2026-03-18T05:${String(index).padStart(2, '0')}:00.000Z`,
        ),
        updatedAt: new Date(
          `2026-03-18T05:${String(index).padStart(2, '0')}:30.000Z`,
        ),
      })),
    );
    tenantDb.query.workflowDefinitions.findMany.mockResolvedValue([
      { id: 'workflow-warning', name: 'Warning workflow' },
    ]);
    tenantDb.query.agentExecutionRecords.findMany.mockResolvedValue([]);
    tenantDb.query.notifications.findMany.mockResolvedValue([]);
    tenantDb.query.auditLogs.findMany.mockResolvedValue([]);
    agentTaskQueue.getJobs.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `queue-${index}`,
        timestamp: NOW.getTime(),
        data: { tenantId: TENANT_ID },
      })),
    );

    const dashboard = await service.getDashboard({
      organizationId: ORGANIZATION_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      window: '1h',
    });

    expect(dashboard.summary).toEqual(
      expect.objectContaining({
        failureRate: 10,
        successRate: 90,
        queueDepth: 5,
      }),
    );
    expect(dashboard.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'error-rate',
          severity: 'warning',
        }),
        expect.objectContaining({
          category: 'queue-depth',
          severity: 'warning',
        }),
      ]),
    );
    expect(dashboard.riskSummary).toEqual(
      expect.objectContaining({
        level: 'warning',
        governancePauseActive: false,
        primaryLinkTarget: undefined,
      }),
    );
  });

  it('rejects a governance snapshot belonging to another tenant', async () => {
    resourceGovernanceService.getEffectiveState.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      quota: {
        tenantId: 'another-tenant',
        apiRateLimitPerMinute: 100,
      },
      governance: {
        tenantControl: {
          scope: 'tenant',
          targetId: 'another-tenant',
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
    tenantDb.query.notifications.findMany.mockResolvedValue([]);
    tenantDb.query.auditLogs.findMany.mockResolvedValue([]);
    agentTaskQueue.getJobs.mockResolvedValue([]);

    await expect(
      service.getDashboard({
        organizationId: ORGANIZATION_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        window: '15m',
      }),
    ).rejects.toBeInstanceOf(ResourceGovernanceAccessDeniedException);
    expect(
      tenantDb.query.agentExecutionRecords.findMany,
    ).not.toHaveBeenCalled();
    expect(tenantDb.query.workflowDefinitions.findMany).not.toHaveBeenCalled();
  });
});
