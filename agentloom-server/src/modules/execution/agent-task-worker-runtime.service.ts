/**
 * Agent task 的多轮工具执行、失败路由与运行时服务；通过组合调用 checkpoint 服务。
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

import { AgentTaskWorkerSupportService } from './agent-task-worker-support.service';

@Injectable()
export class AgentTaskWorkerRuntimeService {
  protected readonly logger = new Logger('AgentTaskWorker');

  constructor(
    private readonly support: AgentTaskWorkerSupportService,
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

  public async executeMultiTurnLoop(params: {
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
    existingSegments: ConversationMessageSegmentRecord[];
    effectiveAutonomyMode: string;
  }): Promise<{
    waitingPermission: boolean;
    accumulatedContent: string;
    lastStopReason?: string;
    decision?: Record<string, unknown>;
    toolCalls: ToolCallEvent[];
    segments: ConversationMessageSegmentRecord[];
  }> {
    let { accumulatedContent, decision, chunkIndex } = params;
    let contentBlocks = params.initialContentBlocks;
    let lastStopReason: string | undefined;
    let toolCalls = [...params.existingToolCalls];
    let segments = [...params.existingSegments];
    const accumulator = new AgentTurnEventAccumulator<Record<string, unknown>>({
      assistantText: accumulatedContent,
      chunkIndex,
      outputChunkIndexOffset: 1,
      decision,
      toolCalls,
      segments,
      mapDecision: (event) => ({
        suggestedContent: event.suggestedContent,
        ...(event.autonomyMode ? { autonomyMode: event.autonomyMode } : {}),
        ...(event.selectedAction
          ? { selectedAction: event.selectedAction }
          : {}),
        ...(event.alternatives
          ? { alternatives: [...event.alternatives] }
          : {}),
        confidence: event.confidence,
        ...(event.rationale ? { rationale: event.rationale } : {}),
      }),
    });


    for (let round = params.startRound; round < MAX_TOOL_CALL_ROUNDS; round++) {
      const roundToolCallIds = new Set<string>();
      accumulator.beginRound();
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

          const accumulatedEvent = accumulator.consume(event, {
            aggregateToolCall: false,
          });
          if (accumulatedEvent.kind === 'message_chunk') {
            accumulatedContent = accumulator.assistantText;
            segments = accumulator.segments;
            chunkIndex = accumulator.chunkIndex;
            this.eventBridge.emitOutputChunk(
              params.tenantId,
              params.executionId,
              {
                stepId: params.stepId,
                chunk: accumulatedEvent.chunk,
                index: accumulatedEvent.index,
                executionType: 'workflow',
              },
            );
            continue;
          }

          segments = accumulator.segments;

          if (event.type === 'tool_call') {
            const updatedToolLoop = await this.support.applyToolCallUpdate({
              tenantId: params.tenantId,
              executionId: params.executionId,
              stepId: params.stepId,
              nodeId: params.nodeId,
              step: params.step,
              sessionId: params.sessionId,
              partialContent: accumulatedContent,
              toolCalls,
              segments,
              toolCall: event.call,
              source: 'runtime',
              round,
              chunkIndex,
              decision,
            });
            toolCalls = updatedToolLoop.toolCalls;
            segments = updatedToolLoop.segments;
            accumulator.replaceToolCalls(toolCalls);
            accumulator.replaceSegments(segments);
            roundToolCallIds.add(event.call.id);
            continue;
          }

          if (accumulatedEvent.kind === 'decision') {
            decision = accumulator.decision;
            continue;
          }

          if (accumulatedEvent.kind === 'done') {
            lastStopReason = accumulator.stopReason;
          }
        }
      } catch (loopError) {
        const err =
          loopError instanceof Error ? loopError : new Error(String(loopError));
        (err as unknown as Record<string, unknown>).partialContent =
          accumulatedContent;
        throw err;
      }

      if (lastStopReason !== 'tool_use' || roundToolCallIds.size === 0) {
        break;
      }

      const pendingRoundToolCallIds = [...roundToolCallIds].filter(
        (toolCallId) => {
          const currentToolCall = toolCalls.find((tc) => tc.id === toolCallId);
          return currentToolCall?.status === 'pending';
        },
      );
      const permissionRequiredToolCallIds = pendingRoundToolCallIds.filter(
        (toolCallId) => {
          const currentToolCall = toolCalls.find((tc) => tc.id === toolCallId);
          return (
            currentToolCall !== undefined &&
            this.shouldRequireToolPermission(currentToolCall)
          );
        },
      );

      if (permissionRequiredToolCallIds.length === 0) {
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
          const transitionedToolCall = this.support.appendToolCallTransition(
            updatedToolCall,
            'worker',
            inProgressStatus,
            currentToolCall.status,
          );
          toolCalls = this.support.mergeToolCall(toolCalls, transitionedToolCall);
          this.support.emitToolCallStatus({
            tenantId: params.tenantId,
            executionId: params.executionId,
            stepId: params.stepId,
            nodeId: params.nodeId,
            toolCall: transitionedToolCall,
          });
        }

        await this.support.saveToolLoopCheckpoint({
          tenantId: params.tenantId,
          step: params.step,
          sessionId: params.sessionId,
          partialContent: accumulatedContent,
          toolCalls,
          segments,
          round: round + 1,
          chunkIndex,
          decision,
        });
        contentBlocks = [];
      } else {
        const requestedAt = new Date().toISOString();

        for (const toolCallId of permissionRequiredToolCallIds) {
          const currentToolCall = toolCalls.find((tc) => tc.id === toolCallId);
          if (!currentToolCall || currentToolCall.status !== 'pending') {
            continue;
          }

          const awaitingPermissionStatus = this.toolCallStateMachine.transition(
            currentToolCall.status,
            'awaiting_permission',
          );
          const updatedToolCall = this.support.appendToolCallTransition(
            { ...currentToolCall },
            'worker',
            awaitingPermissionStatus,
            currentToolCall.status,
          );
          toolCalls = this.support.mergeToolCall(toolCalls, updatedToolCall);
          this.support.emitToolCallStatus({
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

        await this.support.saveToolLoopCheckpoint({
          tenantId: params.tenantId,
          step: params.step,
          sessionId: params.sessionId,
          partialContent: accumulatedContent,
          toolCalls,
          segments,
          round: round + 1,
          chunkIndex,
          decision,
        });

        return {
          waitingPermission: true,
          accumulatedContent,
          lastStopReason,
          decision,
          toolCalls,
          segments,
        };
      }
    }

    return {
      waitingPermission: false,
      accumulatedContent,
      lastStopReason,
      decision,
      toolCalls,
      segments,
    };
  }

  public extractThinkingEventContent(event: {
    type?: unknown;
    content?: unknown;
    rationale?: unknown;
    suggestedContent?: unknown;
  }): string | undefined {
    return extractAgentThinkingContent(event);
  }

  public shouldRequireToolPermission(toolCall: ToolCallEvent): boolean {
    return isSelfEvolutionMutationToolName(toolCall.tool);
  }

  public async resolveEffectiveAutonomyMode(
    tenantId: string,
    nodeData: Record<string, unknown>,
  ): Promise<string> {
    const rawAutonomyMode = this.resolveRawAutonomyMode(nodeData);
    const resolvedAutonomyCap =
      await this.organizationAutonomyPolicyService.resolveAutonomyCapForTenant(
        tenantId,
      );
    const autonomyCap = this.readString(resolvedAutonomyCap) ?? 'LLM_SUGGEST';

    return clampAutonomyModeToCap(rawAutonomyMode, autonomyCap).effectiveMode;
  }

  public resolveRawAutonomyMode(nodeData: Record<string, unknown>): string {
    const normalizedNodeData = this.asRecord(nodeData) ?? {};
    const config = this.asRecord(normalizedNodeData.config) ?? {};
    const settings = this.asRecord(normalizedNodeData.settings) ?? {};
    const autonomyConfig =
      this.asRecord(normalizedNodeData.autonomyConfig) ?? {};

    return (
      this.readString(
        normalizedNodeData.autonomyMode,
        autonomyConfig.mode,
        settings.autonomyMode,
        config.autonomyMode,
      ) ?? 'FULL_AUTO'
    );
  }

  public asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  public readString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    return null;
  }

  public resolveNodeName(
    step: typeof schema.executionSteps.$inferSelect,
  ): string {
    const nodeData = step.nodeData;
    if (
      nodeData &&
      typeof nodeData.label === 'string' &&
      nodeData.label.trim()
    ) {
      return nodeData.label.trim();
    }

    return step.nodeId;
  }

  public async handleInterventionTimeout(
    job: Job<AgentTaskJobData>,
  ): Promise<void> {
    const { executionId, stepId, tenantId } = job.data;
    this.logger.log(
      `Processing intervention timeout: ${JSON.stringify({ executionId, stepId })}`,
    );

    const [step] = await this.withTenantContext(tenantId, () =>
      this.tenantDb
        .select()
        .from(schema.executionSteps)
        .where(eq(schema.executionSteps.id, stepId)),
    );

    if (!step || step.status !== 'waiting_intervention') {
      this.logger.log(
        `Intervention timeout skipped (status: ${step?.status ?? 'not-found'}): ${JSON.stringify({ executionId, stepId })}`,
      );
      return;
    }

    try {
      const timeoutAction = await this.withTenantContext(tenantId, async () => {
        const context = await this.loadInterventionTimeoutContext(executionId);
        const resolvedPolicy =
          await this.interventionPolicyService.resolvePolicy(
            tenantId,
            context.workflowDefinitionId,
            step.nodeId,
          );
        const escalationCount = job.data.escalationCount ?? 0;

        if (resolvedPolicy.timeoutAction === 'approve') {
          await this.nodeScheduler.resolveIntervention(
            executionId,
            stepId,
            tenantId,
            SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
            {
              action: 'approve',
              feedback: '干预超时，系统自动批准',
              timeout: true,
            },
          );
          return 'approve';
        }

        if (
          resolvedPolicy.timeoutAction === 'escalate' &&
          resolvedPolicy.escalateToRole &&
          this.isOrgRole(resolvedPolicy.escalateToRole) &&
          escalationCount < MAX_ESCALATION_ATTEMPTS
        ) {
          const nextEscalationCount = escalationCount + 1;
          const recipientIds = await this.loadEscalationRecipientIds(
            tenantId,
            resolvedPolicy.escalateToRole,
          );
          const body = {
            workflowId: context.workflowDefinitionId,
            workflowName: context.workflowName,
            executionId,
            nodeId: step.nodeId,
            nodeName: this.resolveNodeName(step),
            timelineUrl: `/executions/${executionId}`,
            notifyChannels: resolvedPolicy.notifyChannels,
            escalationCount: nextEscalationCount,
          };

          for (const userId of recipientIds) {
            await this.notificationService.create(tenantId, {
              userId,
              type: 'system',
              title: '节点人工干预已升级',
              body,
            });
          }

          await this.nodeScheduler.enqueueInterventionTimeout(
            executionId,
            stepId,
            tenantId,
            {
              escalated: true,
              escalationCount: nextEscalationCount,
            },
          );

          return 'escalate';
        }

        await this.nodeScheduler.resolveIntervention(
          executionId,
          stepId,
          tenantId,
          SYSTEM_TIMEOUT_INTERVENTION_USER_ID,
          {
            action: 'reject',
            feedback:
              resolvedPolicy.timeoutAction === 'escalate'
                ? '干预升级达到上限，系统自动拒绝'
                : '干预超时，系统自动拒绝',
            timeout: true,
          },
        );

        return 'reject';
      });

      this.logger.log(
        `Intervention timeout handled with action=${timeoutAction}: ${JSON.stringify({ executionId, stepId })}`,
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
  }

  public async loadInterventionTimeoutContext(executionId: string): Promise<{
    workflowDefinitionId: string;
    workflowName: string;
  }> {
    const [context] = await this.tenantDb
      .select({
        workflowDefinitionId: schema.workflowExecutions.workflowDefinitionId,
        workflowName: schema.workflowDefinitions.name,
      })
      .from(schema.workflowExecutions)
      .innerJoin(
        schema.workflowDefinitions,
        eq(
          schema.workflowDefinitions.id,
          schema.workflowExecutions.workflowDefinitionId,
        ),
      )
      .where(eq(schema.workflowExecutions.id, executionId))
      .limit(1);

    if (!context) {
      throw new AgentExecutionException(`执行 ${executionId} 不存在`);
    }

    return context;
  }

  public async loadEscalationRecipientIds(
    tenantId: string,
    role: OrgRole,
  ): Promise<string[]> {
    const recipients = await this.tenantDb
      .select({ userId: schema.organizationMembers.userId })
      .from(schema.organizationMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.organizationMembers.organizationId),
      )
      .where(
        and(
          eq(schema.organizations.tenantId, tenantId),
          eq(schema.organizationMembers.role, role),
        ),
      );

    return [...new Set(recipients.map((recipient) => recipient.userId))];
  }

  public isOrgRole(value: string): value is OrgRole {
    return ['owner', 'admin', 'creator', 'operator', 'viewer'].includes(value);
  }

  public isAuthenticationFailure(error: unknown): boolean {
    return (
      error instanceof LlmProviderException &&
      error.extensions?.authenticationFailed === true
    );
  }

  public getNextSmartRoutingContext(
    smartRouting?: SmartRoutingRuntimeContext,
  ): SmartRoutingRuntimeContext | undefined {
    return getNextAgentTaskSmartRouting(smartRouting);
  }

  public buildFallbackRoutingDecision(
    currentSmartRouting: SmartRoutingRuntimeContext | undefined,
    nextSmartRouting: SmartRoutingRuntimeContext,
    attempts: schema.ExecutionStepAttemptError[],
    error: Error,
  ) {
    const orderedCandidateIds = [
      ...nextSmartRouting.candidateModelIds.slice(
        nextSmartRouting.currentModelIndex,
      ),
      ...nextSmartRouting.candidateModelIds.slice(
        0,
        nextSmartRouting.currentModelIndex,
      ),
    ];
    const evaluatedModelsById = new Map(
      (nextSmartRouting.evaluatedModels ?? []).map((model) => [
        model.modelId,
        model,
      ]),
    );
    const attemptsSummary = attempts
      .map((attempt) => `第 ${attempt.attempt} 次：${attempt.error}`)
      .join('；');

    return {
      selectedModelId: nextSmartRouting.selectedModelId,
      strategy: currentSmartRouting?.strategy ?? nextSmartRouting.strategy,
      reasoning: `FALLBACK_CHAIN：模型 ${currentSmartRouting?.selectedModelId ?? nextSmartRouting.selectedModelId} 调用失败（${error.message}），已切换到备用模型 ${nextSmartRouting.selectedModelId}。前序失败记录：${attemptsSummary}`,
      evaluatedModels: orderedCandidateIds.map((modelId, index) => {
        const existing = evaluatedModelsById.get(modelId);
        if (existing) {
          return {
            ...existing,
            score: Math.max(100 - index * 10, 0),
            reasoning:
              modelId === nextSmartRouting.selectedModelId
                ? '上一候选失败后切换到当前模型'
                : existing.reasoning,
          };
        }

        return {
          modelId,
          modelName: modelId,
          provider: 'fallback',
          score: Math.max(100 - index * 10, 0),
          reasoning:
            modelId === nextSmartRouting.selectedModelId
              ? '上一候选失败后切换到当前模型'
              : '回退链候选模型',
        };
      }),
      latencyMs: 0,
      routerType: currentSmartRouting?.routerType ?? 'fallback_chain',
    };
  }


  public async reportSmartRoutingOutcome(params: {
    tenantId: string;
    stepId: string;
    nodeData: Record<string, unknown>;
    smartRouting?: SmartRoutingRuntimeContext;
    success: boolean;
    latencyMs: number;
    tokenCount: number;
    error?: Error;
  }): Promise<void> {
    const {
      tenantId,
      stepId,
      nodeData,
      smartRouting,
      success,
      latencyMs,
      tokenCount,
      error,
    } = params;

    if (!smartRouting) {
      return;
    }

    const selectedModel = await this.resolveSmartRoutingModelInfo(
      tenantId,
      nodeData,
      smartRouting,
    );

    if (!selectedModel) {
      return;
    }

    if (!this.circuitBreakerService) {
      return;
    }

    try {
      if (success) {
        await this.circuitBreakerService.recordSuccess(
          tenantId,
          selectedModel.provider,
          selectedModel.modelId,
        );
      } else {
        await this.circuitBreakerService.recordFailure(
          tenantId,
          selectedModel.provider,
          selectedModel.modelId,
        );
      }
    } catch (circuitBreakerError) {
      this.logger.warn(
        `Smart routing circuit breaker outcome skipped: ${circuitBreakerError instanceof Error ? circuitBreakerError.message : String(circuitBreakerError)}`,
        { tenantId, stepId, modelId: selectedModel.modelId },
      );
    }

    if (!smartRouting.routingDecisionId || !this.routingLearningProducer) {
      return;
    }

    void this.routingLearningProducer
      .enqueueLearningJob({
        tenantId,
        executionStepId: stepId,
        routingDecisionId: smartRouting.routingDecisionId,
        selectedModelId: selectedModel.modelId,
        queryText: smartRouting.queryText ?? '',
        ...(smartRouting.taskCategory
          ? { taskCategory: smartRouting.taskCategory }
          : {}),
        actualPerformance: {
          success,
          latencyMs,
          tokenCount,
          ...(error ? { errorType: error.name || 'Error' } : {}),
        },
      })
      .catch((learningError: unknown) => {
        this.logger.warn(
          `Smart routing learning enqueue skipped: ${learningError instanceof Error ? learningError.message : String(learningError)}`,
          {
            tenantId,
            stepId,
            routingDecisionId: smartRouting.routingDecisionId,
          },
        );
      });
  }

  public async resolveSmartRoutingModelInfo(
    tenantId: string,
    nodeData: Record<string, unknown>,
    smartRouting: SmartRoutingRuntimeContext,
  ): Promise<{ modelId: string; provider: string } | null> {
    const selectedModelId =
      smartRouting.selectedModelId ||
      (typeof nodeData.llmModelConfigId === 'string'
        ? nodeData.llmModelConfigId
        : null);

    if (!selectedModelId) {
      return null;
    }

    const evaluatedModel = smartRouting.evaluatedModels?.find(
      (model) => model.modelId === selectedModelId,
    );

    if (evaluatedModel) {
      return { modelId: selectedModelId, provider: evaluatedModel.provider };
    }

    const modelRows = await this.tenantDb
      .select({ providerSlug: schema.llmProviders.slug })
      .from(schema.llmModelConfigs)
      .innerJoin(
        schema.llmProviders,
        eq(schema.llmModelConfigs.providerId, schema.llmProviders.id),
      )
      .where(
        and(
          eq(schema.llmModelConfigs.tenantId, tenantId),
          eq(schema.llmModelConfigs.id, selectedModelId),
        ),
      )
      .limit(1);

    const provider = modelRows[0]?.providerSlug;
    return provider ? { modelId: selectedModelId, provider } : null;
  }

  public estimateTokenCount(value: unknown): number {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value ?? {});
    return Math.max(0, Math.ceil(serialized.length / 4));
  }


  public shouldRetry(job: Job<AgentTaskJobData>): boolean {
    return job.attemptsMade + 1 < this.getMaxAttempts(job);
  }

  public getMaxAttempts(job: Job<AgentTaskJobData>): number {
    return getAgentTaskMaxAttempts(job.opts.attempts);
  }


  public async resolveOrgId(tenantId: string): Promise<string | null> {
    const result = await this.tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);
    return result[0]?.id ?? null;
  }

  public async withTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runInTenantTransaction(this.db, tenantId, async () => operation());
  }
}
