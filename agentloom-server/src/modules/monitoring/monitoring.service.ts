import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentExecutionRecords,
  auditLogs,
  notifications,
  workflowDefinitions,
  workflowExecutions,
} from '../../database/schema';
import { AGENT_TASK_QUEUE, type AgentTaskJobData } from '../execution/execution.constants';
import { ResourceGovernanceService } from '../resource-governance/resource-governance.service';
import { ResourceGovernanceAccessDeniedException } from '../resource-governance/resource-governance.exceptions';
import type {
  MonitoringAlertSummaryDto,
  MonitoringDashboardDto,
  MonitoringHotspotDto,
  MonitoringLinkTargetDto,
  MonitoringMetricSource,
  MonitoringRiskSummaryDto,
} from './dto/monitoring-dashboard.dto';
import type { MonitoringWindow } from './dto/query-monitoring-dashboard.dto';

type GovernanceState = Awaited<
  ReturnType<ResourceGovernanceService['getEffectiveState']>
>;

type ExecutionRow = Awaited<
  ReturnType<DrizzleDB['query']['workflowExecutions']['findMany']>
>[number];

type ExecutionSummaryRow = Awaited<
  ReturnType<DrizzleDB['query']['agentExecutionRecords']['findMany']>
>[number];

type NotificationRow = Awaited<
  ReturnType<DrizzleDB['query']['notifications']['findMany']>
>[number];

type AuditLogRow = Awaited<
  ReturnType<DrizzleDB['query']['auditLogs']['findMany']>
>[number];

type WorkflowDefinitionRow = Awaited<
  ReturnType<DrizzleDB['query']['workflowDefinitions']['findMany']>
>[number];

type QueueJobSnapshot = {
  id: string;
  timestamp: number;
  executionId: string | null;
  tenantId: string | null;
};

type NotificationSignal = {
  type: NotificationRow['type'];
  title: string;
  createdAt: Date;
  body: Record<string, unknown>;
};

const WINDOW_CONFIG: Record<
  MonitoringWindow,
  { durationMs: number; bucketMs: number }
> = {
  '15m': { durationMs: 15 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  '1h': { durationMs: 60 * 60 * 1000, bucketMs: 10 * 60 * 1000 },
  '24h': { durationMs: 24 * 60 * 60 * 1000, bucketMs: 4 * 60 * 60 * 1000 },
};

const ALERT_NOTIFICATION_TYPES = [
  'execution_failed',
  'intervention_required',
  'resource_governance_execution_blocked',
  'resource_governance_execution_terminated',
] as const;

const GOVERNANCE_BLOCK_AUDIT_EVENTS = [
  'resource-governance.execution-start.blocked',
  'resource-governance.api-request.blocked',
] as const;

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'prioritized'] as const;

