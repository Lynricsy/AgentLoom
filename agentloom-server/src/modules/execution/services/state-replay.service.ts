import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import * as schema from '../../../database/schema';
import type {
  ExecutionStateSnapshot,
  StepSnapshot,
} from '../types/execution-event.types';
import type { EventBridgeService } from './event-bridge.service';

@Injectable()
export class StateReplayService {
  private readonly logger = new Logger(StateReplayService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 检查执行记录是否存在（不限租户）。
   * 用于区分 NOT_FOUND (不存在) 和 FORBIDDEN (属于其他租户)。
   */
  async checkExecutionExists(executionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.workflowExecutions.id })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId))
      .limit(1);
    return !!row;
  }

  async getExecutionSnapshot(
    executionId: string,
    tenantId: string,
    eventBridge?: EventBridgeService,
  ): Promise<ExecutionStateSnapshot | null> {
    const [execution] = await this.db
      .select({
        id: schema.workflowExecutions.id,
        status: schema.workflowExecutions.status,
        completedSteps: schema.workflowExecutions.completedSteps,
        totalSteps: schema.workflowExecutions.totalSteps,
      })
      .from(schema.workflowExecutions)
      .where(
        and(
          eq(schema.workflowExecutions.id, executionId),
          eq(schema.workflowExecutions.tenantId, tenantId),
        ),
      );

    if (!execution) return null;

    const steps = await this.db
      .select({
        id: schema.executionSteps.id,
        nodeId: schema.executionSteps.nodeId,
        status: schema.executionSteps.status,
        startedAt: schema.executionSteps.startedAt,
        completedAt: schema.executionSteps.completedAt,
        errorMessage: schema.executionSteps.errorMessage,
        result: schema.executionSteps.result,
        checkpointData: schema.executionSteps.checkpointData,
      })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    const lastEventId = eventBridge?.getLastEventId(executionId) ?? 0;

    const snapshot: ExecutionStateSnapshot = {
      executionId,
      status: execution.status,
      completedSteps: execution.completedSteps ?? 0,
      totalSteps: execution.totalSteps ?? 0,
      steps: steps.map((step): StepSnapshot => ({
        stepId: step.id,
        nodeId: step.nodeId,
        status: step.status,
        startedAt: step.startedAt?.toISOString() ?? null,
        completedAt: step.completedAt?.toISOString() ?? null,
        ...(step.errorMessage
          ? {
              errorMessage: (step.errorMessage as { message: string }).message,
              errorDetail:
                step.errorMessage as unknown as StepSnapshot['errorDetail'],
            }
          : {}),
        result: step.result ?? null,
        checkpointData: step.checkpointData ?? null,
      })),
      snapshotAt: new Date().toISOString(),
      lastEventId,
    };

    this.logger.log(
      `Snapshot for ${executionId}: ${steps.length} steps, lastEventId=${lastEventId}`,
    );

    return snapshot;
  }
}
