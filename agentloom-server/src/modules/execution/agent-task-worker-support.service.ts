/**
 * Agent task 的干预、memory 与 checkpoint 持久化服务；不注册队列。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import * as schema from '../../database/schema';
import type { TypeMismatchInfo } from '../../database/schema/execution-steps.schema';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { and, eq } from 'drizzle-orm';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { OrgRole } from '../../common/types/org-role.type';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import { isRecoverableAgentRuntimeError } from '../agent/agent-runtime-error.utils';
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
import { InterventionPolicyService } from '../intervention-policy/intervention-policy.service';
import { NotificationService } from '../notification/notification.service';
import { LlmEncryptionService } from '../llm/llm-encryption.service';
import {
  AgentExecutionException,
  InterventionNotAllowedException,
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from './execution.exceptions';
import type {
  InterventionCheckpointRecord,
  InterventionRequiredPayload,
} from './types/execution-event.types';
import type {
  ToolCallEvent,
  ToolCallStatus,
  ToolCallTransitionSource,
} from '../agent/types/tool-call-event.types';
import {
  AGENT_TASK_QUEUE,
  MAX_ESCALATION_ATTEMPTS,
  MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS,
  RECOVERABLE_RUNTIME_FAILURE_REQUEUE_DELAY_MS,
  SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
  type AgentTaskJobData,
  type InterventionResolution,
  type SmartRoutingRuntimeContext,
  type ToolPermissionResolution,
} from './execution.constants';
import { AllModelsFallbackExhaustedException } from '../smart-routing/smart-routing.exceptions';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { CircuitBreakerService } from '../smart-routing/circuit-breaker/circuit-breaker.service';
import { RoutingLearningProducer } from '../smart-routing/learning/routing-learning.producer';
import { LlmProviderException } from '../llm/llm.exceptions';
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';
import { clampAutonomyModeToCap } from '../agent/autonomy-mode-compat';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import type { MemoryBootSequenceResult } from '../agent-memory/services/boot-protocol.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import type { SkillPromptPayload } from '../skill/skill.types';
import { buildAgentPromptContentBlocks } from './agent-prompt-content.builder';
import {
  ensureToolCallConversationMessageSegment,
  normalizeConversationMessageSegments,
  type ConversationMessageSegmentRecord,
} from '../agent-conversation/message-segments';
import {
  AgentTurnEventAccumulator,
  extractAgentThinkingContent,
} from '../agent/shared/agent-turn-event-accumulator';
import {
  bindMemoryToolSession,
  unbindMemoryToolSession,
} from '../agent/shared/memory-tool-session-binder';
import {
  decideAgentTaskFailure,
  getAgentTaskMaxAttempts,
  getNextAgentTaskSmartRouting,
} from './agent-task-failure-policy';
import { WorkspaceIntegrationService } from '../agent-execution/workspace-integration.service';
import { isSelfEvolutionMutationToolName } from '../self-evolution/self-evolution.types';

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

@Injectable()
export class AgentTaskWorkerSupportService {
  protected readonly logger = new Logger('AgentTaskWorker');

  constructor(
    @Inject(DRIZZLE) protected readonly db: DrizzleDB,
    @Inject(AGENT_RUNTIME) protected readonly agentRuntime: IAgentRuntime,
    @Inject(AGENT_RUNTIME_FACTORY)
    protected readonly adapterFactory: IAgentAdapterFactory,
    protected readonly stepStateMachine: StepStateMachineService,
    protected readonly nodeScheduler: NodeSchedulerService,
    throttleService: ThrottleService,
    protected readonly eventBridge: EventBridgeService,
    protected readonly toolCallStateMachine: ToolCallStateMachineService,
    protected readonly sessionPersistence: SessionPersistenceService,
    protected readonly interventionPolicyService: InterventionPolicyService,
    protected readonly notificationService: NotificationService,
    protected readonly llmEncryptionService: LlmEncryptionService,
    protected readonly smartRoutingService: SmartRoutingService,
    protected readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
    protected readonly workspaceIntegrationService: WorkspaceIntegrationService,
    @InjectQueue(AGENT_TASK_QUEUE)
    protected readonly agentTaskQueue: Queue,
    @Optional()
    protected readonly circuitBreakerService: CircuitBreakerService,
    @Optional()
    protected readonly routingLearningProducer: RoutingLearningProducer,
    @Optional()
    protected readonly memoryToolsService?: MemoryToolsService,
    @Optional()
    protected readonly memoryFusionService?: MemoryFusionService,
    @Optional()
    @Inject(SkillResolverService)
    protected readonly skillResolverService?: SkillResolverService,
  ) {
    void throttleService;
  }

  protected get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  public async handleIntervention(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
    intervention: InterventionResolution;
  }): Promise<void> {
    const { executionId, stepId, tenantId, step, intervention } = params;
    await this.archiveStepWorkspaceSnapshot({
      executionId,
      stepId,
      tenantId,
      step,
    });

    const checkpointData = step.checkpointData ?? {};
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
          type: 'urn:agentloom:execution:intervention-rejected',
          title: '人工干预拒绝',
          nodeId: step.nodeId,
        },
        checkpointData: {
          ...checkpointData,
          intervention: interventionRecord,
        },
      });
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        stepId,
      );
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
      'exec-out': { triggered: true },
    };

    const stopReason = checkpointData.stopReason;
    if (typeof stopReason === 'string' && stopReason !== 'end_turn') {
      result.stopReason = stopReason;
    }

    const decision = checkpointData.decision;
    if (decision && typeof decision === 'object') {
      result.decision = decision;
    }

    await this.stepStateMachine.updateStepStatus(
      tenantId,
      stepId,
      'completed',
      {
        result,
        checkpointData: {
          ...checkpointData,
          intervention: interventionRecord,
        },
      },
    );
    this.workspaceIntegrationService.stopExecutionStepFileWatcher(
      executionId,
      stepId,
    );
    await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
    this.cleanupMemoryToolsProvider(
      this.agentRuntime,
      typeof checkpointData.sessionId === 'string'
        ? checkpointData.sessionId
        : null,
      [],
    );
  }

  public resolveWorkflowSandboxNodeId(
    workflowContext: Record<string, unknown>,
  ): string | undefined {
    const nestedSandbox =
      this.isRecord(workflowContext.serverSandbox) &&
      typeof workflowContext.serverSandbox.sandboxNodeId === 'string'
        ? workflowContext.serverSandbox.sandboxNodeId
        : undefined;

    if (
      typeof workflowContext.sandboxNodeId === 'string' &&
      workflowContext.sandboxNodeId.trim().length > 0
    ) {
      return workflowContext.sandboxNodeId.trim();
    }

    if (nestedSandbox && nestedSandbox.trim().length > 0) {
      return nestedSandbox.trim();
    }

    return undefined;
  }

  public isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  public async startStepWorkspaceWatcher(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    sandboxNodeId?: string;
    enabled: boolean;
  }): Promise<void> {
    if (!params.enabled) {
      return;
    }

    await this.workspaceIntegrationService.startExecutionStepFileWatcher({
      executionId: params.executionId,
      stepId: params.stepId,
      tenantId: params.tenantId,
      ...(params.sandboxNodeId ? { sandboxNodeId: params.sandboxNodeId } : {}),
    });
  }

  public resolveInterventionRecord(
    checkpointData: Record<string, unknown>,
    intervention: InterventionResolution,
  ): InterventionCheckpointRecord {
    const existing = checkpointData.intervention;
    if (
      existing &&
      typeof existing === 'object' &&
      typeof (existing as { requested_at?: unknown }).requested_at ===
        'string' &&
      typeof (existing as { resolved_at?: unknown }).resolved_at === 'string' &&
      typeof (existing as { action?: unknown }).action === 'string' &&
      typeof (existing as { resolved_by_user_id?: unknown })
        .resolved_by_user_id === 'string'
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

  public resolveInterventionContent(
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

  public buildContentBlocks(input: Record<string, unknown>): ContentBlock[] {
    return buildAgentPromptContentBlocks({ input });
  }

  public extractUpstreamSkills(
    input: Record<string, unknown>,
  ): SkillPromptPayload[] {
    const skills: SkillPromptPayload[] = [];

    for (const value of Object.values(input)) {
      const record = this.asRecord(value);
      if (record && Array.isArray(record.skills)) {
        for (const skill of record.skills) {
          const skillRecord = this.asRecord(skill);
          if (
            skillRecord &&
            typeof skillRecord.id === 'string' &&
            typeof skillRecord.name === 'string'
          ) {
            skills.push({
              id: skillRecord.id,
              name: skillRecord.name,
              description:
                typeof skillRecord.description === 'string'
                  ? skillRecord.description
                  : '',
              content:
                typeof skillRecord.content === 'string'
                  ? skillRecord.content
                  : null,
            });
          }
        }
      }
    }

    return skills;
  }

  public resolveMemorySessionIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  public async resolveWorkflowSystemPrompt(
    memorySessionIds: string[],
    baseSystemPrompt?: string,
  ): Promise<string | undefined> {
    if (!memorySessionIds.length || !this.memoryFusionService) {
      return baseSystemPrompt;
    }

    try {
      const bootSequence =
        await this.memoryFusionService.bootAll(memorySessionIds);
      const memoryPrompt = this.buildMemoryBootPrompt(bootSequence);
      return this.prependSystemPrompt(memoryPrompt, baseSystemPrompt);
    } catch (error) {
      this.logger.warn(
        `Failed to load memory boot context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return baseSystemPrompt;
    }
  }

  public buildMemoryBootPrompt(
    bootSequence: MemoryBootSequenceResult,
  ): string | undefined {
    const sections = [bootSequence.systemPrompt.trim()];

    if (typeof bootSequence.boot === 'string' && bootSequence.boot.trim()) {
      sections.push(`## Memory Boot\n${bootSequence.boot.trim()}`);
    }

    const navigationSummary = this.buildMemoryNavigationSummary(bootSequence);
    if (navigationSummary) {
      sections.push(navigationSummary);
    }

    return sections.filter(Boolean).join('\n\n') || undefined;
  }

  public buildMemoryNavigationSummary(
    bootSequence: MemoryBootSequenceResult,
  ): string | undefined {
    const sections: string[] = [];

    if (bootSequence.index.length) {
      sections.push(
        [
          '## Memory Index',
          ...bootSequence.index.map(
            (path) => `- ${path.domain}://${path.pathString}`,
          ),
        ].join('\n'),
      );
    }

    if (bootSequence.glossary.length) {
      sections.push(
        [
          '## Memory Glossary',
          ...bootSequence.glossary.map(
            (entry) => `- ${entry.keyword} -> node:${entry.nodeId}`,
          ),
        ].join('\n'),
      );
    }

    return sections.join('\n\n') || undefined;
  }

  public prependSystemPrompt(
    memoryPrompt?: string,
    baseSystemPrompt?: string,
  ): string | undefined {
    const sections = [memoryPrompt?.trim(), baseSystemPrompt?.trim()].filter(
      (value): value is string => Boolean(value),
    );

    return sections.length ? sections.join('\n\n') : undefined;
  }

  public registerMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string | null | undefined,
    memorySessionIds: string[],
  ): void {
    bindMemoryToolSession({
      runtime,
      memoryToolsService: this.memoryToolsService,
      sessionId,
      memorySessionIds,
    });
  }

  public cleanupMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string | null | undefined,
    memorySessionIds: string[],
  ): void {
    unbindMemoryToolSession(
      {
        runtime,
        memoryToolsService: this.memoryToolsService,
        sessionId,
        memorySessionIds,
      },
      (error) => {
        this.logger.warn(
          `Failed to unregister memory tool provider: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  }

  public resolveSessionMcpServers(
    value: unknown,
  ): CreateSessionParams['mcpServers'] {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as CreateSessionParams['mcpServers'])
      : undefined;
  }

  public getCheckpointData(
    step: typeof schema.executionSteps.$inferSelect,
  ): Record<string, unknown> {
    return step.checkpointData ?? {};
  }

  public async archiveStepWorkspaceSnapshot(params: {
    executionId: string;
    stepId: string;
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
  }): Promise<void> {
    const snapshotId =
      await this.workspaceIntegrationService.archiveExecutionStepWorkspace(
        params.executionId,
        params.stepId,
        params.tenantId,
      );

    if (!snapshotId) {
      return;
    }

    await this.mergeCheckpointData(params.tenantId, params.step, {
      workspaceSnapshotId: snapshotId,
    });
  }

  public loadToolLoopStateFromCheckpoint(
    step: typeof schema.executionSteps.$inferSelect,
  ): {
    partialContent: string;
    chunkIndex: number;
    round: number;
    decision?: Record<string, unknown>;
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
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
      segments: normalizeConversationMessageSegments(checkpointData.segments),
    };
  }

  public async mergeCheckpointData(
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

  public async saveToolLoopCheckpoint(params: {
    tenantId: string;
    step: typeof schema.executionSteps.$inferSelect;
    sessionId: string;
    partialContent: string;
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
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
      segments,
      round,
      chunkIndex,
      decision,
    } = params;

    return this.mergeCheckpointData(tenantId, step, {
      sessionId,
      partialContent,
      toolCalls,
      segments,
      round,
      chunkIndex,
      ...(decision ? { decision } : {}),
    });
  }

  public mergeToolCall(
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
      permissionRequest:
        toolCall.permissionRequest ?? current.permissionRequest,
    };

    return toolCalls.map((item, itemIndex) =>
      itemIndex === index ? merged : item,
    );
  }

  public emitToolCallStatus(params: {
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
      permissionRequest: toolCall.permissionRequest,
      transitions: toolCall.transitions?.map((transition) => ({
        ...(transition.from ? { from: transition.from } : {}),
        to: transition.to,
        source: transition.source,
        timestamp: transition.timestamp,
      })),
    });
  }

  public appendToolCallTransition(
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

  public async applyToolCallUpdate(params: {
    tenantId: string;
    executionId: string;
    stepId: string;
    nodeId: string;
    step: typeof schema.executionSteps.$inferSelect;
    sessionId: string;
    partialContent: string;
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
    toolCall: ToolCallEvent;
    source: ToolCallTransitionSource;
    round: number;
    chunkIndex: number;
    decision?: Record<string, unknown>;
  }): Promise<{
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
  }> {
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
    const segments = ensureToolCallConversationMessageSegment(
      params.segments,
      params.toolCall.id,
    );
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
      segments,
      round,
      chunkIndex,
      decision,
    });

    return {
      toolCalls,
      segments,
    };
  }

  public resolveToolCallTransitions(
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

  public async resolveToolPermissionAndBuildBlocks(params: {
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


  public asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  public async withTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runInTenantTransaction(this.db, tenantId, async () => operation());
  }

}
