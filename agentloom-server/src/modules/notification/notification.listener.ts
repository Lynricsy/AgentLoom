import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import {
  transactionStorage,
  type TenantTransactionContext,
} from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { NotificationService } from './notification.service';
import {
  ExecutionEventName,
  type ExecutionStatusChangedPayload,
  type InterventionRequiredPayload,
} from '../execution/types/execution-event.types';
import {
  ResourceGovernanceEventName,
  type ResourceGovernanceControlsUpdatedEvent,
  type ResourceGovernanceExecutionStartBlockedEvent,
  type ResourceGovernanceExecutionTerminatedEvent,
  type ResourceGovernanceQuotaUpdatedEvent,
} from '../resource-governance/resource-governance.events';

const EDITOR_ROLES = ['owner', 'admin', 'creator'] as const;
const DEFAULT_INTERVENTION_REASON = '节点请求人工确认后才能继续执行。';
const FAILURE_SUGGESTION =
  '请打开执行详情查看失败节点与时间线，并在修复后重新运行工作流。';

interface ExecutionStatusChangedEvent extends ExecutionStatusChangedPayload {
  tenantId: string;
}

interface InterventionRequiredEvent extends InterventionRequiredPayload {
  tenantId: string;
  executionId: string;
}

interface ExecutionNotificationContext {
  workflowId: string;
  workflowName: string;
  executionId: string;
  errorMessage: Record<string, unknown> | null;
}

interface WorkflowNotificationContext {
  workflowId: string;
  workflowName: string;
}

