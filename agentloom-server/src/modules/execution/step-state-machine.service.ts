import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { InvalidStepTransitionException } from './execution.exceptions';
import { EventBridgeService } from './services/event-bridge.service';
import type { AgentEvent } from '../agent/types/agent-event.types';

export type StepStatus = schema.ExecutionStep['status'];

/**
 * 步骤状态合法转换映射。
 * 终态（completed, failed, skipped, cancelled）不包含任何合法转换目标。
 */
export const STEP_TRANSITIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  pending: new Set(['queued', 'running', 'skipped', 'cancelled']),
  queued: new Set(['running', 'cancelled']),
  running: new Set([
    'pending',
    'completed',
    'failed',
    'waiting_intervention',
    'cancelled',
  ]),
  waiting_intervention: new Set(['running', 'cancelled']),
  failed: new Set(['pending']),
  cancelled: new Set(['pending']),
};

export const COMPLETED_STEP_STATUSES = new Set<string>(['completed', 'skipped']);

@Injectable()
export class StepStateMachineService {
  private readonly logger = new Logger(StepStateMachineService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventBridge: EventBridgeService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  /**
   * 验证并执行步骤状态转换。
   * 使用乐观锁（WHERE status = 当前状态）确保并发安全。
   */
  async updateStepStatus(
    tenantId: string,
    stepId: string,
    newStatus: StepStatus,
    extra?: {
      result?: schema.NewExecutionStep['result'];
      errorMessage?: schema.NewExecutionStep['errorMessage'];
      checkpointData?: schema.NewExecutionStep['checkpointData'];
    },
  ): Promise<schema.ExecutionStep> {
    const [step] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    if (!step) {
      throw new Error(`步骤 ${stepId} 不存在`);
    }

    const allowedTargets = STEP_TRANSITIONS[step.status];
    if (!allowedTargets?.has(newStatus)) {
      throw new InvalidStepTransitionException(step.status, newStatus);
    }

    const now = new Date();
    const [updated] = await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: newStatus,
        updatedAt: now,
        ...(newStatus === 'running' && !step.startedAt
          ? { startedAt: now }
          : {}),
        ...(newStatus === 'completed' || newStatus === 'failed'
          ? { completedAt: now }
          : {}),
        ...(extra?.result !== undefined ? { result: extra.result } : {}),
        ...(extra?.errorMessage !== undefined
          ? { errorMessage: extra.errorMessage }
          : {}),
        ...(extra?.checkpointData !== undefined
          ? { checkpointData: extra.checkpointData }
          : {}),
      })
      .where(
        and(
          eq(schema.executionSteps.id, stepId),
          eq(schema.executionSteps.status, step.status),
        ),
      )
      .returning();

    if (!updated) {
      throw new InvalidStepTransitionException(step.status, newStatus);
    }

    this.eventBridge.emitStepStatusChanged(
      tenantId,
      step.executionId,
      {
        stepId,
        nodeId: step.nodeId,
        from: step.status,
        to: newStatus,
      },
    );

    this.logger.log(
      `Step status updated: ${JSON.stringify({ stepId, from: step.status, to: newStatus })}`,
    );

    return updated;
  }

  /**
   * 根据所有步骤状态重新计算并更新执行状态。
   * 状态推导规则：
   * - 全部 completed/skipped → execution completed
   * - 有 failed 且无 running/queued → execution failed
   * - 有 waiting_intervention 且无 running/queued → execution paused
   * - 其他 → execution running
   */
  async updateExecutionStatus(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      return;
    }

    if (
      execution.status === 'failed' ||
      execution.status === 'cancelled' ||
      execution.status === 'completed'
    ) {
      return;
    }

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    if (steps.length === 0) {
      return;
    }

    const completedCount = steps.filter((s) =>
      COMPLETED_STEP_STATUSES.has(s.status),
    ).length;
    const allCompleted = completedCount === steps.length;
    const anyFailed = steps.some((s) => s.status === 'failed');
    const anyRunning = steps.some(
      (s) => s.status === 'running' || s.status === 'queued',
    );
    const anyWaiting = steps.some(
      (s) => s.status === 'waiting_intervention',
    );

    let executionStatus: schema.WorkflowExecution['status'];

    if (allCompleted) {
      executionStatus = 'completed';
    } else if (anyFailed && !anyRunning) {
      executionStatus = 'failed';
    } else if (anyWaiting && !anyRunning) {
      executionStatus = 'paused';
    } else {
      executionStatus = 'running';
    }

    const now = new Date();

    await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: executionStatus,
        completedSteps: completedCount,
        updatedAt: now,
        ...(executionStatus === 'completed' ? { completedAt: now } : {}),
        ...(executionStatus === 'failed' ? { failedAt: now } : {}),
      })
      .where(eq(schema.workflowExecutions.id, executionId));

    this.eventBridge.emitExecutionStatusChanged(
      tenantId,
      executionId,
      {
        executionId,
        status: executionStatus,
        completedSteps: completedCount,
        totalSteps: steps.length,
      },
    );

    this.logger.log(
      `Execution status updated: ${JSON.stringify({ executionId, status: executionStatus, completedSteps: completedCount })}`,
    );
  }

  broadcastAgentEvent(
    tenantId: string,
    executionId: string,
    stepId: string,
    event: AgentEvent,
  ): void {
    this.eventBridge.emitStepAgentEvent(
      tenantId,
      executionId,
      {
        stepId,
        event,
      },
    );
  }

  broadcastStepRetry(
    tenantId: string,
    executionId: string,
    stepId: string,
    payload: {
      attempt: number;
      maxAttempts: number;
      errorMessage: string;
    },
  ): void {
    this.eventBridge.emitStepRetrying(
      tenantId,
      executionId,
      {
        stepId,
        ...payload,
      },
    );
  }

  async markExecutionFailed(
    executionId: string,
    tenantId: string,
    errorMessage?: schema.ExecutionStepErrorMessage,
  ): Promise<void> {
    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    const completedCount = steps.filter((step) =>
      COMPLETED_STEP_STATUSES.has(step.status),
    ).length;

    const now = new Date();

    await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'failed',
        completedSteps: completedCount,
        updatedAt: now,
        failedAt: now,
        ...(errorMessage ? { errorMessage } : {}),
      })
      .where(eq(schema.workflowExecutions.id, executionId));

    this.eventBridge.emitExecutionStatusChanged(
      tenantId,
      executionId,
      {
        executionId,
        status: 'failed',
        completedSteps: completedCount,
        totalSteps: steps.length,
        ...(errorMessage ? { errorMessage: errorMessage.message } : {}),
      },
    );
  }
}
