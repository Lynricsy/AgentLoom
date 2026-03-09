import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { eq } from 'drizzle-orm';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import {
  AGENT_RUNTIME_FACTORY,
  type IAgentAdapterFactory,
} from '../agent/agent-adapter.factory';
import type { ContentBlock } from '../agent/types/content-block.types';
import { StepStateMachineService } from './step-state-machine.service';
import { NodeSchedulerService } from './node-scheduler.service';
import { ThrottleService } from './services/throttle.service';
import { EventBridgeService } from './services/event-bridge.service';
import { AgentExecutionException } from './execution.exceptions';
import type { InterventionRequiredPayload } from './types/execution-event.types';
import {
  AGENT_TASK_QUEUE,
  type AgentTaskJobData,
  type InterventionResolution,
} from './execution.constants';

const isExecutionStepAttemptError = (
  value: unknown,
): value is schema.ExecutionStepAttemptError =>
  typeof value === 'object' &&
  value !== null &&
  'attempt' in value &&
  typeof value.attempt === 'number' &&
  'error' in value &&
  typeof value.error === 'string' &&
  'timestamp' in value &&
  typeof value.timestamp === 'string';

@Processor(AGENT_TASK_QUEUE, { concurrency: 10 })
export class AgentTaskWorker extends WorkerHost {
  private readonly logger = new Logger(AgentTaskWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(AGENT_RUNTIME) private readonly agentRuntime: IAgentRuntime,
    @Inject(AGENT_RUNTIME_FACTORY)
    private readonly adapterFactory: IAgentAdapterFactory,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly nodeScheduler: NodeSchedulerService,
    private readonly throttleService: ThrottleService,
    private readonly eventBridge: EventBridgeService,
  ) {
    super();
  }

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async process(job: Job<AgentTaskJobData>): Promise<void> {
    if (job.name === 'intervention-timeout') {
      await this.handleInterventionTimeout(job);
      return;
    }

    const {
      executionId,
      stepId,
      tenantId,
      resumeSessionId,
      intervention,
      hasSandbox,
    } = job.data;
    this.logger.log(`Processing agent task: ${JSON.stringify({ executionId, stepId, resume: !!resumeSessionId })}`);

    const [step] = await this.withTenantContext(tenantId, () =>
      this.tenantDb
        .select()
        .from(schema.executionSteps)
        .where(eq(schema.executionSteps.id, stepId)),
    );

    if (!step) {
      throw new Error(`步骤 ${stepId} 不存在`);
    }

    if (step.executionId !== executionId) {
      throw new AgentExecutionException(
        `步骤 ${stepId} 不属于执行 ${executionId}`,
      );
    }

    const runtime = hasSandbox
      ? this.adapterFactory.selectAdapter(true)
      : this.agentRuntime;

    const nodeData = (job.data.nodeData ?? step.nodeData ?? {}) as Record<
      string,
      unknown
    >;
    const input = (job.data.input ?? step.input ?? {}) as Record<string, unknown>;
    const workflowContext = {
      executionId,
      hasSandbox: Boolean(hasSandbox),
      input,
      nodeId: step.nodeId,
      stepId,
      tenantId,
      ...(job.data.workflowContext ?? {}),
    };
    let sessionId = resumeSessionId;
    let accumulatedContent = '';
    let lastStopReason: string | undefined;
    let decision: Record<string, unknown> | undefined;
    let chunkIndex = 0;

    try {
      await this.withTenantContext(tenantId, async () => {
        await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'running');
      });

      if (intervention) {
        await this.withTenantContext(tenantId, async () => {
          await this.handleIntervention({
            executionId,
            stepId,
            tenantId,
            step,
            intervention,
          });
        });
        return;
      }

      if (!sessionId) {
        const session = await runtime.createSession({
          agentId: nodeData.agentId as string,
          mode: 'workflow',
          tenantId,
          llmModelConfigId:
            typeof nodeData.llmModelConfigId === 'string'
              ? nodeData.llmModelConfigId
              : undefined,
          systemPrompt:
            typeof nodeData.systemPrompt === 'string'
              ? nodeData.systemPrompt
              : undefined,
          autonomyMode:
            typeof nodeData.autonomyMode === 'string'
              ? nodeData.autonomyMode
              : undefined,
          context: workflowContext,
        });
        sessionId = session.id;
      }

      const contentBlocks = this.buildContentBlocks(input);

      for await (const event of runtime.prompt(sessionId, contentBlocks)) {
        if (event.type === 'message_chunk') {
          accumulatedContent += event.content;
          this.throttleService.bufferOutputChunk(
            `${tenantId}:${executionId}`,
            stepId,
            event.content,
            chunkIndex++,
          );
        } else {
          this.stepStateMachine.broadcastAgentEvent(tenantId, executionId, stepId, event);

          if (event.type === 'decision') {
            decision = {
              suggestedContent: event.suggestedContent,
              ...(typeof event.confidence === 'number'
                ? { confidence: event.confidence }
                : {}),
              ...(event.rationale ? { rationale: event.rationale } : {}),
            };
          } else if (event.type === 'done') {
            lastStopReason = event.stopReason;
          }
        }
      }

      if (lastStopReason === 'intervention_required') {
        await this.withTenantContext(tenantId, async () => {
          await this.stepStateMachine.updateStepStatus(
            tenantId,
            stepId,
            'waiting_intervention',
            {
              checkpointData: {
                sessionId,
                partialContent: accumulatedContent,
                stopReason: lastStopReason,
                ...(decision ? { decision } : {}),
              },
              result: {
                content: accumulatedContent,
                stopReason: lastStopReason,
                ...(decision ? { decision } : {}),
              },
            },
          );
          await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
        });
        this.eventBridge.emitInterventionRequired(tenantId, executionId, {
          stepId,
          nodeId: step.nodeId,
          ...(decision ? { decision: decision as InterventionRequiredPayload['decision'] } : {}),
          ...(accumulatedContent ? { partialContent: accumulatedContent } : {}),
        });
        await this.nodeScheduler.enqueueInterventionTimeout(executionId, stepId, tenantId);
        this.logger.log(`Agent task waiting intervention: ${JSON.stringify({ executionId, stepId })}`);
        return;
      }

      const result: Record<string, unknown> = { content: accumulatedContent };
      if (lastStopReason && lastStopReason !== 'end_turn') {
        result.stopReason = lastStopReason;
      }
      if (decision) {
        result.decision = decision;
      }

      await this.withTenantContext(tenantId, async () => {
        await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'completed', {
          result,
        });
        await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
      });

