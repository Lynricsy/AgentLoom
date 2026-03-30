import { Inject, Logger, Optional } from '@nestjs/common';
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
    throttleService: ThrottleService,
    private readonly eventBridge: EventBridgeService,
    private readonly toolCallStateMachine: ToolCallStateMachineService,
    private readonly sessionPersistence: SessionPersistenceService,
    private readonly interventionPolicyService: InterventionPolicyService,
    private readonly notificationService: NotificationService,
    private readonly llmEncryptionService: LlmEncryptionService,
    private readonly smartRoutingService: SmartRoutingService,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
    @InjectQueue(AGENT_TASK_QUEUE)
    private readonly agentTaskQueue: Queue,
    @Optional()
    private readonly circuitBreakerService: CircuitBreakerService,
    @Optional()
    private readonly routingLearningProducer: RoutingLearningProducer,
    @Optional()
    private readonly memoryToolsService?: MemoryToolsService,
    @Optional()
    private readonly memoryFusionService?: MemoryFusionService,
    @Optional()
    @Inject(SkillResolverService)
    private readonly skillResolverService?: SkillResolverService,
  ) {
    super();
    void throttleService;
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
    this.logger.log(
      `Processing agent task: ${JSON.stringify({ executionId, stepId, resume: !!resumeSessionId })}`,
    );

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

    const nodeData = job.data.nodeData ?? step.nodeData ?? {};
    const input = job.data.input ?? step.input ?? {};
    const workflowContextExtras = job.data.workflowContext ?? {};
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
    const memorySessionIds = this.resolveMemorySessionIds(
      workflowContextExtras.memorySessionIds,
    );
    let sessionId = resumeSessionId;
    let accumulatedContent = '';
    let lastStopReason: string | undefined;
    let decision: Record<string, unknown> | undefined;
    let chunkIndex = 0;
    const effectiveAutonomyMode = await this.resolveEffectiveAutonomyMode(
      tenantId,
      nodeData,
    );
    const llmCallStartedAt = Date.now();

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
        this.registerMemoryToolsProvider(runtime, sessionId, memorySessionIds);
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
          effectiveAutonomyMode,
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
          await this.stepStateMachine.updateStepStatus(
            tenantId,
            stepId,
            'running',
          );
        });

        const isExistingSession = Boolean(sessionId);
        if (!sessionId) {
          const upstreamSkills = this.extractUpstreamSkills(input);
          let enrichedBasePrompt =
            typeof nodeData.systemPrompt === 'string'
              ? nodeData.systemPrompt
              : undefined;

          if (upstreamSkills.length > 0 && this.skillResolverService) {
            try {
              enrichedBasePrompt =
                this.skillResolverService.buildSkillAugmentedPrompt(
                  enrichedBasePrompt || '',
                  upstreamSkills,
                );
            } catch (error) {
              this.logger.warn(
                `Failed to inject upstream skills into workflow agent prompt: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          const systemPrompt = await this.resolveWorkflowSystemPrompt(
            memorySessionIds,
            enrichedBasePrompt,
          );
          const nextSessionId = randomUUID();
          this.registerMemoryToolsProvider(
            runtime,
            nextSessionId,
            memorySessionIds,
          );
          let session;
          try {
            session = await runtime.createSession({
              sessionId: nextSessionId,
              agentId: nodeData.agentId as string,
              mode: 'workflow',
              tenantId,
              llmModelConfigId:
                typeof nodeData.llmModelConfigId === 'string'
                  ? nodeData.llmModelConfigId
                  : undefined,
              systemPrompt,
              autonomyMode: effectiveAutonomyMode,
              mcpServers,
              context: workflowContext,
            });
          } catch (error) {
            runtime.unregisterSessionToolProvider?.(nextSessionId);
            throw error;
          }
          sessionId = session.id;
          step.checkpointData = {
            ...this.getCheckpointData(step),
            session: this.sessionPersistence.serializeSession(session),
          };
        }

        if (isExistingSession) {
          this.registerMemoryToolsProvider(
            runtime,
            sessionId,
            memorySessionIds,
          );
        }

        const initialContentBlocks = this.buildContentBlocks(input);
        const loopResult = await this.executeMultiTurnLoop({
          runtime,
          step,
          sessionId: sessionId,
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
          existingToolCalls:
            this.loadToolLoopStateFromCheckpoint(step).toolCalls,
          effectiveAutonomyMode,
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
          await this.stepStateMachine.updateExecutionStatus(
            executionId,
            tenantId,
          );
        });
        this.eventBridge.emitInterventionRequired(tenantId, executionId, {
          stepId,
          nodeId: step.nodeId,
          nodeName,
          ...(decision
            ? { decision: decision as InterventionRequiredPayload['decision'] }
            : {}),
          ...(accumulatedContent ? { partialContent: accumulatedContent } : {}),
          requestedAt,
        });
        await this.nodeScheduler.enqueueInterventionTimeout(
          executionId,
          stepId,
          tenantId,
        );
        this.logger.log(
          `Agent task waiting intervention: ${JSON.stringify({ executionId, stepId })}`,
        );
        return;
      }

      const result: Record<string, unknown> = { content: accumulatedContent };
      if (lastStopReason && lastStopReason !== 'end_turn') {
        result.stopReason = lastStopReason;
      }
      if (decision) {
        result.decision = decision;
      }

      // E2EE: 加密 LLM 输出（如租户已配置加密密钥）
      let isEncrypted = false;
      try {
        const orgId = await this.resolveOrgId(tenantId);
        if (
          orgId &&
          (await this.llmEncryptionService.isE2EEEnabled(tenantId, orgId))
        ) {
          const encryptedContent =
            await this.llmEncryptionService.encryptForTenant(
              tenantId,
              orgId,
              typeof accumulatedContent === 'string'
                ? accumulatedContent
                : JSON.stringify(accumulatedContent),
            );
          result.encryptedContent = encryptedContent;
          result.content = '[ENCRYPTED]';
          result.encryptionMetadata = {
            algorithm: encryptedContent.algorithm,
            keyFingerprint: encryptedContent.keyFingerprint,
            encryptedAt: new Date().toISOString(),
          };
          isEncrypted = true;
          this.logger.debug(
            `E2EE: 已加密步骤 ${stepId} 的 LLM 输出 (fingerprint: ${encryptedContent.keyFingerprint})`,
          );
        }
      } catch (encryptionError) {
        // 优雅降级：加密失败时保留明文并记录警告
        this.logger.warn(
          `E2EE: 加密失败，降级为明文存储: ${encryptionError instanceof Error ? encryptionError.message : String(encryptionError)}`,
          { executionId, stepId },
        );
        result.encryptionFailed = true;
      }

      await this.withTenantContext(tenantId, async () => {
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          stepId,
          'completed',
          {
            result,
            ...(isEncrypted ? { isEncrypted } : {}),
          },
        );
        await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
      });
      this.cleanupMemoryToolsProvider(runtime, sessionId, memorySessionIds);

      await this.reportSmartRoutingOutcome({
        tenantId,
        stepId,
        nodeData,
        smartRouting: job.data.smartRouting,
        success: true,
        latencyMs: Date.now() - llmCallStartedAt,
        tokenCount: this.estimateTokenCount(accumulatedContent),
      });

      this.logger.log(
        `Agent task completed: ${JSON.stringify({ executionId, stepId })}`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const errorPartial =
        typeof (error as Record<string, unknown>)?.partialContent === 'string'
          ? ((error as Record<string, unknown>).partialContent as string)
          : '';
      const finalAccumulatedContent = errorPartial || accumulatedContent;

      const existingCheckpoint = step.checkpointData ?? {};
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
      const shouldRetry = this.shouldRetry(job);
      const smartRouting = job.data.smartRouting;
      const authenticationFailed = this.isAuthenticationFailure(err);

      await this.reportSmartRoutingOutcome({
        tenantId,
        stepId,
        nodeData,
        smartRouting,
        success: false,
        latencyMs: Date.now() - llmCallStartedAt,
        tokenCount: this.estimateTokenCount(finalAccumulatedContent),
        error: err,
      });

      const nextSmartRouting =
        !shouldRetry && !authenticationFailed
          ? this.getNextSmartRoutingContext(smartRouting)
          : undefined;

      if (shouldRetry) {
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
              errorMessage: {
                message: err.message,
                stack: err.stack,
                ...(err instanceof DomainException
                  ? {
                      type: err.type,
                      title: err.message,
                      detail: err.detail,
                      errors: err.errors,
                    }
                  : {}),
                nodeId: step.nodeId,
              },
              checkpointData,
            },
          );
        });
        this.stepStateMachine.broadcastStepRetry(
          tenantId,
          executionId,
          stepId,
          {
            attempt: job.attemptsMade + 1,
            maxAttempts: this.getMaxAttempts(job),
            errorMessage: err.message,
          },
        );
        throw err;
      }

      if (nextSmartRouting && smartRouting) {
        const nextAttempt = allAttempts.length;
        const fallbackMessage = `模型 ${smartRouting.selectedModelId} 调用失败，已切换到备用模型 ${nextSmartRouting.selectedModelId}。`;
        const fallbackDecision = this.buildFallbackRoutingDecision(
          smartRouting,
          nextSmartRouting,
          allAttempts,
          err,
        );
        let nextRoutingDecisionId: string | undefined;

        await this.withTenantContext(tenantId, async () => {
          nextRoutingDecisionId = await this.smartRoutingService.recordDecision(
            smartRouting.routingStepId,
            tenantId,
            smartRouting.routingNodeId,
            fallbackDecision,
          );

          await this.tenantDb
            .update(schema.executionSteps)
            .set({ attemptCount: nextAttempt })
            .where(eq(schema.executionSteps.id, stepId));

          const queuedSmartRouting = {
            ...nextSmartRouting,
            routerType: fallbackDecision.routerType,
            ...(nextRoutingDecisionId
              ? { routingDecisionId: nextRoutingDecisionId }
              : {}),
          };

          await this.stepStateMachine.updateStepStatus(
            tenantId,
            stepId,
            'pending',
            {
              errorMessage: {
                message: err.message,
                stack: err.stack,
                ...(err instanceof DomainException
                  ? {
                      type: err.type,
                      title: err.message,
                      detail: err.detail,
                      errors: err.errors,
                    }
                  : {}),
                nodeId: step.nodeId,
              },
              checkpointData: {
                ...checkpointData,
                smartRouting: queuedSmartRouting,
              },
            },
          );
        });

        const queuedSmartRouting = {
          ...nextSmartRouting,
          routerType: fallbackDecision.routerType,
          ...(nextRoutingDecisionId
            ? { routingDecisionId: nextRoutingDecisionId }
            : {}),
        };

        this.stepStateMachine.broadcastAgentEvent(
          tenantId,
          executionId,
          stepId,
          {
            type: 'message_chunk',
            content: fallbackMessage,
          },
        );
        this.stepStateMachine.broadcastStepRetry(
          tenantId,
          executionId,
          stepId,
          {
            attempt: nextAttempt,
            maxAttempts: smartRouting?.candidateModelIds.length ?? nextAttempt,
            errorMessage: `${err.message}；${fallbackMessage}`,
          },
        );

        await this.agentTaskQueue.add(
          'agent-task',
          {
            executionId,
            stepId,
            tenantId,
            input,
            nodeData: {
              ...nodeData,
              llmModelConfigId: nextSmartRouting.selectedModelId,
            },
            workflowContext: job.data.workflowContext,
            ...(hasSandbox ? { hasSandbox: true } : {}),
            smartRouting: queuedSmartRouting,
          },
          { attempts: 1 },
        );

        return;
      }

      const finalError =
        this.isFallbackChainStrategy(smartRouting?.strategy) &&
        !authenticationFailed
          ? new AllModelsFallbackExhaustedException(
              smartRouting?.routingNodeId ?? step.nodeId,
            )
          : err;

      await this.withTenantContext(tenantId, async () => {
        await this.tenantDb
          .update(schema.executionSteps)
          .set({ attemptCount: allAttempts.length })
          .where(eq(schema.executionSteps.id, stepId));

        await this.stepStateMachine.updateStepStatus(
          tenantId,
          stepId,
          'failed',
          {
            errorMessage: {
              message: finalError.message,
              stack: finalError.stack,
              attempts: allAttempts,
              ...(finalError instanceof DomainException
                ? {
                    type: finalError.type,
                    title: finalError.message,
                    detail: finalError.detail,
                    errors: finalError.errors,
                  }
                : {}),
              nodeId: step.nodeId,
              ...('typeMismatch' in err
                ? {
                    typeMismatch: (err as { typeMismatch: TypeMismatchInfo })
                      .typeMismatch,
                  }
                : {}),
            },
            checkpointData,
          },
        );
        await this.nodeScheduler.onNodeFailed(executionId, stepId, tenantId);
      });
      this.cleanupMemoryToolsProvider(runtime, sessionId, memorySessionIds);
      throw finalError;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<AgentTaskJobData> | undefined,
    error: Error,
  ): Promise<void> {
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
    await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
    this.cleanupMemoryToolsProvider(
      this.agentRuntime,
      typeof checkpointData.sessionId === 'string'
        ? checkpointData.sessionId
        : null,
      [],
    );
  }

  private resolveInterventionRecord(
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
    return buildAgentPromptContentBlocks({ input });
  }

  private extractUpstreamSkills(
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

  private resolveMemorySessionIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private async resolveWorkflowSystemPrompt(
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

  private buildMemoryBootPrompt(
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

  private buildMemoryNavigationSummary(
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

  private prependSystemPrompt(
    memoryPrompt?: string,
    baseSystemPrompt?: string,
  ): string | undefined {
    const sections = [memoryPrompt?.trim(), baseSystemPrompt?.trim()].filter(
      (value): value is string => Boolean(value),
    );

    return sections.length ? sections.join('\n\n') : undefined;
  }

  private registerMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string | null | undefined,
    memorySessionIds: string[],
  ): void {
    if (
      !sessionId ||
      !memorySessionIds.length ||
      !this.memoryToolsService ||
      !runtime.registerSessionToolProvider
    ) {
      return;
    }

    runtime.registerSessionToolProvider(
      sessionId,
      this.memoryToolsService.createSessionToolProvider(memorySessionIds),
    );
  }

  private cleanupMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string | null | undefined,
    memorySessionIds: string[],
  ): void {
    if (
      !sessionId ||
      !memorySessionIds.length ||
      !this.memoryToolsService ||
      !runtime.unregisterSessionToolProvider
    ) {
      return;
    }

    try {
      runtime.unregisterSessionToolProvider(sessionId);
    } catch (error) {
      this.logger.warn(
        `Failed to unregister memory tool provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    return step.checkpointData ?? {};
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
      permissionRequest:
        toolCall.permissionRequest ?? current.permissionRequest,
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
      transitions: toolCall.transitions?.map((transition) => ({
        ...(transition.from ? { from: transition.from } : {}),
        to: transition.to,
        source: transition.source,
        timestamp: transition.timestamp,
      })),
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
    effectiveAutonomyMode: string;
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
    const autonomyMode = params.effectiveAutonomyMode;

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
              ...(event.autonomyMode
                ? { autonomyMode: event.autonomyMode }
                : {}),
              ...(event.selectedAction
                ? { selectedAction: event.selectedAction }
                : {}),
              ...(event.alternatives
                ? { alternatives: [...event.alternatives] }
                : {}),
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
          loopError instanceof Error ? loopError : new Error(String(loopError));
        (err as unknown as Record<string, unknown>).partialContent =
          accumulatedContent;
        throw err;
      }

      if (lastStopReason !== 'tool_use' || roundToolCallIds.size === 0) {
        break;
      }

      if (autonomyMode === 'LLM_SUGGEST') {
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

  private async resolveEffectiveAutonomyMode(
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

  private resolveRawAutonomyMode(nodeData: Record<string, unknown>): string {
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

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    return null;
  }

  private resolveNodeName(
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

  private async handleInterventionTimeout(
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

  private async loadInterventionTimeoutContext(executionId: string): Promise<{
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

  private async loadEscalationRecipientIds(
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

  private isOrgRole(value: string): value is OrgRole {
    return ['owner', 'admin', 'creator', 'operator', 'viewer'].includes(value);
  }

  private isAuthenticationFailure(error: unknown): boolean {
    return (
      error instanceof LlmProviderException &&
      error.extensions?.authenticationFailed === true
    );
  }

  private getNextSmartRoutingContext(
    smartRouting?: SmartRoutingRuntimeContext,
  ): SmartRoutingRuntimeContext | undefined {
    if (!smartRouting || !this.isFallbackChainStrategy(smartRouting.strategy)) {
      return undefined;
    }

    const nextIndex = smartRouting.currentModelIndex + 1;
    const nextModelId = smartRouting.candidateModelIds[nextIndex];
    if (!nextModelId) {
      return undefined;
    }

    return {
      ...smartRouting,
      currentModelIndex: nextIndex,
      selectedModelId: nextModelId,
    };
  }

  private buildFallbackRoutingDecision(
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

  private isFallbackChainStrategy(strategy?: string): boolean {
    return strategy === 'FALLBACK_CHAIN' || strategy === 'fallback_chain';
  }

  private async reportSmartRoutingOutcome(params: {
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

  private async resolveSmartRoutingModelInfo(
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
      .select({ provider: schema.llmModelConfigs.provider })
      .from(schema.llmModelConfigs)
      .where(
        and(
          eq(schema.llmModelConfigs.tenantId, tenantId),
          eq(schema.llmModelConfigs.id, selectedModelId),
        ),
      )
      .limit(1);

    const provider = modelRows[0]?.provider;
    return provider ? { modelId: selectedModelId, provider } : null;
  }

  private estimateTokenCount(value: unknown): number {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value ?? {});
    return Math.max(0, Math.ceil(serialized.length / 4));
  }

  private shouldRetry(job: Job<AgentTaskJobData>): boolean {
    return job.attemptsMade + 1 < this.getMaxAttempts(job);
  }

  private getMaxAttempts(job: Job<AgentTaskJobData>): number {
    return typeof job.opts.attempts === 'number' && job.opts.attempts > 0
      ? job.opts.attempts
      : 1;
  }

  private async resolveOrgId(tenantId: string): Promise<string | null> {
    const result = await this.tenantDb
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.tenantId, tenantId))
      .limit(1);
    return result[0]?.id ?? null;
  }

  private async withTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return runInTenantTransaction(this.db, tenantId, async () => operation());
  }
}