@Injectable()
export class NotificationListener {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notificationService: NotificationService,
  ) {}

  @OnEvent(ExecutionEventName.EXECUTION_STATUS_CHANGED)
  async handleExecutionStatusChanged(
    event: ExecutionStatusChangedEvent,
  ): Promise<void> {
    if (event.executionType === 'conversation') {
      return;
    }

    if (!this.isExecutionNotificationStatus(event.status)) {
      return;
    }

    await runInTenantTransaction(this.db, event.tenantId, async (tenantDb) => {
      const [context, recipients] = await Promise.all([
        this.findExecutionContext(tenantDb, event.tenantId, event.executionId),
        this.findEditorRecipients(tenantDb, event.tenantId),
      ]);

      if (!context || recipients.length === 0) {
        return;
      }

      const notificationInput = this.buildExecutionNotificationInput(
        event,
        context,
      );

      if (!notificationInput) {
        return;
      }

      await Promise.all(
        recipients.map(({ userId }) =>
          this.notificationService.create(event.tenantId, {
            userId,
            ...notificationInput,
          }),
        ),
      );
    });
  }

  @OnEvent(ExecutionEventName.NODE_INTERVENTION_REQUIRED)
  async handleInterventionRequired(
    event: InterventionRequiredEvent,
  ): Promise<void> {
    await runInTenantTransaction(this.db, event.tenantId, async (tenantDb) => {
      const [context, recipients] = await Promise.all([
        this.findExecutionContext(tenantDb, event.tenantId, event.executionId),
        this.findEditorRecipients(tenantDb, event.tenantId),
      ]);

      if (!context || recipients.length === 0) {
        return;
      }

      const notificationInput = this.buildInterventionNotificationInput(
        event,
        context,
      );

      await Promise.all(
        recipients.map(({ userId }) =>
          this.notificationService.create(event.tenantId, {
            userId,
            ...notificationInput,
          }),
        ),
      );
    });
  }

  @OnEvent(ResourceGovernanceEventName.QUOTA_UPDATED)
  async handleQuotaUpdated(
    event: ResourceGovernanceQuotaUpdatedEvent,
  ): Promise<void> {
    await this.runInIndependentTenantTransaction(
      event.tenantId,
      async (tenantDb) => {
        const recipients = await this.findEditorRecipients(
          tenantDb,
          event.tenantId,
        );

        if (recipients.length === 0) {
          return;
        }

        const notificationInput =
          this.buildQuotaUpdatedNotificationInput(event);

        await Promise.all(
          recipients.map(({ userId }) =>
            this.notificationService.create(event.tenantId, {
              userId,
              ...notificationInput,
            }),
          ),
        );
      },
    );
  }

  @OnEvent(ResourceGovernanceEventName.CONTROLS_UPDATED)
  async handleControlsUpdated(
    event: ResourceGovernanceControlsUpdatedEvent,
  ): Promise<void> {
    await this.runInIndependentTenantTransaction(
      event.tenantId,
      async (tenantDb) => {
        const recipients = await this.findEditorRecipients(
          tenantDb,
          event.tenantId,
        );

        if (recipients.length === 0) {
          return;
        }

        const notificationInput =
          this.buildControlsUpdatedNotificationInput(event);

        await Promise.all(
          recipients.map(({ userId }) =>
            this.notificationService.create(event.tenantId, {
              userId,
              ...notificationInput,
            }),
          ),
        );
      },
    );
  }

  @OnEvent(ResourceGovernanceEventName.EXECUTION_START_BLOCKED)
  async handleExecutionStartBlocked(
    event: ResourceGovernanceExecutionStartBlockedEvent,
  ): Promise<void> {
    await this.runInIndependentTenantTransaction(
      event.tenantId,
      async (tenantDb) => {
        const [context, recipients] = await Promise.all([
          this.findWorkflowContext(tenantDb, event.tenantId, event.workflowId),
          this.findEditorRecipients(tenantDb, event.tenantId),
        ]);

        if (!context || recipients.length === 0) {
          return;
        }

        const notificationInput =
          this.buildExecutionStartBlockedNotificationInput(event, context);

        await Promise.all(
          recipients.map(({ userId }) =>
            this.notificationService.create(event.tenantId, {
              userId,
              ...notificationInput,
            }),
          ),
        );
      },
    );
  }

  @OnEvent(ResourceGovernanceEventName.EXECUTION_TERMINATED)
  async handleExecutionTerminated(
    event: ResourceGovernanceExecutionTerminatedEvent,
  ): Promise<void> {
    await this.runInIndependentTenantTransaction(
      event.tenantId,
      async (tenantDb) => {
        const [context, recipients] = await Promise.all([
          this.findExecutionContext(
            tenantDb,
            event.tenantId,
            event.executionId,
          ),
          this.findEditorRecipients(tenantDb, event.tenantId),
        ]);

        if (!context || recipients.length === 0) {
          return;
        }

        const notificationInput =
          this.buildExecutionTerminatedNotificationInput(event, context);

        await Promise.all(
          recipients.map(({ userId }) =>
            this.notificationService.create(event.tenantId, {
              userId,
              ...notificationInput,
            }),
          ),
        );
      },
    );
  }

  private async findWorkflowContext(
    tenantDb: DrizzleDB,
    tenantId: string,
    workflowId: string,
  ): Promise<WorkflowNotificationContext | null> {
    const [workflow] = await tenantDb
      .select({
        workflowId: schema.workflowDefinitions.id,
        workflowName: schema.workflowDefinitions.name,
      })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, workflowId),
          eq(schema.workflowDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);

    return workflow ?? null;
  }

  private isExecutionNotificationStatus(status: string): boolean {
    return status === 'completed' || status === 'failed';
  }

  private async findExecutionContext(
    tenantDb: DrizzleDB,
    tenantId: string,
    executionId: string,
  ): Promise<ExecutionNotificationContext | null> {
    const [execution] = await tenantDb
      .select({
        workflowId: schema.workflowExecutions.workflowDefinitionId,
        workflowName: schema.workflowDefinitions.name,
        executionId: schema.workflowExecutions.id,
        errorMessage: schema.workflowExecutions.errorMessage,
      })
      .from(schema.workflowExecutions)
      .innerJoin(
        schema.workflowDefinitions,
        eq(
          schema.workflowDefinitions.id,
          schema.workflowExecutions.workflowDefinitionId,
        ),
      )
      .where(
        and(
          eq(schema.workflowExecutions.id, executionId),
          eq(schema.workflowExecutions.tenantId, tenantId),
        ),
      )
      .limit(1);

    return execution ?? null;
  }

  private async findEditorRecipients(
    tenantDb: DrizzleDB,
    tenantId: string,
  ): Promise<Array<{ userId: string }>> {
    return tenantDb
      .select({ userId: schema.organizationMembers.userId })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.organizationMembers.organizationId),
      )
      .where(
        and(
          eq(schema.organizations.tenantId, tenantId),
          inArray(schema.organizationMembers.role, [...EDITOR_ROLES]),
        ),
      );
  }

  private buildExecutionNotificationInput(
    event: ExecutionStatusChangedEvent,
    context: ExecutionNotificationContext,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } | null {
    const baseBody = this.buildBaseBody(context);

    switch (event.status) {
      case 'completed':
        return {
          type: 'execution_completed',
          title: '执行已完成',
          body: {
            ...baseBody,
            completedSteps: event.completedSteps,
            totalSteps: event.totalSteps,
          },
        };
      case 'failed': {
        const errorReason = this.resolveErrorReason(
          event.errorMessage,
          context.errorMessage,
        );

        return {
          type: 'execution_failed',
          title: '执行失败',
          body: {
            ...baseBody,
            errorReason,
            suggestion: FAILURE_SUGGESTION,
          },
        };
      }
      default:
        return null;
    }
  }

  private buildInterventionNotificationInput(
    event: InterventionRequiredEvent,
    context: ExecutionNotificationContext,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } {
    return {
      type: 'intervention_required',
      title: '执行需要人工介入',
      body: {
        ...this.buildBaseBody(context),
        nodeId: event.nodeId,
        nodeName: event.nodeName,
        interventionReason:
          event.decision?.rationale?.trim() || DEFAULT_INTERVENTION_REASON,
        requestedAt: event.requestedAt,
      },
    };
  }

  private buildQuotaUpdatedNotificationInput(
    event: ResourceGovernanceQuotaUpdatedEvent,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } {
    return {
      type: 'resource_governance_quota_updated',
      title: '资源配额已更新',
      body: {
        organizationId: event.organizationId,
        requestedAt: event.requestedAt,
        effectedAt: event.effectedAt,
        updatedBy: event.actor.actorId,
        quota: event.quota,
        previousQuota: event.previousQuota,
      },
    };
  }

  private buildControlsUpdatedNotificationInput(
    event: ResourceGovernanceControlsUpdatedEvent,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } {
    return {
      type: 'resource_governance_controls_updated',
      title: '执行治理策略已更新',
      body: {
        organizationId: event.organizationId,
        requestedAt: event.requestedAt,
        effectedAt: event.effectedAt,
        updatedBy: event.actor.actorId,
        tenantControl: event.governance.tenantControl,
        workflowControls: event.governance.workflowControls,
        previousGovernance: event.previousGovernance,
      },
    };
  }

  private buildExecutionStartBlockedNotificationInput(
    event: ResourceGovernanceExecutionStartBlockedEvent,
    context: WorkflowNotificationContext,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } {
    return {
      type: 'resource_governance_execution_blocked',
      title: '新执行已被资源治理阻止',
      body: {
        organizationId: event.organizationId,
        workflowId: context.workflowId,
        workflowName: context.workflowName,
        reason: event.reason,
        category: event.category,
        scope: event.scope,
        requestedAt: event.blockedAt,
        resourceGovernanceUrl: '/settings/resource-quotas',
      },
    };
  }

  private buildExecutionTerminatedNotificationInput(
    event: ResourceGovernanceExecutionTerminatedEvent,
    context: ExecutionNotificationContext,
  ): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } {
    return {
      type: 'resource_governance_execution_terminated',
      title: '异常执行已终止',
      body: {
        ...this.buildBaseBody(context),
        organizationId: event.organizationId,
        reason: event.reason,
        requestedAt: event.requestedAt,
        effectedAt: event.effectedAt,
      },
    };
  }

  private async runInIndependentTenantTransaction<T>(
    tenantId: string,
    operation: (tenantDb: DrizzleDB) => Promise<T>,
  ): Promise<T> {
    if (typeof this.db.transaction !== 'function') {
      return runInTenantTransaction(this.db, tenantId, operation);
    }

    const context: TenantTransactionContext = {
      db: undefined as unknown as DrizzleDB,
      afterCommitHooks: [],
    };

    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      await tx.execute(
        sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
      );

      const tenantDb = tx as unknown as DrizzleDB;
      context.db = tenantDb;
      return transactionStorage.run(context, () => operation(tenantDb));
    });

    // 这里此前建了 afterCommitHooks 数组却从不执行，于是治理/配额通知注册的
    // 「提交后入队」回调永远不会跑，通知落库但永不推送。
    for (const hook of context.afterCommitHooks) {
      await hook();
    }

    return result;
  }

  private buildBaseBody(
    context: ExecutionNotificationContext,
  ): Record<string, unknown> {
    return {
      workflowId: context.workflowId,
      workflowName: context.workflowName,
      executionId: context.executionId,
      timelineUrl: `/executions/${context.executionId}`,
    };
  }

  private resolveErrorReason(
    eventErrorMessage?: string,
    executionErrorMessage?: Record<string, unknown> | null,
  ): string {
    if (eventErrorMessage?.trim()) {
      return eventErrorMessage;
    }

    const persistedMessage = executionErrorMessage?.message;
    if (
      typeof persistedMessage === 'string' &&
      persistedMessage.trim().length > 0
    ) {
      return persistedMessage;
    }

    return '执行失败，请查看时间线了解详情。';
  }
}
