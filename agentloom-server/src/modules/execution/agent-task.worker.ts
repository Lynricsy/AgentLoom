import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as schema from '../../database/schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { eq } from 'drizzle-orm';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import type { ContentBlock } from '../agent/types/content-block.types';
import type { AgentEvent } from '../agent/types/agent-event.types';
import { StepStateMachineService } from './step-state-machine.service';
import { NodeSchedulerService } from './node-scheduler.service';
import {
  AGENT_TASK_QUEUE,
  INTERVENTION_STOP_REASONS,
  type AgentTaskJobData,
} from './execution.constants';

@Processor(AGENT_TASK_QUEUE, { concurrency: 10 })
export class AgentTaskWorker extends WorkerHost {
  private readonly logger = new Logger(AgentTaskWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(AGENT_RUNTIME) private readonly agentRuntime: IAgentRuntime,
    private readonly stepStateMachine: StepStateMachineService,
    private readonly nodeScheduler: NodeSchedulerService,
  ) {
    super();
  }

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async process(job: Job<AgentTaskJobData>): Promise<void> {
    const { executionId, stepId, tenantId, resumeSessionId, feedbackContent } = job.data;
    this.logger.log(`Processing agent task: ${JSON.stringify({ executionId, stepId, resume: !!resumeSessionId })}`);

    const [step] = await this.tenantDb
      .select()
      .from(schema.executionSteps)
      .where(eq(schema.executionSteps.id, stepId));

    if (!step) {
      throw new Error(`步骤 ${stepId} 不存在`);
    }

    await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'running');

    const nodeData = (step.nodeData ?? {}) as Record<string, unknown>;
    const input = (step.input ?? {}) as Record<string, unknown>;
    let sessionId = resumeSessionId;
    let accumulatedContent = '';
    let lastStopReason: string | undefined;

    try {
      if (!sessionId) {
        const session = await this.agentRuntime.createSession({
          agentId: nodeData.agentId as string,
          mode: 'workflow',
          context: input,
        });
        sessionId = session.id;
      }

      const contentBlocks = resumeSessionId && feedbackContent
        ? [{ type: 'text' as const, text: feedbackContent }]
        : this.buildContentBlocks(nodeData, input);

      for await (const event of this.agentRuntime.prompt(sessionId, contentBlocks)) {
        this.stepStateMachine.broadcastAgentEvent(tenantId, executionId, stepId, event);

        if (event.type === 'message_chunk') {
          accumulatedContent += event.content;
        } else if (event.type === 'done') {
          lastStopReason = event.stopReason;
        }
      }

      if (lastStopReason && INTERVENTION_STOP_REASONS.has(lastStopReason)) {
        await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'waiting_intervention', {
          checkpointData: {
            sessionId,
            partialContent: accumulatedContent,
            stopReason: lastStopReason,
          },
          result: { content: accumulatedContent, stopReason: lastStopReason },
        });
        await this.stepStateMachine.updateExecutionStatus(executionId, tenantId);
        this.logger.log(`Agent task waiting intervention: ${JSON.stringify({ executionId, stepId })}`);
        return;
      }

      const result: Record<string, unknown> = { content: accumulatedContent };
      if (lastStopReason && lastStopReason !== 'end_turn') {
        result.stopReason = lastStopReason;
      }

      await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'completed', { result });
      await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);

      this.logger.log(`Agent task completed: ${JSON.stringify({ executionId, stepId })}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const failExtra: {
        errorMessage: { message: string; stack?: string };
        checkpointData?: Record<string, unknown>;
      } = {
        errorMessage: { message: err.message, stack: err.stack },
      };

      if (accumulatedContent || sessionId) {
        failExtra.checkpointData = {
          ...(accumulatedContent ? { partialContent: accumulatedContent } : {}),
          ...(sessionId ? { sessionId } : {}),
        };
      }

      await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'failed', failExtra);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<AgentTaskJobData> | undefined, error: Error): Promise<void> {
    if (!job?.data) {
      this.logger.error(`Agent task failed without job data: ${error.message}`);
      return;
    }

    const { stepId, tenantId } = job.data;
    this.logger.error(`Agent task failed: ${JSON.stringify({ stepId, error: error.message })}`);

    try {
      await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'failed', {
        errorMessage: { message: error.message, stack: error.stack },
      });
    } catch (updateError) {
      this.logger.error(
        `Failed to update step status on failure: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      );
    }
  }

  private buildContentBlocks(
    nodeData: Record<string, unknown>,
    input: Record<string, unknown>,
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    if (nodeData.systemPrompt && typeof nodeData.systemPrompt === 'string') {
      blocks.push({ type: 'text', text: nodeData.systemPrompt });
    }

    blocks.push({ type: 'text', text: JSON.stringify(input) });

    return blocks;
  }
}