@Injectable()
export class MonitoringService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly resourceGovernanceService: ResourceGovernanceService,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue<AgentTaskJobData>,
  ) {}

  async getDashboard(params: {
    organizationId: string;
    tenantId: string;
    userId: string;
    window: MonitoringWindow;
  }): Promise<MonitoringDashboardDto> {
    const now = new Date();
    const windowConfig = WINDOW_CONFIG[params.window];
    const windowStart = new Date(now.getTime() - windowConfig.durationMs);

    return runInTenantTransaction(this.db, params.tenantId, async (tenantDb) => {
      const [governanceState, executions, notificationRows, blockedAuditRows, queueJobs] =
        await Promise.all([
          this.resourceGovernanceService.getEffectiveState(
            params.organizationId,
            params.userId,
          ),
          tenantDb.query.workflowExecutions.findMany({
            where: and(
              eq(workflowExecutions.tenantId, params.tenantId),
              gte(workflowExecutions.createdAt, windowStart),
            ),
            orderBy: [desc(workflowExecutions.createdAt)],
          }),
          tenantDb.query.notifications.findMany({
            where: and(
              eq(notifications.tenantId, params.tenantId),
              gte(notifications.createdAt, windowStart),
              inArray(notifications.type, [...ALERT_NOTIFICATION_TYPES]),
            ),
            orderBy: [desc(notifications.createdAt)],
          }),
          tenantDb.query.auditLogs.findMany({
            where: and(
              eq(auditLogs.tenantId, params.tenantId),
              gte(auditLogs.createdAt, windowStart),
              inArray(auditLogs.eventType, [...GOVERNANCE_BLOCK_AUDIT_EVENTS]),
            ),
            orderBy: [desc(auditLogs.createdAt)],
          }),
          this.listTenantQueueJobs(params.tenantId),
        ]);

      if (governanceState.quota.tenantId !== params.tenantId) {
        throw new ResourceGovernanceAccessDeniedException();
      }

      const executionIds = executions.map((execution) => execution.id);
      const workflowIds = [...new Set(executions.map((execution) => execution.workflowDefinitionId))];

      const [summaryRows, workflowRows] = await Promise.all([
        executionIds.length > 0
          ? tenantDb.query.agentExecutionRecords.findMany({
              where: and(
                eq(agentExecutionRecords.tenantId, params.tenantId),
                eq(agentExecutionRecords.recordType, 'execution_summary'),
                inArray(agentExecutionRecords.executionId, executionIds),
              ),
            })
          : Promise.resolve([] as ExecutionSummaryRow[]),
        workflowIds.length > 0
          ? tenantDb.query.workflowDefinitions.findMany({
              where: and(
                eq(workflowDefinitions.tenantId, params.tenantId),
                inArray(workflowDefinitions.id, workflowIds),
              ),
            })
          : Promise.resolve([] as WorkflowDefinitionRow[]),
      ]);

      return this.buildDashboard({
        window: params.window,
        now,
        windowStart,
        governanceState,
        executions,
        summaryRows,
        workflowRows,
        notificationRows,
        blockedAuditRows,
        queueJobs,
      });
    });
  }

  private buildDashboard(input: {
    window: MonitoringWindow;
    now: Date;
    windowStart: Date;
    governanceState: GovernanceState;
    executions: ExecutionRow[];
    summaryRows: ExecutionSummaryRow[];
    workflowRows: WorkflowDefinitionRow[];
    notificationRows: NotificationRow[];
    blockedAuditRows: AuditLogRow[];
    queueJobs: QueueJobSnapshot[];
  }): MonitoringDashboardDto {
    const summaryByExecutionId = new Map(
      input.summaryRows.map((row) => [row.executionId, row.summaryData]),
    );
    const workflowNameById = new Map(
      input.workflowRows.map((workflow) => [workflow.id, workflow.name]),
    );
    const dedupedSignals = this.dedupeNotificationSignals(input.notificationRows);
    const governanceBlocks = input.blockedAuditRows.length;
    const queueDepth = input.queueJobs.length;

    const executionCount = input.executions.length;
    const completedCount = input.executions.filter(
      (execution) => execution.status === 'completed',
    ).length;
    const failedCount = input.executions.filter(
      (execution) => execution.status === 'failed',
    ).length;
    const terminalCount = completedCount + failedCount;
    const successRate = terminalCount > 0 ? (completedCount / terminalCount) * 100 : 0;
    const failureRate = terminalCount > 0 ? (failedCount / terminalCount) * 100 : 0;
    const averageDurationMs = this.calculateAverageDuration(
      input.executions,
      summaryByExecutionId,
    );
    const governancePauseActive =
      input.governanceState.governance.tenantControl.status === 'paused' ||
      input.governanceState.governance.workflowControls.some(
        (control) => control.status === 'paused',
      );

    const alerts = this.buildAlerts({
      now: input.now,
      dedupedSignals,
      executions: input.executions,
      queueDepth,
      failureRate,
    });

    const riskSummary = this.buildRiskSummary({
      now: input.now,
      governancePauseActive,
      queueDepth,
      governanceBlocks,
      failureRate,
      alerts,
    });

    const hotspots = this.buildHotspots({
      executions: input.executions,
      workflowNameById,
      queueJobs: input.queueJobs,
      governanceState: input.governanceState,
      blockedSignals: dedupedSignals.filter(
        (signal) => signal.type === 'resource_governance_execution_blocked',
      ),
    });

    const trend = this.buildTrend({
      window: input.window,
      now: input.now,
      windowStart: input.windowStart,
      executions: input.executions,
      summaryByExecutionId,
      dedupedSignals,
      blockedAuditRows: input.blockedAuditRows,
    });

    const alertSources = this.uniqueSources([
      'notifications',
      'audit-logs',
      ...alerts.map((alert) => alert.source),
    ]);

    return {
      summary: {
        scope: 'organization',
        window: input.window,
        lastUpdatedAt: input.now.toISOString(),
        executionCount,
        successRate: this.roundRate(successRate),
        failureRate: this.roundRate(failureRate),
        averageDurationMs,
        queueDepth,
        governanceBlocks,
        activeAlerts: alerts.length,
        metricSources: {
          execution: ['workflow-executions', 'execution-records', 'derived'],
          governance: ['resource-governance', 'audit-logs'],
          alerts: alertSources,
          queueDepth: ['execution-queue', 'derived'],
        },
      },
      trend,
      alerts,
      hotspots,
      riskSummary,
    };
  }

  private buildTrend(input: {
    window: MonitoringWindow;
    now: Date;
    windowStart: Date;
    executions: ExecutionRow[];
    summaryByExecutionId: Map<string, ExecutionSummaryRow['summaryData']>;
    dedupedSignals: NotificationSignal[];
    blockedAuditRows: AuditLogRow[];
  }): MonitoringDashboardDto['trend'] {
    const { bucketMs } = WINDOW_CONFIG[input.window];
    const buckets: MonitoringDashboardDto['trend'] = [];

    for (
      let bucketStartMs = input.windowStart.getTime();
      bucketStartMs < input.now.getTime();
      bucketStartMs += bucketMs
    ) {
      const bucketStart = new Date(bucketStartMs);
      const bucketEnd = new Date(Math.min(bucketStartMs + bucketMs, input.now.getTime()));
      const bucketExecutions = input.executions.filter((execution) =>
        this.isWithinBucket(execution.createdAt, bucketStart, bucketEnd),
      );
      const bucketCompletedCount = bucketExecutions.filter(
        (execution) => execution.status === 'completed',
      ).length;
      const bucketFailedCount = bucketExecutions.filter(
        (execution) => execution.status === 'failed',
      ).length;
      const bucketTerminalCount = bucketCompletedCount + bucketFailedCount;
      const bucketFailureRate =
        bucketTerminalCount > 0 ? (bucketFailedCount / bucketTerminalCount) * 100 : 0;
      const bucketSuccessRate =
        bucketTerminalCount > 0 ? (bucketCompletedCount / bucketTerminalCount) * 100 : 0;
      const bucketGovernanceBlocks = input.blockedAuditRows.filter((record) =>
        this.isWithinBucket(record.createdAt, bucketStart, bucketEnd),
      ).length;
      const bucketAlerts = input.dedupedSignals.filter((signal) =>
        this.isWithinBucket(signal.createdAt, bucketStart, bucketEnd),
      ).length;

      buckets.push({
        bucketStart: bucketStart.toISOString(),
        bucketLabel: this.formatBucketLabel(input.window, bucketStart),
        executionCount: bucketExecutions.length,
        successRate: this.roundRate(bucketSuccessRate),
        failureRate: this.roundRate(bucketFailureRate),
        averageDurationMs: this.calculateAverageDuration(
          bucketExecutions,
          input.summaryByExecutionId,
        ),
        queueDepth: null,
        governanceBlocks: bucketGovernanceBlocks,
        activeAlerts: bucketAlerts,
      });
    }

    return buckets;
  }

  private buildAlerts(input: {
    now: Date;
    dedupedSignals: NotificationSignal[];
    executions: ExecutionRow[];
    queueDepth: number;
    failureRate: number;
  }): MonitoringAlertSummaryDto[] {
    const alerts: MonitoringAlertSummaryDto[] = input.dedupedSignals
      .map((signal) => this.toAlert(signal))
      .filter((alert): alert is MonitoringAlertSummaryDto => alert !== null);

    if (input.failureRate >= 10 && input.executions.length > 0) {
      alerts.push({
        id: `derived-error-rate-${input.now.toISOString()}`,
        severity: input.failureRate >= 25 ? 'critical' : 'warning',
        category: 'error-rate',
        title: '失败率抬升',
        reason: `当前窗口内终态执行失败率为 ${this.roundRate(input.failureRate).toFixed(1)}%，已超过监控页的提示阈值。`,
        detectedAt: input.now.toISOString(),
        affectedSummary: `当前窗口共观测到 ${input.executions.length} 次执行，其中失败率明显抬升。`,
        source: 'derived',
      });
    }

    if (input.queueDepth >= 5) {
      alerts.push({
        id: `derived-queue-depth-${input.now.toISOString()}`,
        severity: input.queueDepth >= 10 ? 'critical' : 'warning',
        category: 'queue-depth',
        title: '队列压力抬升',
        reason: `当前 agent-task 队列快照中仍有 ${input.queueDepth} 个属于该组织的待处理或运行中作业。`,
        detectedAt: input.now.toISOString(),
        affectedSummary: '该指标来自当前 queue snapshot，只反映此刻积压与活跃作业，不代表完整历史队列曲线。',
        source: 'derived',
      });
    }

    return alerts.sort((left, right) =>
      right.detectedAt.localeCompare(left.detectedAt),
    );
  }

  private buildHotspots(input: {
    executions: ExecutionRow[];
    workflowNameById: Map<string, string>;
    queueJobs: QueueJobSnapshot[];
    governanceState: GovernanceState;
    blockedSignals: NotificationSignal[];
  }): MonitoringHotspotDto[] {
    const workflowQueueDepthByExecutionId = new Map<string, number>();
    for (const job of input.queueJobs) {
      if (!job.executionId) {
        continue;
      }

      workflowQueueDepthByExecutionId.set(
        job.executionId,
        (workflowQueueDepthByExecutionId.get(job.executionId) ?? 0) + 1,
      );
    }

    const blockedCountByWorkflowId = new Map<string, number>();
    for (const signal of input.blockedSignals) {
      const workflowId = this.readString(signal.body.workflowId);
      if (!workflowId) {
        continue;
      }
      blockedCountByWorkflowId.set(
        workflowId,
        (blockedCountByWorkflowId.get(workflowId) ?? 0) + 1,
      );
    }

    const workflowHotspots = [...new Set(input.executions.map((item) => item.workflowDefinitionId))]
      .map((workflowId) => {
        const items = input.executions.filter(
          (execution) => execution.workflowDefinitionId === workflowId,
        );
        const failedCount = items.filter((execution) => execution.status === 'failed').length;
        const terminalCount = items.filter(
          (execution) => execution.status === 'completed' || execution.status === 'failed',
        ).length;
        const workflowControl = input.governanceState.governance.workflowControls.find(
          (control) => control.targetId === workflowId,
        );
        const blockedCount = blockedCountByWorkflowId.get(workflowId) ?? 0;
        const failureRate =
          terminalCount > 0 ? this.roundRate((failedCount / terminalCount) * 100) : null;
        const queueDepth = null;
        const status = workflowControl?.status === 'paused'
          ? 'governance-paused'
          : blockedCount > 0
            ? 'blocked'
            : failedCount > 0
              ? 'failed'
              : items.some(
                    (execution) =>
                      execution.status === 'running' || execution.status === 'pending',
                  )
                ? 'running'
                : 'healthy';

        return {
          id: `workflow-${workflowId}`,
          kind: 'workflow' as const,
          label:
            input.workflowNameById.get(workflowId) ?? `工作流 ${workflowId.slice(0, 8)}`,
          impactSummary:
            workflowControl?.status === 'paused'
              ? '该工作流当前处于治理暂停状态，新的执行会被组织治理规则拦截。'
              : blockedCount > 0
                ? `当前窗口内已有 ${blockedCount} 次治理阻止命中该工作流。`
                : failedCount > 0
                  ? '该工作流在当前窗口内失败比例偏高，需要结合只读执行详情继续排查。'
                  : '该工作流在当前窗口内执行活跃，可用于观察整体负载分布。',
          executionCount: items.length,
          failureRate,
          queueDepth,
          status,
          lastSeenAt: this.maxDate(items.map((execution) => execution.createdAt)).toISOString(),
          linkTarget:
            workflowControl?.status === 'paused' || blockedCount > 0
              ? { type: 'resource-governance', href: '/settings/resource-quotas' }
              : undefined,
        } satisfies MonitoringHotspotDto;
      })
      .sort((left, right) => right.executionCount - left.executionCount)
      .slice(0, 3);

    const executionHotspots = input.executions
      .filter(
        (execution) =>
          execution.status === 'failed' ||
          execution.status === 'paused' ||
          execution.status === 'running' ||
          workflowQueueDepthByExecutionId.has(execution.id),
      )
      .map((execution) => {
        const queueDepth = workflowQueueDepthByExecutionId.get(execution.id) ?? null;
        const status =
          execution.status === 'failed'
            ? 'failed'
            : execution.status === 'paused'
              ? 'paused'
              : execution.status === 'running' || execution.status === 'pending'
                ? 'running'
                : 'healthy';

        return {
          id: `execution-${execution.id}`,
          kind: 'execution' as const,
          label: execution.id,
          impactSummary:
            status === 'paused'
              ? '该执行当前处于 execution paused（人工介入）状态，应前往执行详情查看时间线与介入上下文。'
              : status === 'failed'
                ? '该执行在当前窗口内已失败，建议结合只读执行详情确认失败节点与错误摘要。'
                : queueDepth && queueDepth > 0
                  ? `该执行关联的 agent-task 队列中仍有 ${queueDepth} 个作业等待或运行。`
                  : '该执行仍在运行中，可通过时间线继续观察实时进展。',
          executionCount: 1,
          failureRate: status === 'failed' ? 100 : null,
          queueDepth,
          status,
          lastSeenAt: execution.updatedAt.toISOString(),
          linkTarget: {
            type: 'execution',
            href: `/executions/${execution.id}`,
          },
        } satisfies MonitoringHotspotDto;
      })
      .sort((left, right) => {
        const rightQueueDepth = right.queueDepth ?? -1;
        const leftQueueDepth = left.queueDepth ?? -1;
        return rightQueueDepth - leftQueueDepth;
      })
      .slice(0, 3);

    return [...workflowHotspots, ...executionHotspots].slice(0, 5);
  }

  private buildRiskSummary(input: {
    now: Date;
    governancePauseActive: boolean;
    queueDepth: number;
    governanceBlocks: number;
    failureRate: number;
    alerts: MonitoringAlertSummaryDto[];
  }): MonitoringRiskSummaryDto {
    const hasCriticalAlert = input.alerts.some((alert) => alert.severity === 'critical');
    const level: MonitoringRiskSummaryDto['level'] = input.governancePauseActive ||
      hasCriticalAlert ||
      input.failureRate >= 25 ||
      input.queueDepth >= 10
      ? 'critical'
      : input.governanceBlocks > 0 || input.alerts.length > 0 || input.failureRate >= 10
        ? 'warning'
        : 'stable';

    const primaryLinkTarget = input.governancePauseActive || input.governanceBlocks > 0
      ? ({ type: 'resource-governance', href: '/settings/resource-quotas' } satisfies MonitoringLinkTargetDto)
      : input.alerts.find((alert) => alert.linkTarget)?.linkTarget;

    if (level === 'critical') {
      return {
        level,
        title: '当前组织存在关键风险',
        summary:
          '治理暂停、失败率抬升或队列压力中的至少一项已经达到关键阈值，建议先查看资源治理设置，再下钻到受影响执行。',
        explanation:
          '风险摘要由 workflow executions、execution records、governance state、notifications、audit logs 与当前 agent-task queue snapshot 的只读聚合生成，本页不会直接执行治理操作。',
        governancePauseActive: input.governancePauseActive,
        lastEvaluatedAt: input.now.toISOString(),
        primaryLinkTarget,
      };
    }

    if (level === 'warning') {
      return {
        level,
        title: '当前组织风险抬升',
        summary:
          '当前窗口内已经观测到治理阻止、异常执行提示或失败率抬升，建议结合治理页与执行详情继续判断是否需要人工处置。',
        explanation:
          '风险摘要保持只读，只负责汇总 execution records、notifications、audit logs 与 governance state，不替代既有治理工作台。',
        governancePauseActive: input.governancePauseActive,
        lastEvaluatedAt: input.now.toISOString(),
        primaryLinkTarget,
      };
    }

    return {
      level,
      title: '当前组织运行稳定',
      summary:
        '当前窗口内没有观测到明显的治理阻止或失败率抬升，监控页仍会继续汇总只读摘要、趋势与热点。',
      explanation:
        '稳定状态仍基于 workflow executions、execution records、notifications、audit logs 与当前 queue snapshot 计算，并不意味着完全没有瞬时波动。',
      governancePauseActive: input.governancePauseActive,
      lastEvaluatedAt: input.now.toISOString(),
      primaryLinkTarget,
    };
  }

  private async listTenantQueueJobs(tenantId: string): Promise<QueueJobSnapshot[]> {
    const jobs = await this.agentTaskQueue.getJobs([...QUEUE_STATES]);

    return jobs
      .filter((job) => this.readString(job.data?.tenantId) === tenantId)
      .map((job) => ({
        id: job.id?.toString() ?? `${job.name}:${job.timestamp}`,
        timestamp: job.timestamp,
        executionId: this.readString(job.data?.executionId),
        tenantId: this.readString(job.data?.tenantId),
      }));
  }

  private dedupeNotificationSignals(rows: NotificationRow[]): NotificationSignal[] {
    const deduped = new Map<string, NotificationSignal>();

    for (const row of rows) {
      const body = this.toRecord(row.body);
      const key = [
        row.type,
        this.readString(body.executionId) ?? '',
        this.readString(body.workflowId) ?? '',
        this.readString(body.reason) ?? this.readString(body.errorReason) ?? '',
        this.readString(body.requestedAt) ?? this.readString(body.timelineUrl) ?? '',
      ].join(':');

      if (!deduped.has(key)) {
        deduped.set(key, {
          type: row.type,
          title: row.title,
          createdAt: row.createdAt,
          body,
        });
      }
    }

    return [...deduped.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  private toAlert(signal: NotificationSignal): MonitoringAlertSummaryDto | null {
    const detectedAt =
      this.readString(signal.body.requestedAt) ??
      this.readString(signal.body.effectedAt) ??
      signal.createdAt.toISOString();
    const timelineUrl = this.readString(signal.body.timelineUrl);
    const resourceGovernanceUrl = this.readString(signal.body.resourceGovernanceUrl);

    switch (signal.type) {
      case 'execution_failed':
        return {
          id: `alert:${signal.type}:${this.readString(signal.body.executionId) ?? detectedAt}`,
          severity: 'critical',
          category: 'anomalous-execution',
          title: signal.title,
          reason:
            this.readString(signal.body.errorReason) ?? '执行失败，请进入执行详情查看时间线。',
          detectedAt,
          affectedSummary:
            this.readString(signal.body.executionId) ?? '有执行在当前窗口内失败。',
          source: 'notifications',
          linkTarget: timelineUrl
            ? { type: 'execution', href: timelineUrl as `/executions/${string}` }
            : undefined,
        };
      case 'intervention_required':
        return {
          id: `alert:${signal.type}:${this.readString(signal.body.executionId) ?? detectedAt}`,
          severity: 'warning',
          category: 'anomalous-execution',
          title: signal.title,
          reason:
            this.readString(signal.body.interventionReason) ??
            '执行需要人工确认后才能继续。',
          detectedAt,
          affectedSummary:
            this.readString(signal.body.nodeName) ??
            this.readString(signal.body.executionId) ??
            '有执行进入人工介入链路。',
          source: 'notifications',
          linkTarget: timelineUrl
            ? { type: 'execution', href: timelineUrl as `/executions/${string}` }
            : undefined,
        };
      case 'resource_governance_execution_blocked':
        return {
          id: `alert:${signal.type}:${this.readString(signal.body.workflowId) ?? detectedAt}`,
          severity: 'warning',
          category: 'governance-block',
          title: signal.title,
          reason:
            this.readString(signal.body.reason) ??
            '新的执行已被治理规则阻止。',
          detectedAt,
          affectedSummary:
            this.readString(signal.body.workflowName) ??
            this.readString(signal.body.workflowId) ??
            '某个工作流被治理规则阻止。',
          source: 'notifications',
          linkTarget:
            resourceGovernanceUrl === '/settings/resource-quotas'
              ? { type: 'resource-governance', href: '/settings/resource-quotas' }
              : undefined,
        };
      case 'resource_governance_execution_terminated':
        return {
          id: `alert:${signal.type}:${this.readString(signal.body.executionId) ?? detectedAt}`,
          severity: 'critical',
          category: 'anomalous-execution',
          title: signal.title,
          reason:
            this.readString(signal.body.reason) ??
            '异常执行已被治理流程终止。',
          detectedAt,
          affectedSummary:
            this.readString(signal.body.executionId) ??
            '有异常执行在当前窗口内被终止。',
          source: 'notifications',
          linkTarget: timelineUrl
            ? { type: 'execution', href: timelineUrl as `/executions/${string}` }
            : undefined,
        };
      default:
        return null;
    }
  }

  private calculateAverageDuration(
    executions: ExecutionRow[],
    summaryByExecutionId: Map<string, ExecutionSummaryRow['summaryData']>,
  ): number | null {
    const durations = executions
      .map((execution) => summaryByExecutionId.get(execution.id)?.executionDurationMs ?? null)
      .filter((value): value is number => value !== null);

    if (durations.length === 0) {
      return null;
    }

    return Math.round(
      durations.reduce((total, duration) => total + duration, 0) / durations.length,
    );
  }

  private uniqueSources(
    sources: MonitoringMetricSource[],
  ): MonitoringMetricSource[] {
    return [...new Set(sources)];
  }

  private roundRate(value: number): number {
    return Number(value.toFixed(1));
  }

  private maxDate(values: Date[]): Date {
    return values.reduce((latest, current) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }

  private isWithinBucket(value: Date, start: Date, end: Date): boolean {
    return value.getTime() >= start.getTime() && value.getTime() < end.getTime();
  }

  private formatBucketLabel(window: MonitoringWindow, value: Date): string {
    const iso = value.toISOString();
    if (window === '24h') {
      return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
    }

    return iso.slice(11, 16);
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }
}
