import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, type Job, type JobType } from 'bullmq';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import {
  DeadLetterJobNotFoundException,
  ExecutionNotFoundException,
  WorkflowNotPublishedException,
  ExecutionNotCancellableException,
  WorkflowArchivedException,
} from './execution.exceptions';
import { ExecutionGateway } from './execution.gateway';
import { EventBridgeService } from './services/event-bridge.service';
import {
  EXECUTION_QUEUE,
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
} from './execution.constants';
import type { RunWorkflowDto } from './dto/run-workflow.dto';

export interface ExecutionJobData {
  executionId: string;
  tenantId: string;
}

const CANCELLABLE_STATUSES = new Set(['pending', 'running', 'paused']);
const REMOVABLE_JOB_STATES: JobType[] = ['waiting', 'delayed', 'prioritized'];
const TERMINAL_EXECUTION_STATUSES = new Set(['cancelled', 'completed', 'failed']);

function isRemovableJobState(state: string): state is JobType {
  return REMOVABLE_JOB_STATES.includes(state as JobType);
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @InjectQueue(EXECUTION_QUEUE) private readonly executionQueue: Queue,
    @InjectQueue(AGENT_TASK_QUEUE) private readonly agentTaskQueue: Queue,
    private readonly eventBridge: EventBridgeService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async runWorkflow(
    workflowId: string,
    runRequest: RunWorkflowDto | undefined,
    tenantId: string,
    userId: string,
  ): Promise<schema.WorkflowExecution> {
    const [workflow] = await this.tenantDb
      .select()
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.id, workflowId));

    if (workflow?.status === 'archived') {
      throw new WorkflowArchivedException(workflowId);
    }

    if (
      !workflow ||
      workflow.status !== 'published' ||
      !workflow.publishedVersionId
    ) {
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
        triggerType: 'manual',
        inputParams: runRequest?.inputParams ?? {},
        definitionSnapshot: publishedVersion.snapshot,
        createdBy: userId,
      })
      .returning();

    await this.executionQueue.add(
      'execute',
      {
        executionId: execution.id,
        tenantId,
      } satisfies ExecutionJobData,
      {
        jobId: execution.id,
      },
    );

    this.logger.log(
      `Workflow execution created: ${JSON.stringify({ executionId: execution.id, workflowId })}`,
    );

    return execution;
  }

  async getExecution(
    executionId: string,
  ): Promise<schema.WorkflowExecution & { steps: schema.ExecutionStep[] }> {
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
    limit: number,
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
        .limit(limit)
        .offset((page - 1) * limit),
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
        limit,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
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
          inArray(schema.executionSteps.status, ['pending', 'queued']),
        ),
      );

    const queuedJob = await this.executionQueue.getJob(executionId);

    if (queuedJob) {
      const state = await queuedJob.getState();

      if (isRemovableJobState(state)) {
        await queuedJob.remove();
      } else {
        this.logger.warn(
          `Skip removing active execution job: ${JSON.stringify({ executionId, state })}`,
        );
      }
    } else {
      const jobs = await this.executionQueue.getJobs(REMOVABLE_JOB_STATES);
      for (const job of jobs) {
        if ((job.data as ExecutionJobData).executionId === executionId) {
          await job.remove();
          break;
        }
      }
    }

    this.eventBridge.emitExecutionStatusChanged(
      tenantId,
      executionId,
      {
        executionId,
        status: 'cancelled',
      },
    );

    this.logger.log(`Execution cancelled: ${JSON.stringify({ executionId })}`);

    return updated;
  }

  async initializeSteps(executionId: string): Promise<void> {
    const execution = await this.getExecutionRecord(executionId);

    await runInTenantTransaction(
      this.db,
      execution.tenantId,
      async (tenantDb) => {
        const [scopedExecution] = await tenantDb
          .select()
          .from(schema.workflowExecutions)
          .where(eq(schema.workflowExecutions.id, executionId));

        if (!scopedExecution) {
          throw new ExecutionNotFoundException(executionId);
        }

        if (TERMINAL_EXECUTION_STATUSES.has(scopedExecution.status)) {
          this.logger.warn(
            `Skip step initialization for terminal execution: ${JSON.stringify({ executionId, status: scopedExecution.status })}`,
          );
          return;
        }

        const { nodes } = scopedExecution.definitionSnapshot;
        const existingSteps = await tenantDb
          .select()
          .from(schema.executionSteps)
          .where(eq(schema.executionSteps.executionId, executionId));
        const stepValues = nodes.map((node, index) => ({
          executionId,
          nodeId: node.id,
          stepOrder: index,
          status: 'pending' as const,
          nodeType: node.type ?? null,
          nodeData: node.data ?? null,
        }));

        const shouldCompleteImmediately = stepValues.length === 0;

        if (scopedExecution.status === 'pending') {
          const [preparedExecution] = await tenantDb
            .update(schema.workflowExecutions)
            .set({
              status: shouldCompleteImmediately ? 'completed' : 'running',
              totalSteps: stepValues.length,
              startedAt: new Date(),
              ...(shouldCompleteImmediately ? { completedAt: new Date() } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.workflowExecutions.id, executionId),
                eq(schema.workflowExecutions.status, 'pending'),
              ),
            )
            .returning({ status: schema.workflowExecutions.status });

          if (!preparedExecution) {
            const [latestExecution] = await tenantDb
              .select({ status: schema.workflowExecutions.status })
              .from(schema.workflowExecutions)
              .where(eq(schema.workflowExecutions.id, executionId));

            this.logger.warn(
              `Skip step initialization after concurrent status change: ${JSON.stringify({ executionId, status: latestExecution?.status ?? 'unknown' })}`,
            );
            return;
          }
        } else if (!['running', 'paused'].includes(scopedExecution.status)) {
          this.logger.warn(
            `Skip step initialization for unsupported execution status: ${JSON.stringify({ executionId, status: scopedExecution.status })}`,
          );
          return;
        }

        if (stepValues.length > 0 && existingSteps.length === 0) {
          await tenantDb.insert(schema.executionSteps).values(stepValues);
        }

        this.logger.log(
          `Execution prepared: ${JSON.stringify({ executionId, totalSteps: stepValues.length, existingSteps: existingSteps.length, status: shouldCompleteImmediately ? 'completed' : 'running' })}`,
        );

        if (shouldCompleteImmediately) {
          this.eventBridge.emitExecutionStatusChanged(
            scopedExecution.tenantId,
            executionId,
            { executionId, status: 'completed', totalSteps: 0 },
          );
        }
      },
    );
  }

  async markFailed(executionId: string, error: Error): Promise<void> {
    const [execution] = await this.db
      .select({ tenantId: schema.workflowExecutions.tenantId })
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      this.logger.warn(
        `Skip failure update for missing execution: ${JSON.stringify({ executionId })}`,
      );
      return;
    }

    await runInTenantTransaction(
      this.db,
      execution.tenantId,
      async (tenantDb) => {
        const [updatedExecution] = await tenantDb
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
          .where(
            and(
              eq(schema.workflowExecutions.id, executionId),
              inArray(schema.workflowExecutions.status, [
                'pending',
                'running',
                'paused',
              ]),
            ),
          )
          .returning({ id: schema.workflowExecutions.id });

        if (!updatedExecution) {
          const [currentExecution] = await tenantDb
            .select({ status: schema.workflowExecutions.status })
            .from(schema.workflowExecutions)
            .where(eq(schema.workflowExecutions.id, executionId));

          this.logger.warn(
            `Skip failure update for terminal execution: ${JSON.stringify({ executionId, status: currentExecution?.status ?? 'unknown' })}`,
          );
          return;
        }

        this.eventBridge.emitExecutionStatusChanged(
          execution.tenantId,
          executionId,
          { executionId, status: 'failed', errorMessage: error.message },
        );
      },
    );

    this.logger.error(
      `Execution failed: ${JSON.stringify({ executionId, error: error.message })}`,
    );
  }

  private async getExecutionRecord(
    executionId: string,
  ): Promise<schema.WorkflowExecution> {
    const [execution] = await this.db
      .select()
      .from(schema.workflowExecutions)
      .where(eq(schema.workflowExecutions.id, executionId));

    if (!execution) {
      throw new ExecutionNotFoundException(executionId);
    }

    return execution;
  }

  // ──── Dead Letter Queue (DLQ) ────

  async getDeadLetterJobs(tenantId: string, page = 1, limit = 20) {
    const counts = await this.agentTaskQueue.getJobCounts('failed');
    const failedCount = counts.failed;

    if (failedCount === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const jobs = await this.agentTaskQueue.getFailed(0, failedCount - 1);
    const tenantJobs = jobs.filter(
      (job) => this.getDeadLetterJobTenantId(job) === tenantId,
    );
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedJobs = tenantJobs.slice(start, end);

    return {
      data: paginatedJobs.map((job) => ({
        jobId: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
      })),
      meta: {
        total: tenantJobs.length,
        page,
        limit,
        totalPages: Math.ceil(tenantJobs.length / limit),
      },
    };
  }

  async retryDeadLetterJob(tenantId: string, jobId: string): Promise<void> {
    const job = await this.agentTaskQueue.getJob(jobId);
    this.assertDeadLetterJobAccess(job, tenantId, jobId);
    await job.retry();
    this.logger.log(`DLQ job retried: ${jobId}`);
  }

  async discardDeadLetterJob(tenantId: string, jobId: string): Promise<void> {
    const job = await this.agentTaskQueue.getJob(jobId);
    this.assertDeadLetterJobAccess(job, tenantId, jobId);
    await job.remove();
    this.logger.log(`DLQ job discarded: ${jobId}`);
  }

  private getDeadLetterJobTenantId(
    job: {
      data?: unknown;
    } | null | undefined,
  ): string | undefined {
    const data = job?.data;

    if (!this.hasTenantIdField(data) || typeof data.tenantId !== 'string') {
      return undefined;
    }

    return data.tenantId;
  }

  private hasTenantIdField(data: unknown): data is { tenantId?: unknown } {
    return typeof data === 'object' && data !== null && 'tenantId' in data;
  }

  private assertDeadLetterJobAccess(
    job: Job<unknown, unknown, string> | null | undefined,
    tenantId: string,
    jobId: string,
  ): asserts job is Job<AgentTaskJobData> {
    if (!job || this.getDeadLetterJobTenantId(job) !== tenantId) {
      throw new DeadLetterJobNotFoundException(jobId);
    }
  }
}
