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

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

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
      })
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId));

    const lastEventId = eventBridge?.getLastEventId(executionId) ?? 0;

    const snapshot: ExecutionStateSnapshot = {
      executionId,
      status: execution.status,
      completedSteps: execution.completedSteps ?? 0,
      totalSteps: execution.totalSteps ?? 0,
      steps: steps.map(
        (step): StepSnapshot => ({
          stepId: step.id,
          nodeId: step.nodeId,
          status: step.status,
          startedAt: step.startedAt?.toISOString() ?? null,
          completedAt: step.completedAt?.toISOString() ?? null,
          ...(step.errorMessage
            ? {
                errorMessage: (
                  step.errorMessage as { message: string }
                ).message,
              }
            : {}),
        }),
      ),
      snapshotAt: new Date().toISOString(),
      lastEventId,
    };

    this.logger.log(
      `Snapshot for ${executionId}: ${steps.length} steps, lastEventId=${lastEventId}`,
    );

    return snapshot;
  }
}
