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
import { ToolCallStateMachineService } from './services/tool-call-state-machine.service';
import { SessionPersistenceService } from './services/session-persistence.service';
import {
  AgentExecutionException,
  InterventionNotAllowedException,
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from './execution.exceptions';
import type {
  InterventionCheckpointRecord,
  InterventionDecision,
  InterventionRequiredPayload,
} from './types/execution-event.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import {
  AGENT_TASK_QUEUE,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type AgentTaskJobData,
  type InterventionResolution,
  type ToolPermissionResolution,
} from './execution.constants';

const MAX_TOOL_CALL_ROUNDS = 10;

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
    private readonly toolCallStateMachine: ToolCallStateMachineService,
    private readonly sessionPersistence: SessionPersistenceService,
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
      toolPermission,
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

      if (toolPermission) {
        runtime.registerSessionMetadata?.(sessionId!, tenantId, stepId);
        accumulatedContent = this.loadPartialContentFromCheckpoint(step);
        const contentBlocks = await this.resolveToolPermissionAndBuildBlocks({
            executionId,
            stepId,
            tenantId,
            step,
            toolPermission,
            nodeId: step.nodeId,
          });
        const loopResult = await this.executeMultiTurnLoop({
          runtime,
          sessionId: sessionId!,
          initialContentBlocks: contentBlocks,
          executionId,
          stepId,
          tenantId,
          nodeId: step.nodeId,
          nodeData,
          accumulatedContent,
          decision,
          chunkIndex,
        });

        if (loopResult.waitingPermission) {
          this.logger.log(
            `Agent task awaiting tool permission: ${JSON.stringify({ executionId, stepId })}`,
          );
          return;
        }

        accumulatedContent = loopResult.accumulatedContent;
        lastStopReason = loopResult.lastStopReason;
        decision = loopResult.decision;
      } else {
        await this.withTenantContext(tenantId, async () => {
          await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'running');
        });

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

        const initialContentBlocks = this.buildContentBlocks(input);
        const loopResult = await this.executeMultiTurnLoop({
          runtime,
          sessionId: sessionId!,
          initialContentBlocks,
          executionId,
          stepId,
          tenantId,
          nodeId: step.nodeId,
          nodeData,
          accumulatedContent,
          decision,
          chunkIndex,
        });

        if (loopResult.waitingPermission) {
          this.logger.log(
            `Agent task awaiting tool permission: ${JSON.stringify({ executionId, stepId })}`,
          );
          return;
        }

        accumulatedContent = loopResult.accumulatedContent;
        lastStopReason = loopResult.lastStopReason;
        decision = loopResult.decision;
      }

      if (lastStopReason === 'intervention_required') {
        const requestedAt = new Date().toISOString();
        const nodeName = this.resolveNodeName(step);
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
                interventionRequestedAt: requestedAt,
                interventionNodeName: nodeName,
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
          nodeName,
          ...(decision ? { decision: decision as InterventionRequiredPayload['decision'] } : {}),
          ...(accumulatedContent ? { partialContent: accumulatedContent } : {}),
          requestedAt,
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
    const interventionRecord = this.resolveInterventionRecord(
      checkpointData,
      intervention,
    );
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
          intervention: interventionRecord,
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
        intervention: interventionRecord,
      },
    });
    await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
  }

  private resolveInterventionRecord(
    checkpointData: Record<string, unknown>,
    intervention: InterventionResolution,
  ): InterventionCheckpointRecord {
    const existing = checkpointData.intervention;
    if (
      existing &&
      typeof existing === 'object' &&
      typeof (existing as { requested_at?: unknown }).requested_at === 'string' &&
      typeof (existing as { resolved_at?: unknown }).resolved_at === 'string' &&
      typeof (existing as { action?: unknown }).action === 'string' &&
      typeof (existing as { resolved_by_user_id?: unknown }).resolved_by_user_id ===
        'string'
    ) {
      return {
        ...(existing as InterventionCheckpointRecord),
        ...(intervention.timeout ? { timeout: true } : {}),
      };
    }

    const requestedAt =
      intervention.requestedAt ??
      (typeof checkpointData.interventionRequestedAt === 'string'
        ? checkpointData.interventionRequestedAt
        : new Date().toISOString());
    const resolvedAt = intervention.resolvedAt ?? new Date().toISOString();
    const instruction =
      intervention.modifiedContent ?? intervention.feedback ?? null;

    return {
      requested_at: requestedAt,
      resolved_at: resolvedAt,
      action: intervention.action,
      instruction,
      resolved_by_user_id:
        intervention.resolvedByUserId ?? SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
      ...(intervention.timeout ? { timeout: true } : {}),
    };
  }

  private resolveInterventionContent(
    intervention: InterventionResolution,
    checkpointData: Record<string, unknown>,
  ): unknown {
    if (intervention.action === 'modify') {
      return intervention.modifiedContent ?? '';
    }

    const decision = checkpointData.decision;
    if (
      decision &&
      typeof decision === 'object' &&
      'suggestedContent' in decision
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

  private loadPartialContentFromCheckpoint(
    step: typeof schema.executionSteps.$inferSelect,
  ): string {
    const checkpointData = (step.checkpointData ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof checkpointData.partialContent === 'string') {
      return checkpointData.partialContent;
    }
    return '';
  }

  private async resolveToolPermissionAndBuildBlocks(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
    toolPermission: ToolPermissionResolution;
    nodeId: string;
  }): Promise<ContentBlock[]> {
    const { executionId, stepId, tenantId, step, toolPermission, nodeId } =
      params;
    const checkpointData = (step.checkpointData ?? {}) as Record<
      string,
      unknown
    >;
    const toolCalls = Array.isArray(checkpointData.toolCalls)
      ? (checkpointData.toolCalls as ToolCallEvent[])
      : [];

    const toolCall = toolCalls.find(
      (tc) => tc.id === toolPermission.toolCallId,
    );
    if (!toolCall) {
      throw new ToolCallNotFoundException(toolPermission.toolCallId);
    }

    if (toolCall.status !== 'awaiting_permission') {
      throw new ToolPermissionResolutionNotAllowedException(
        toolPermission.toolCallId,
        toolCall.status,
      );
    }

    const newStatus =
      toolPermission.action === 'approve' ? 'in_progress' : 'denied';
    toolCall.status = this.toolCallStateMachine.transition(
      toolCall.status,
      newStatus,
    );

    this.eventBridge.emitToolPermissionResolved(tenantId, executionId, {
      stepId,
      nodeId,
      toolCallId: toolPermission.toolCallId,
      action: toolPermission.action,
    });

    const updatedToolCalls = toolCalls.map((tc) =>
      tc.id === toolPermission.toolCallId ? toolCall : tc,
    );
    await this.withTenantContext(tenantId, async () => {
      await this.stepStateMachine.updateStepStatus(tenantId, stepId, 'running', {
        checkpointData: {
          ...checkpointData,
          toolCalls: updatedToolCalls,
        },
      });
    });

    if (toolPermission.action === 'deny') {
      return [
        {
          type: 'text' as const,
          text: `Tool call "${toolCall.tool}" (ID: ${toolCall.id}) was denied by the user.`,
        },
      ];
    }

    // Approve returns empty — runtime continues tool execution internally
    return [];
  }

  private async executeMultiTurnLoop(params: {
    runtime: IAgentRuntime;
    sessionId: string;
    initialContentBlocks: ContentBlock[];
    executionId: string;
    stepId: string;
    tenantId: string;
    nodeId: string;
    nodeData: Record<string, unknown>;
    accumulatedContent: string;
    decision?: Record<string, unknown>;
    chunkIndex: number;
  }): Promise<{
    waitingPermission: boolean;
    accumulatedContent: string;
    lastStopReason?: string;
    decision?: Record<string, unknown>;
  }> {
    let { accumulatedContent, decision, chunkIndex } = params;
    let contentBlocks = params.initialContentBlocks;
    let lastStopReason: string | undefined;
    const autonomyMode =
      typeof params.nodeData.autonomyMode === 'string'
        ? params.nodeData.autonomyMode
        : 'FULL_AUTO';

    for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
      const toolCalls: ToolCallEvent[] = [];
      lastStopReason = undefined;

      for await (const event of params.runtime.prompt(
        params.sessionId,
        contentBlocks,
      )) {
        if (event.type === 'message_chunk') {
          accumulatedContent += event.content;
          chunkIndex++;
          this.eventBridge.emitOutputChunk(
            params.tenantId,
            params.executionId,
            {
              stepId: params.stepId,
              chunk: event.content,
              index: chunkIndex,
            },
          );
        } else if (event.type === 'tool_call') {
          const toolCallEvent: ToolCallEvent = {
            ...event.call,
            status: 'pending',
          };
          toolCalls.push(toolCallEvent);
          this.eventBridge.emitToolCallStatus(
            params.tenantId,
            params.executionId,
            {
              stepId: params.stepId,
              nodeId: params.nodeId,
              toolCallId: toolCallEvent.id,
              tool: toolCallEvent.tool,
              status: toolCallEvent.status,
              args: toolCallEvent.args,
            },
          );
        } else if (event.type === 'decision') {
          decision = event.decision as Record<string, unknown>;
        } else if (event.type === 'done') {
          lastStopReason = event.stopReason;
        }
      }

      if (lastStopReason !== 'tool_use' || toolCalls.length === 0) {
        break;
      }

      if (autonomyMode === 'FULL_AUTO') {
        for (const tc of toolCalls) {
          tc.status = this.toolCallStateMachine.transition(
            tc.status,
            'in_progress',
          );
          this.eventBridge.emitToolCallStatus(
            params.tenantId,
            params.executionId,
            {
              stepId: params.stepId,
              nodeId: params.nodeId,
              toolCallId: tc.id,
              tool: tc.tool,
              status: tc.status,
              args: tc.args,
            },
          );
        }
        contentBlocks = [];
      } else {
        for (const tc of toolCalls) {
          tc.status = this.toolCallStateMachine.transition(
            tc.status,
            'awaiting_permission',
          );
          this.eventBridge.emitToolPermissionRequired(
            params.tenantId,
            params.executionId,
            {
              stepId: params.stepId,
              nodeId: params.nodeId,
              toolCallId: tc.id,
              tool: tc.tool,
              args: tc.args,
              ...(tc.permissionRequest
                ? { permissionRequest: tc.permissionRequest }
                : {}),
            },
          );
        }

        await this.withTenantContext(params.tenantId, async () => {
          await this.stepStateMachine.updateStepStatus(
            params.tenantId,
            params.stepId,
            'waiting_intervention',
            {
              checkpointData: {
                sessionId: params.sessionId,
                partialContent: accumulatedContent,
                toolCalls,
                round,
                chunkIndex,
                ...(decision ? { decision } : {}),
              },
            },
          );
        });

        return {
          waitingPermission: true,
          accumulatedContent,
          lastStopReason,
          decision,
        };
      }
    }

    return {
      waitingPermission: false,
      accumulatedContent,
      lastStopReason,
      decision,
    };
  }

  private resolveNodeName(step: typeof schema.executionSteps.$inferSelect): string {
    const nodeData = step.nodeData as Record<string, unknown> | null;
    if (nodeData && typeof nodeData.label === 'string' && nodeData.label.trim()) {
      return nodeData.label.trim();
    }

    return step.nodeId;
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

    try {
      await this.withTenantContext(tenantId, () =>
        this.nodeScheduler.resolveIntervention(
          executionId,
          stepId,
          tenantId,
          SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
          {
            action: 'reject',
            feedback: '干预超时，系统自动拒绝',
            timeout: true,
          },
        ),
      );
    } catch (error) {
      if (error instanceof InterventionNotAllowedException) {
        this.logger.warn(
          `Intervention timeout skipped because step already resumed: ${JSON.stringify({ executionId, stepId })}`,
        );
        return;
      }

      throw error;
    }
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