      this.logger.log(`Agent task completed: ${JSON.stringify({ executionId, stepId })}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const existingCheckpoint = (step.checkpointData ?? {}) as Record<
        string,
        unknown
      >;
      const existingAttempts = Array.isArray(existingCheckpoint.attempts)
        ? existingCheckpoint.attempts.filter(isExecutionStepAttemptError)
        : [];
      const attemptRecord = {
        attempt: job.attemptsMade + 1,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      const allAttempts = [...existingAttempts, attemptRecord];

      const checkpointData: Record<string, unknown> = {
        ...existingCheckpoint,
        ...(accumulatedContent ? { partialContent: accumulatedContent } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(decision ? { decision } : {}),
        attempts: allAttempts,
      };

      if (this.shouldRetry(job)) {
        await this.withTenantContext(tenantId, async () => {
          await this.tenantDb
            .update(schema.executionSteps)
            .set({ attemptCount: job.attemptsMade + 1 })
            .where(eq(schema.executionSteps.id, stepId));

          await this.stepStateMachine.updateStepStatus(
            tenantId,
            stepId,
            'pending',
            {
              errorMessage: { message: err.message, stack: err.stack },
              checkpointData,
            },
          );
        });
        this.stepStateMachine.broadcastStepRetry(tenantId, executionId, stepId, {
          attempt: job.attemptsMade + 1,
          maxAttempts: this.getMaxAttempts(job),
          errorMessage: err.message,
        });
        throw err;
      }

      await this.withTenantContext(tenantId, async () => {
        await this.tenantDb
          .update(schema.executionSteps)
          .set({ attemptCount: job.attemptsMade + 1 })
          .where(eq(schema.executionSteps.id, stepId));

        await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'failed', {
          errorMessage: { message: err.message, stack: err.stack, attempts: allAttempts },
          checkpointData,
        });
        await this.nodeScheduler.onNodeFailed(executionId, stepId, tenantId);
      });
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AgentTaskJobData> | undefined, error: Error): Promise<void> {
    if (!job?.data) {
      this.logger.error(`Agent task failed without job data: ${error.message}`);
      return;
    }

    const { executionId, stepId, tenantId } = job.data;
    this.logger.error(
      `Agent task failed: ${JSON.stringify({ stepId, executionId, tenantId, attempt: job.attemptsMade + 1, maxAttempts: this.getMaxAttempts(job), error: error.message })}`,
    );
  }

  private async handleIntervention(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
    intervention: InterventionResolution;
  }): Promise<void> {
    const { executionId, stepId, tenantId, step, intervention } = params;
    const checkpointData = (step.checkpointData ?? {}) as Record<string, unknown>;
    const resolvedContent = this.resolveInterventionContent(
      intervention,
      checkpointData,
    );

    if (intervention.action === 'reject') {
      await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'failed', {
        errorMessage: {
          message: intervention.feedback?.trim() || '人工干预拒绝了该步骤输出',
        },
        checkpointData: {
          ...checkpointData,
          intervention,
        },
      });
      await this.nodeScheduler.onNodeFailed(executionId, stepId, tenantId);
      return;
    }

    const result: Record<string, unknown> = {
      content: resolvedContent,
      intervention: {
        action: intervention.action,
        ...(intervention.feedback ? { feedback: intervention.feedback } : {}),
        ...(intervention.action === 'modify'
          ? { modifiedContent: intervention.modifiedContent }
          : {}),
      },
    };

    const stopReason = checkpointData.stopReason;
    if (typeof stopReason === 'string' && stopReason !== 'end_turn') {
      result.stopReason = stopReason;
    }

    const decision = checkpointData.decision;
    if (decision && typeof decision === 'object') {
      result.decision = decision;
    }

    await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'completed', {
      result,
      checkpointData: {
        ...checkpointData,
        intervention,
      },
    });
    await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
  }

  private resolveInterventionContent(
    intervention: InterventionResolution,
    checkpointData: Record<string, unknown>,
  ): string {
    if (intervention.action === 'modify') {
      return intervention.modifiedContent ?? '';
    }

    const decision = checkpointData.decision;
    if (
      decision &&
      typeof decision === 'object' &&
      'suggestedContent' in decision &&
      typeof decision.suggestedContent === 'string'
    ) {
      return decision.suggestedContent;
    }

    const partialContent = checkpointData.partialContent;
    if (typeof partialContent === 'string') {
      return partialContent;
    }

    return '';
  }

  private buildContentBlocks(input: Record<string, unknown>): ContentBlock[] {
    return [{ type: 'text', text: JSON.stringify(input) }];
  }

  private async handleInterventionTimeout(job: Job<AgentTaskJobData>): Promise<void> {
    const { executionId, stepId, tenantId } = job.data;
    this.logger.log(`Processing intervention timeout: ${JSON.stringify({ executionId, stepId })}`);

    const [step] = await this.withTenantContext(tenantId, () =>
      this.tenantDb
        .select()
        .from(schema.executionSteps)
        .where(eq(schema.executionSteps.id, stepId)),
    );

    if (!step || step.status !== 'waiting_intervention') {
      this.logger.log(`Intervention timeout skipped (status: ${step?.status ?? 'not-found'}): ${JSON.stringify({ executionId, stepId })}`);
      return;
    }

    await this.withTenantContext(tenantId, () =>
      this.nodeScheduler.resolveIntervention(executionId, stepId, tenantId, {
        action: 'reject',
        feedback: '干预超时，系统自动拒绝',
      }),
    );
    this.logger.log(`Intervention timeout auto-rejected: ${JSON.stringify({ executionId, stepId })}`);
  }

  private shouldRetry(job: Job<AgentTaskJobData>): boolean {
    return job.attemptsMade + 1 < this.getMaxAttempts(job);
  }

  private getMaxAttempts(job: Job<AgentTaskJobData>): number {
    return typeof job.opts.attempts === 'number' && job.opts.attempts > 0
      ? job.opts.attempts
      : 1;
  }

  private async withTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runInTenantTransaction(this.db, tenantId, async () => operation());
  }
}
