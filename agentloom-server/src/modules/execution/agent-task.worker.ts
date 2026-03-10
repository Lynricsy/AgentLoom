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
import type { CreateSessionParams } from '../agent/types/agent-session.types';
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
import type {
  ToolCallEvent,
  ToolCallStatus,
  ToolCallTransitionSource,
} from '../agent/types/tool-call-event.types';
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
    const workflowContextExtras = (job.data.workflowContext ?? {}) as Record<
      string,
      unknown
    >;
    const mcpServers = this.resolveSessionMcpServers(
      workflowContextExtras.mcpServers,
    );
    const workflowContext = {
      executionId,
      hasSandbox: Boolean(hasSandbox),
      input,
      nodeId: step.nodeId,
      stepId,
      tenantId,
      ...workflowContextExtras,
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
        const toolLoopState = this.loadToolLoopStateFromCheckpoint(step);
        accumulatedContent = toolLoopState.partialContent;
        decision = toolLoopState.decision;
        chunkIndex = toolLoopState.chunkIndex;
        const contentBlocks = await this.resolveToolPermissionAndBuildBlocks({
          executionId,
          stepId,
          tenantId,
          step,
          toolPermission,
          nodeId: step.nodeId,
        });
        const resumedToolLoopState = this.loadToolLoopStateFromCheckpoint(step);
        const loopResult = await this.executeMultiTurnLoop({
          runtime,
          step,
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
          startRound: resumedToolLoopState.round,
          existingToolCalls: resumedToolLoopState.toolCalls,
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
            mcpServers,
            context: workflowContext,
          });
          sessionId = session.id;
          step.checkpointData = {
            ...this.getCheckpointData(step),
            session: this.sessionPersistence.serializeSession(session),
          };
        }

        const initialContentBlocks = this.buildContentBlocks(input);
        const loopResult = await this.executeMultiTurnLoop({
          runtime,
          step,
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
          startRound: 0,
          existingToolCalls: this.loadToolLoopStateFromCheckpoint(step).toolCalls,
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

      const errorPartial =
        typeof (error as Record<string, unknown>)?.partialContent === 'string'
          ? ((error as Record<string, unknown>).partialContent as string)
          : '';
      const finalAccumulatedContent = errorPartial || accumulatedContent;

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
        ...(finalAccumulatedContent
          ? { partialContent: finalAccumulatedContent }
          : {}),
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

  private resolveSessionMcpServers(
    value: unknown,
  ): CreateSessionParams['mcpServers'] {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as CreateSessionParams['mcpServers'])
      : undefined;
  }

  private getCheckpointData(
    step: typeof schema.executionSteps.$inferSelect,
  ): Record<string, unknown> {
    return (step.checkpointData ?? {}) as Record<string, unknown>;
  }

  private loadToolLoopStateFromCheckpoint(
    step: typeof schema.executionSteps.$inferSelect,
  ): {
    partialContent: string;
    chunkIndex: number;
    round: number;
    decision?: Record<string, unknown>;
    toolCalls: ToolCallEvent[];
  } {
    const checkpointData = this.getCheckpointData(step);

    return {
      partialContent:
        typeof checkpointData.partialContent === 'string'
          ? checkpointData.partialContent
          : '',
      chunkIndex:
        typeof checkpointData.chunkIndex === 'number'
          ? checkpointData.chunkIndex
          : 0,
      round:
        typeof checkpointData.round === 'number' ? checkpointData.round : 0,
      decision:
        typeof checkpointData.decision === 'object' &&
        checkpointData.decision !== null &&
        !Array.isArray(checkpointData.decision)
          ? (checkpointData.decision as Record<string, unknown>)
          : undefined,
      toolCalls: Array.isArray(checkpointData.toolCalls)
        ? (checkpointData.toolCalls as ToolCallEvent[])
        : [],
    };
  }

  private async mergeCheckpointData(
    tenantId: string,
    step: typeof schema.executionSteps.$inferSelect,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const checkpointData = {
      ...this.getCheckpointData(step),
      ...patch,
    };

    await this.withTenantContext(tenantId, async () => {
      await this.tenantDb
        .update(schema.executionSteps)
        .set({ checkpointData })
        .where(eq(schema.executionSteps.id, step.id));
    });

    step.checkpointData = checkpointData;
    return checkpointData;
  }

  private async saveToolLoopCheckpoint(params: {
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
    sessionId: string;
    partialContent: string;
    toolCalls: ToolCallEvent[];
    round: number;
    chunkIndex: number;
    decision?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const {
      tenantId,
      step,
      sessionId,
      partialContent,
      toolCalls,
      round,
      chunkIndex,
      decision,
    } = params;

    return this.mergeCheckpointData(tenantId, step, {
      sessionId,
      partialContent,
      toolCalls,
      round,
      chunkIndex,
      ...(decision ? { decision } : {}),
    });
  }

  private mergeToolCall(
    toolCalls: ToolCallEvent[],
    toolCall: ToolCallEvent,
  ): ToolCallEvent[] {
    const index = toolCalls.findIndex((current) => current.id === toolCall.id);
    if (index === -1) {
      return [...toolCalls, toolCall];
    }

    const current = toolCalls[index];
    const merged: ToolCallEvent = {
      ...current,
      ...toolCall,
      transitions: toolCall.transitions ?? current.transitions,
      args: toolCall.args ?? current.args,
      result: toolCall.result ?? current.result,
      error: toolCall.error ?? current.error,
      permissionRequest: toolCall.permissionRequest ?? current.permissionRequest,
    };

    return toolCalls.map((item, itemIndex) =>
      itemIndex === index ? merged : item,
    );
  }

  private emitToolCallStatus(params: {
    tenantId: string;
    executionId: string;
    stepId: string;
    nodeId: string;
    toolCall: ToolCallEvent;
  }): void {
    const { tenantId, executionId, stepId, nodeId, toolCall } = params;
    this.eventBridge.emitToolCallStatus(tenantId, executionId, {
      stepId,
      nodeId,
      toolCallId: toolCall.id,
      tool: toolCall.tool,
      status: toolCall.status,
      args: toolCall.args,
      result: toolCall.result,
      error: toolCall.error,
    });
  }

  private appendToolCallTransition(
    toolCall: ToolCallEvent,
    source: ToolCallTransitionSource,
    to: ToolCallStatus,
    from?: ToolCallStatus,
  ): ToolCallEvent {
    return {
      ...toolCall,
      status: to,
      transitions: [
        ...(toolCall.transitions ?? []),
        {
          ...(from ? { from } : {}),
          to,
          source,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private async applyToolCallUpdate(params: {
    tenantId: string;
    executionId: string;
    stepId: string;
    nodeId: string;
    step: typeof schema.executionSteps.$inferSelect;
    sessionId: string;
    partialContent: string;
    toolCalls: ToolCallEvent[];
    toolCall: ToolCallEvent;
    source: ToolCallTransitionSource;
    round: number;
    chunkIndex: number;
    decision?: Record<string, unknown>;
  }): Promise<ToolCallEvent[]> {
    const {
      tenantId,
      executionId,
      stepId,
      nodeId,
      step,
      sessionId,
      partialContent,
      source,
      round,
      chunkIndex,
      decision,
    } = params;
    let toolCalls = [...params.toolCalls];
    let current = toolCalls.find((item) => item.id === params.toolCall.id);

    if (!current) {
      current = this.appendToolCallTransition(
        {
          ...params.toolCall,
          status: 'pending',
        },
        source,
        'pending',
      );
      toolCalls = this.mergeToolCall(toolCalls, current);
      this.emitToolCallStatus({
        tenantId,
        executionId,
        stepId,
        nodeId,
        toolCall: current,
      });
    }

    let updatedToolCall: ToolCallEvent = {
      ...current,
      ...params.toolCall,
      status: current.status,
      transitions: params.toolCall.transitions ?? current.transitions,
    };
    toolCalls = this.mergeToolCall(toolCalls, updatedToolCall);

    const nextTransitions = this.resolveToolCallTransitions(
      current.status,
      params.toolCall.status,
      source,
    );

    for (const nextTransition of nextTransitions) {
      const fromStatus = updatedToolCall.status;
      updatedToolCall = this.appendToolCallTransition(
        {
          ...updatedToolCall,
          ...params.toolCall,
          status: fromStatus,
        },
        nextTransition.source,
        this.toolCallStateMachine.transition(fromStatus, nextTransition.to),
        fromStatus,
      );
      toolCalls = this.mergeToolCall(toolCalls, updatedToolCall);
      this.emitToolCallStatus({
        tenantId,
        executionId,
        stepId,
        nodeId,
        toolCall: updatedToolCall,
      });
    }

    await this.saveToolLoopCheckpoint({
      tenantId,
      step,
      sessionId,
      partialContent,
      toolCalls,
      round,
      chunkIndex,
      decision,
    });

    return toolCalls;
  }

  private resolveToolCallTransitions(
    currentStatus: ToolCallStatus,
    targetStatus: ToolCallStatus,
    source: ToolCallTransitionSource,
  ): Array<{ to: ToolCallStatus; source: ToolCallTransitionSource }> {
    if (currentStatus === targetStatus) {
      return [];
    }

    if (
      currentStatus === 'pending' &&
      (targetStatus === 'completed' || targetStatus === 'failed')
    ) {
      return [
        { to: 'in_progress', source: 'worker' },
        { to: targetStatus, source },
      ];
    }

    return [{ to: targetStatus, source }];
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
    const checkpointData = this.getCheckpointData(step);
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
    const resolvedStatus = this.toolCallStateMachine.transition(
      toolCall.status,
      newStatus,
    );
    const updatedToolCall = this.appendToolCallTransition(
      { ...toolCall },
      'user',
      resolvedStatus,
      toolCall.status,
    );
    const updatedToolCalls = toolCalls.map((tc) =>
      tc.id === toolPermission.toolCallId ? updatedToolCall : tc,
    );

    await this.mergeCheckpointData(tenantId, step, {
      toolCalls: updatedToolCalls,
    });

    this.emitToolCallStatus({
      tenantId,
      executionId,
      stepId,
      nodeId,
      toolCall: updatedToolCall,
    });

    this.eventBridge.emitToolPermissionResolved(tenantId, executionId, {
      stepId,
      nodeId,
      toolCallId: toolPermission.toolCallId,
      action: toolPermission.action,
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
    step: typeof schema.executionSteps.$inferSelect;
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
    startRound: number;
    existingToolCalls: ToolCallEvent[];
  }): Promise<{
    waitingPermission: boolean;
    accumulatedContent: string;
    lastStopReason?: string;
    decision?: Record<string, unknown>;
  }> {
    let { accumulatedContent, decision, chunkIndex } = params;
    let contentBlocks = params.initialContentBlocks;
    let lastStopReason: string | undefined;
    let toolCalls = [...params.existingToolCalls];
    const autonomyMode =
      typeof params.nodeData.autonomyMode === 'string'
        ? params.nodeData.autonomyMode
        : 'FULL_AUTO';

    for (let round = params.startRound; round < MAX_TOOL_CALL_ROUNDS; round++) {
      const roundToolCallIds = new Set<string>();
      lastStopReason = undefined;

      try {
        for await (const event of params.runtime.prompt(
          params.sessionId,
          contentBlocks,
        )) {
          if (event.type !== 'message_chunk') {
            this.stepStateMachine.broadcastAgentEvent(
              params.tenantId,
              params.executionId,
              params.stepId,
              event,
            );
          }

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
            continue;
          }

          if (event.type === 'tool_call') {
            toolCalls = await this.applyToolCallUpdate({
              tenantId: params.tenantId,
              executionId: params.executionId,
              stepId: params.stepId,
              nodeId: params.nodeId,
              step: params.step,
              sessionId: params.sessionId,
              partialContent: accumulatedContent,
              toolCalls,
              toolCall: event.call,
              source: 'runtime',
              round,
              chunkIndex,
              decision,
            });
            roundToolCallIds.add(event.call.id);
            continue;
          }

          if (event.type === 'decision') {
            decision = {
              suggestedContent: event.suggestedContent,
              confidence: event.confidence,
              ...(event.rationale ? { rationale: event.rationale } : {}),
            };
            continue;
          }

          if (event.type === 'done') {
            lastStopReason = event.stopReason;
          }
        }
      } catch (loopError) {
        const err =
          loopError instanceof Error
            ? loopError
            : new Error(String(loopError));
        (err as unknown as Record<string, unknown>).partialContent =
          accumulatedContent;
        throw err;
      }

      if (lastStopReason !== 'tool_use' || roundToolCallIds.size === 0) {
        break;
      }

      if (autonomyMode === 'FULL_AUTO') {
        for (const toolCallId of roundToolCallIds) {
          const currentToolCall = toolCalls.find((tc) => tc.id === toolCallId);
          if (!currentToolCall || currentToolCall.status !== 'pending') {
            continue;
          }

          const updatedToolCall: ToolCallEvent = {
            ...currentToolCall,
          };
          const inProgressStatus = this.toolCallStateMachine.transition(
            currentToolCall.status,
            'in_progress',
          );
          const transitionedToolCall = this.appendToolCallTransition(
            updatedToolCall,
            'worker',
            inProgressStatus,
            currentToolCall.status,
          );
          toolCalls = this.mergeToolCall(toolCalls, transitionedToolCall);
          this.emitToolCallStatus({
            tenantId: params.tenantId,
            executionId: params.executionId,
            stepId: params.stepId,
            nodeId: params.nodeId,
            toolCall: transitionedToolCall,
          });
        }

        await this.saveToolLoopCheckpoint({
          tenantId: params.tenantId,
          step: params.step,
          sessionId: params.sessionId,
          partialContent: accumulatedContent,
          toolCalls,
          round: round + 1,
          chunkIndex,
          decision,
        });
        contentBlocks = [];
      } else {
        const requestedAt = new Date().toISOString();

        for (const toolCallId of roundToolCallIds) {
          const currentToolCall = toolCalls.find((tc) => tc.id === toolCallId);
          if (!currentToolCall || currentToolCall.status !== 'pending') {
            continue;
          }

          const awaitingPermissionStatus = this.toolCallStateMachine.transition(
              currentToolCall.status,
              'awaiting_permission',
          );
          const updatedToolCall = this.appendToolCallTransition(
            { ...currentToolCall },
            'worker',
            awaitingPermissionStatus,
            currentToolCall.status,
          );
          toolCalls = this.mergeToolCall(toolCalls, updatedToolCall);
          this.emitToolCallStatus({
            tenantId: params.tenantId,
            executionId: params.executionId,
            stepId: params.stepId,
            nodeId: params.nodeId,
            toolCall: updatedToolCall,
          });
          this.eventBridge.emitToolPermissionRequired(
            params.tenantId,
            params.executionId,
            {
              stepId: params.stepId,
              nodeId: params.nodeId,
              toolCallId: updatedToolCall.id,
              tool: updatedToolCall.tool,
              args: updatedToolCall.args,
              requestedAt,
              ...(updatedToolCall.permissionRequest
                ? { permissionRequest: updatedToolCall.permissionRequest }
                : {}),
            },
          );
        }

        await this.saveToolLoopCheckpoint({
          tenantId: params.tenantId,
          step: params.step,
          sessionId: params.sessionId,
          partialContent: accumulatedContent,
          toolCalls,
          round: round + 1,
          chunkIndex,
          decision,
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
