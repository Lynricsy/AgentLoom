import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { NotificationService } from './notification.service';

interface ExecutionStatusChangedEvent {
  tenantId: string;
  executionId: string;
  status: string;
  completedSteps?: number;
  totalSteps?: number;
  errorMessage?: string;
}

@Injectable()
export class NotificationListener {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notificationService: NotificationService,
  ) {}

  @OnEvent('execution.status.changed')
  async handleExecutionStatusChanged(
    event: ExecutionStatusChangedEvent,
  ): Promise<void> {
    const notificationInput = this.buildNotificationInput(event);

    if (!notificationInput) {
      return;
    }

    await runInTenantTransaction(this.db, event.tenantId, async (tenantDb) => {
      const [execution] = await tenantDb
        .select({ createdBy: schema.workflowExecutions.createdBy })
        .from(schema.workflowExecutions)
        .where(
          and(
            eq(schema.workflowExecutions.id, event.executionId),
            eq(schema.workflowExecutions.tenantId, event.tenantId),
          ),
        );

      if (!execution) {
        return;
      }

      await this.notificationService.create(event.tenantId, {
        userId: execution.createdBy,
        ...notificationInput,
      });
    });
  }

  private buildNotificationInput(event: ExecutionStatusChangedEvent): {
    type: schema.Notification['type'];
    title: string;
    body: Record<string, unknown>;
  } | null {
    switch (event.status) {
      case 'completed':
        return {
          type: 'execution_completed',
          title: '执行已完成',
          body: {
            executionId: event.executionId,
            status: event.status,
            completedSteps: event.completedSteps,
            totalSteps: event.totalSteps,
          },
        };
      case 'failed':
        return {
          type: 'execution_failed',
          title: '执行失败',
          body: {
            executionId: event.executionId,
            status: event.status,
            errorMessage: event.errorMessage,
          },
        };
      case 'paused':
        return {
          type: 'intervention_required',
          title: '执行需要人工介入',
          body: {
            executionId: event.executionId,
            status: event.status,
          },
        };
      default:
        return null;
    }
  }
}
