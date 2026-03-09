import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  ExecutionNotFoundException,
  WorkflowNotPublishedException,
  ExecutionNotCancellableException,
} from './execution.exceptions';
import { ExecutionGateway } from './execution.gateway';
import { EXECUTION_QUEUE } from './execution.constants';

export interface ExecutionJobData {
  executionId: string;
  tenantId: string;
}

const CANCELLABLE_STATUSES = new Set(['pending', 'running', 'paused']);

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    private readonly executionGateway: ExecutionGateway,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async runWorkflow(
    workflowId: string,
    tenantId: string,
    userId: string,
  ): Promise<schema.WorkflowExecution> {
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (!workflow || workflow.status !== 'published' || !workflow.publishedVersionId) {
      throw new WorkflowNotPublishedException(workflowId);
    }

    const [publishedVersion] = await this.tenantDb
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, workflow.publishedVersionId));

    const [execution] = await this.tenantDb
      .insert(schema.workflowExecutions)
      .values({
        workflowDefinitionId: workflowId,
        workflowVersionId: workflow.publishedVersionId,
        tenantId,
        status: 'pending',
        definitionSnapshot: publishedVersion.snapshot,
        createdBy: userId,
      })
      .returning();

    await this.executionQueue.add('execute', {
      executionId: execution.id,
      tenantId,
    } satisfies ExecutionJobData);

    this.logger.log(
      `Workflow execution created: ${JSON.stringify({ executionId: execution.id, workflowId })}`,
    );

    return execution;
  }

  async getExecution(executionId: string): Promise<
    schema.WorkflowExecution & { steps: schema.ExecutionStep[] }
  > {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    const steps = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.executionId, executionId))
      .orderBy(schema.executionSteps.stepOrder);

    return { ...execution, steps };
  }

  async listExecutions(
    workflowId: string,
    page: number,
    pageSize: number,
    status?: string,
  ) {
    const conditions = [
      eq(schema.workflowExecutions.workflowDefinitionId, workflowId),
    ];

    if (status) {
      conditions.push(
        eq(
          schema.workflowExecutions.status,
          status as schema.WorkflowExecution['status'],
        ),
      );
    }

    const whereClause = and(...conditions);

    const [results, countResult] = await Promise.all([
      this.tenantDb
        .select()
        .from(schema.workflowExecutions)
        .where(whereClause)
        .orderBy(desc(schema.workflowExecutions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workflowExecutions)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: results,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async cancelExecution(
    executionId: string,
    tenantId: string,
  ): Promise<schema.WorkflowExecution> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    if (!CANCELLABLE_STATUSES.has(execution.status)) {
      throw new ExecutionNotCancellableException(executionId, execution.status);
    }

    const [updated] = await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowExecutions.id, executionId))
      .returning();

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          eq(schema.executionSteps.status, 'pending'),
        ),
      );

    await this.tenantDb
      .update(schema.executionSteps)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.executionSteps.executionId, executionId),
          eq(schema.executionSteps.status, 'queued'),
        ),
      );

    const jobs = await this.executionQueue.getJobs([
      'waiting',
      'delayed',
      'active',
    ]);
    for (const job of jobs) {
      if ((job.data as ExecutionJobData).executionId === executionId) {
        await job.remove();
      }
    }

    this.executionGateway.broadcastEvent(tenantId, executionId, 'execution:cancelled', {
      executionId,
      status: 'cancelled',
    });

    this.logger.log(`Execution cancelled: ${JSON.stringify({ executionId })}`);

    return updated;
  }

  async initializeSteps(executionId: string): Promise<void> {
    const [execution] = await this.tenantDb
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowExecutions.id, executionId));

    const { nodes } = execution.definitionSnapshot;
    const stepValues = nodes.map((node, index) => ({
      executionId,
      nodeId: node.id,
      stepOrder: index,
      status: 'pending' as const,
      nodeType: node.type ?? null,
      nodeData: node.data ?? null,
    }));

    if (stepValues.length > 0) {
      await this.tenantDb
        .insert(schema.executionSteps)
        .values(stepValues);
    }

    await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        totalSteps: stepValues.length,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowExecutions.id, executionId));

    this.executionGateway.broadcastEvent(
      execution.tenantId,
      executionId,
      'execution:completed',
      { executionId, status: 'completed', totalSteps: stepValues.length },
    );

    this.logger.log(
      `Steps initialized: ${JSON.stringify({ executionId, totalSteps: stepValues.length })}`,
    );
  }

  async markFailed(executionId: string, error: Error): Promise<void> {
    await this.tenantDb
      .update(schema.workflowExecutions)
      .set({
        status: 'failed',
        failedAt: new Date(),
        errorMessage: {
          message: error.message,
          stack: error.stack,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowExecutions.id, executionId));

    const [execution] = await this.tenantDb
      .select({ tenantId: schema.workflowExecutions.tenantId })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (execution) {
      this.executionGateway.broadcastEvent(
        execution.tenantId,
        executionId,
        'execution:failed',
        { executionId, status: 'failed', error: error.message },
      );
    }

    this.logger.error(
      `Execution failed: ${JSON.stringify({ executionId, error: error.message })}`,
    );
  }
}
