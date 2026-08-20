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
import { AgentTaskWorkerRuntimeService } from './agent-task-worker-runtime.service';

@Processor(AGENT_TASK_QUEUE, { concurrency: 10 })
export class AgentTaskWorker extends WorkerHost {
  public get handleIntervention(): AgentTaskWorkerSupportService['handleIntervention'] {
    return this.supportService.handleIntervention.bind(this.supportService);
  }

  public set handleIntervention(value: AgentTaskWorkerSupportService['handleIntervention']) {
    this.supportService.handleIntervention = value;
  }

  public get resolveWorkflowSandboxNodeId(): AgentTaskWorkerSupportService['resolveWorkflowSandboxNodeId'] {
    return this.supportService.resolveWorkflowSandboxNodeId.bind(this.supportService);
  }

  public set resolveWorkflowSandboxNodeId(value: AgentTaskWorkerSupportService['resolveWorkflowSandboxNodeId']) {
    this.supportService.resolveWorkflowSandboxNodeId = value;
  }

  public get isRecord(): AgentTaskWorkerSupportService['isRecord'] {
    return this.supportService.isRecord.bind(this.supportService);
  }

  public set isRecord(value: AgentTaskWorkerSupportService['isRecord']) {
    this.supportService.isRecord = value;
  }

  public get startStepWorkspaceWatcher(): AgentTaskWorkerSupportService['startStepWorkspaceWatcher'] {
    return this.supportService.startStepWorkspaceWatcher.bind(this.supportService);
  }

  public set startStepWorkspaceWatcher(value: AgentTaskWorkerSupportService['startStepWorkspaceWatcher']) {
    this.supportService.startStepWorkspaceWatcher = value;
  }

  public get resolveInterventionRecord(): AgentTaskWorkerSupportService['resolveInterventionRecord'] {
    return this.supportService.resolveInterventionRecord.bind(this.supportService);
  }

  public set resolveInterventionRecord(value: AgentTaskWorkerSupportService['resolveInterventionRecord']) {
    this.supportService.resolveInterventionRecord = value;
  }

  public get resolveInterventionContent(): AgentTaskWorkerSupportService['resolveInterventionContent'] {
    return this.supportService.resolveInterventionContent.bind(this.supportService);
  }

  public set resolveInterventionContent(value: AgentTaskWorkerSupportService['resolveInterventionContent']) {
    this.supportService.resolveInterventionContent = value;
  }

  public get buildContentBlocks(): AgentTaskWorkerSupportService['buildContentBlocks'] {
    return this.supportService.buildContentBlocks.bind(this.supportService);
  }

  public set buildContentBlocks(value: AgentTaskWorkerSupportService['buildContentBlocks']) {
    this.supportService.buildContentBlocks = value;
  }

  public get extractUpstreamSkills(): AgentTaskWorkerSupportService['extractUpstreamSkills'] {
    return this.supportService.extractUpstreamSkills.bind(this.supportService);
  }

  public set extractUpstreamSkills(value: AgentTaskWorkerSupportService['extractUpstreamSkills']) {
    this.supportService.extractUpstreamSkills = value;
  }

  public get resolveMemorySessionIds(): AgentTaskWorkerSupportService['resolveMemorySessionIds'] {
    return this.supportService.resolveMemorySessionIds.bind(this.supportService);
  }

  public set resolveMemorySessionIds(value: AgentTaskWorkerSupportService['resolveMemorySessionIds']) {
    this.supportService.resolveMemorySessionIds = value;
  }

  public get resolveWorkflowSystemPrompt(): AgentTaskWorkerSupportService['resolveWorkflowSystemPrompt'] {
    return this.supportService.resolveWorkflowSystemPrompt.bind(this.supportService);
  }

  public set resolveWorkflowSystemPrompt(value: AgentTaskWorkerSupportService['resolveWorkflowSystemPrompt']) {
    this.supportService.resolveWorkflowSystemPrompt = value;
  }

  public get buildMemoryBootPrompt(): AgentTaskWorkerSupportService['buildMemoryBootPrompt'] {
    return this.supportService.buildMemoryBootPrompt.bind(this.supportService);
  }

  public set buildMemoryBootPrompt(value: AgentTaskWorkerSupportService['buildMemoryBootPrompt']) {
    this.supportService.buildMemoryBootPrompt = value;
  }

  public get buildMemoryNavigationSummary(): AgentTaskWorkerSupportService['buildMemoryNavigationSummary'] {
    return this.supportService.buildMemoryNavigationSummary.bind(this.supportService);
  }

  public set buildMemoryNavigationSummary(value: AgentTaskWorkerSupportService['buildMemoryNavigationSummary']) {
    this.supportService.buildMemoryNavigationSummary = value;
  }

  public get prependSystemPrompt(): AgentTaskWorkerSupportService['prependSystemPrompt'] {
    return this.supportService.prependSystemPrompt.bind(this.supportService);
  }

  public set prependSystemPrompt(value: AgentTaskWorkerSupportService['prependSystemPrompt']) {
    this.supportService.prependSystemPrompt = value;
  }

  public get registerMemoryToolsProvider(): AgentTaskWorkerSupportService['registerMemoryToolsProvider'] {
    return this.supportService.registerMemoryToolsProvider.bind(this.supportService);
  }

  public set registerMemoryToolsProvider(value: AgentTaskWorkerSupportService['registerMemoryToolsProvider']) {
    this.supportService.registerMemoryToolsProvider = value;
  }

  public get cleanupMemoryToolsProvider(): AgentTaskWorkerSupportService['cleanupMemoryToolsProvider'] {
    return this.supportService.cleanupMemoryToolsProvider.bind(this.supportService);
  }

  public set cleanupMemoryToolsProvider(value: AgentTaskWorkerSupportService['cleanupMemoryToolsProvider']) {
    this.supportService.cleanupMemoryToolsProvider = value;
  }

  public get resolveSessionMcpServers(): AgentTaskWorkerSupportService['resolveSessionMcpServers'] {
    return this.supportService.resolveSessionMcpServers.bind(this.supportService);
  }

  public set resolveSessionMcpServers(value: AgentTaskWorkerSupportService['resolveSessionMcpServers']) {
    this.supportService.resolveSessionMcpServers = value;
  }

  public get getCheckpointData(): AgentTaskWorkerSupportService['getCheckpointData'] {
    return this.supportService.getCheckpointData.bind(this.supportService);
  }

  public set getCheckpointData(value: AgentTaskWorkerSupportService['getCheckpointData']) {
    this.supportService.getCheckpointData = value;
  }

  public get archiveStepWorkspaceSnapshot(): AgentTaskWorkerSupportService['archiveStepWorkspaceSnapshot'] {
    return this.supportService.archiveStepWorkspaceSnapshot.bind(this.supportService);
  }

  public set archiveStepWorkspaceSnapshot(value: AgentTaskWorkerSupportService['archiveStepWorkspaceSnapshot']) {
    this.supportService.archiveStepWorkspaceSnapshot = value;
  }

  public get loadToolLoopStateFromCheckpoint(): AgentTaskWorkerSupportService['loadToolLoopStateFromCheckpoint'] {
    return this.supportService.loadToolLoopStateFromCheckpoint.bind(this.supportService);
  }

  public set loadToolLoopStateFromCheckpoint(value: AgentTaskWorkerSupportService['loadToolLoopStateFromCheckpoint']) {
    this.supportService.loadToolLoopStateFromCheckpoint = value;
  }

  public get mergeCheckpointData(): AgentTaskWorkerSupportService['mergeCheckpointData'] {
    return this.supportService.mergeCheckpointData.bind(this.supportService);
  }

  public set mergeCheckpointData(value: AgentTaskWorkerSupportService['mergeCheckpointData']) {
    this.supportService.mergeCheckpointData = value;
  }

  public get saveToolLoopCheckpoint(): AgentTaskWorkerSupportService['saveToolLoopCheckpoint'] {
    return this.supportService.saveToolLoopCheckpoint.bind(this.supportService);
  }

  public set saveToolLoopCheckpoint(value: AgentTaskWorkerSupportService['saveToolLoopCheckpoint']) {
    this.supportService.saveToolLoopCheckpoint = value;
  }

  public get mergeToolCall(): AgentTaskWorkerSupportService['mergeToolCall'] {
    return this.supportService.mergeToolCall.bind(this.supportService);
  }

  public set mergeToolCall(value: AgentTaskWorkerSupportService['mergeToolCall']) {
    this.supportService.mergeToolCall = value;
  }

  public get emitToolCallStatus(): AgentTaskWorkerSupportService['emitToolCallStatus'] {
    return this.supportService.emitToolCallStatus.bind(this.supportService);
  }

  public set emitToolCallStatus(value: AgentTaskWorkerSupportService['emitToolCallStatus']) {
    this.supportService.emitToolCallStatus = value;
  }

  public get appendToolCallTransition(): AgentTaskWorkerSupportService['appendToolCallTransition'] {
    return this.supportService.appendToolCallTransition.bind(this.supportService);
  }

  public set appendToolCallTransition(value: AgentTaskWorkerSupportService['appendToolCallTransition']) {
    this.supportService.appendToolCallTransition = value;
  }

  public get applyToolCallUpdate(): AgentTaskWorkerSupportService['applyToolCallUpdate'] {
    return this.supportService.applyToolCallUpdate.bind(this.supportService);
  }

  public set applyToolCallUpdate(value: AgentTaskWorkerSupportService['applyToolCallUpdate']) {
    this.supportService.applyToolCallUpdate = value;
  }

  public get resolveToolCallTransitions(): AgentTaskWorkerSupportService['resolveToolCallTransitions'] {
    return this.supportService.resolveToolCallTransitions.bind(this.supportService);
  }

  public set resolveToolCallTransitions(value: AgentTaskWorkerSupportService['resolveToolCallTransitions']) {
    this.supportService.resolveToolCallTransitions = value;
  }

  public get resolveToolPermissionAndBuildBlocks(): AgentTaskWorkerSupportService['resolveToolPermissionAndBuildBlocks'] {
    return this.supportService.resolveToolPermissionAndBuildBlocks.bind(this.supportService);
  }

  public set resolveToolPermissionAndBuildBlocks(value: AgentTaskWorkerSupportService['resolveToolPermissionAndBuildBlocks']) {
    this.supportService.resolveToolPermissionAndBuildBlocks = value;
  }

  public get executeMultiTurnLoop(): AgentTaskWorkerRuntimeService['executeMultiTurnLoop'] {
    return this.runtimeService.executeMultiTurnLoop.bind(this.runtimeService);
  }

  public set executeMultiTurnLoop(value: AgentTaskWorkerRuntimeService['executeMultiTurnLoop']) {
    this.runtimeService.executeMultiTurnLoop = value;
  }

  public get extractThinkingEventContent(): AgentTaskWorkerRuntimeService['extractThinkingEventContent'] {
    return this.runtimeService.extractThinkingEventContent.bind(this.runtimeService);
  }

  public set extractThinkingEventContent(value: AgentTaskWorkerRuntimeService['extractThinkingEventContent']) {
    this.runtimeService.extractThinkingEventContent = value;
  }

  public get shouldRequireToolPermission(): AgentTaskWorkerRuntimeService['shouldRequireToolPermission'] {
    return this.runtimeService.shouldRequireToolPermission.bind(this.runtimeService);
  }

  public set shouldRequireToolPermission(value: AgentTaskWorkerRuntimeService['shouldRequireToolPermission']) {
    this.runtimeService.shouldRequireToolPermission = value;
  }

  public get resolveEffectiveAutonomyMode(): AgentTaskWorkerRuntimeService['resolveEffectiveAutonomyMode'] {
    return this.runtimeService.resolveEffectiveAutonomyMode.bind(this.runtimeService);
  }

  public set resolveEffectiveAutonomyMode(value: AgentTaskWorkerRuntimeService['resolveEffectiveAutonomyMode']) {
    this.runtimeService.resolveEffectiveAutonomyMode = value;
  }

  public get resolveRawAutonomyMode(): AgentTaskWorkerRuntimeService['resolveRawAutonomyMode'] {
    return this.runtimeService.resolveRawAutonomyMode.bind(this.runtimeService);
  }

  public set resolveRawAutonomyMode(value: AgentTaskWorkerRuntimeService['resolveRawAutonomyMode']) {
    this.runtimeService.resolveRawAutonomyMode = value;
  }

  public get asRecord(): AgentTaskWorkerRuntimeService['asRecord'] {
    return this.runtimeService.asRecord.bind(this.runtimeService);
  }

  public set asRecord(value: AgentTaskWorkerRuntimeService['asRecord']) {
    this.runtimeService.asRecord = value;
  }

  public get readString(): AgentTaskWorkerRuntimeService['readString'] {
    return this.runtimeService.readString.bind(this.runtimeService);
  }

  public set readString(value: AgentTaskWorkerRuntimeService['readString']) {
    this.runtimeService.readString = value;
  }

  public get resolveNodeName(): AgentTaskWorkerRuntimeService['resolveNodeName'] {
    return this.runtimeService.resolveNodeName.bind(this.runtimeService);
  }

  public set resolveNodeName(value: AgentTaskWorkerRuntimeService['resolveNodeName']) {
    this.runtimeService.resolveNodeName = value;
  }

  public get handleInterventionTimeout(): AgentTaskWorkerRuntimeService['handleInterventionTimeout'] {
    return this.runtimeService.handleInterventionTimeout.bind(this.runtimeService);
  }

  public set handleInterventionTimeout(value: AgentTaskWorkerRuntimeService['handleInterventionTimeout']) {
    this.runtimeService.handleInterventionTimeout = value;
  }

  public get loadInterventionTimeoutContext(): AgentTaskWorkerRuntimeService['loadInterventionTimeoutContext'] {
    return this.runtimeService.loadInterventionTimeoutContext.bind(this.runtimeService);
  }

  public set loadInterventionTimeoutContext(value: AgentTaskWorkerRuntimeService['loadInterventionTimeoutContext']) {
    this.runtimeService.loadInterventionTimeoutContext = value;
  }

  public get loadEscalationRecipientIds(): AgentTaskWorkerRuntimeService['loadEscalationRecipientIds'] {
    return this.runtimeService.loadEscalationRecipientIds.bind(this.runtimeService);
  }

  public set loadEscalationRecipientIds(value: AgentTaskWorkerRuntimeService['loadEscalationRecipientIds']) {
    this.runtimeService.loadEscalationRecipientIds = value;
  }

  public get isOrgRole(): AgentTaskWorkerRuntimeService['isOrgRole'] {
    return this.runtimeService.isOrgRole.bind(this.runtimeService);
  }

  public set isOrgRole(value: AgentTaskWorkerRuntimeService['isOrgRole']) {
    this.runtimeService.isOrgRole = value;
  }

  public get isAuthenticationFailure(): AgentTaskWorkerRuntimeService['isAuthenticationFailure'] {
    return this.runtimeService.isAuthenticationFailure.bind(this.runtimeService);
  }

  public set isAuthenticationFailure(value: AgentTaskWorkerRuntimeService['isAuthenticationFailure']) {
    this.runtimeService.isAuthenticationFailure = value;
  }

  public get getNextSmartRoutingContext(): AgentTaskWorkerRuntimeService['getNextSmartRoutingContext'] {
    return this.runtimeService.getNextSmartRoutingContext.bind(this.runtimeService);
  }

  public set getNextSmartRoutingContext(value: AgentTaskWorkerRuntimeService['getNextSmartRoutingContext']) {
    this.runtimeService.getNextSmartRoutingContext = value;
  }

  public get buildFallbackRoutingDecision(): AgentTaskWorkerRuntimeService['buildFallbackRoutingDecision'] {
    return this.runtimeService.buildFallbackRoutingDecision.bind(this.runtimeService);
  }

  public set buildFallbackRoutingDecision(value: AgentTaskWorkerRuntimeService['buildFallbackRoutingDecision']) {
    this.runtimeService.buildFallbackRoutingDecision = value;
  }

  public get reportSmartRoutingOutcome(): AgentTaskWorkerRuntimeService['reportSmartRoutingOutcome'] {
    return this.runtimeService.reportSmartRoutingOutcome.bind(this.runtimeService);
  }

  public set reportSmartRoutingOutcome(value: AgentTaskWorkerRuntimeService['reportSmartRoutingOutcome']) {
    this.runtimeService.reportSmartRoutingOutcome = value;
  }

  public get resolveSmartRoutingModelInfo(): AgentTaskWorkerRuntimeService['resolveSmartRoutingModelInfo'] {
    return this.runtimeService.resolveSmartRoutingModelInfo.bind(this.runtimeService);
  }

  public set resolveSmartRoutingModelInfo(value: AgentTaskWorkerRuntimeService['resolveSmartRoutingModelInfo']) {
    this.runtimeService.resolveSmartRoutingModelInfo = value;
  }

  public get estimateTokenCount(): AgentTaskWorkerRuntimeService['estimateTokenCount'] {
    return this.runtimeService.estimateTokenCount.bind(this.runtimeService);
  }

  public set estimateTokenCount(value: AgentTaskWorkerRuntimeService['estimateTokenCount']) {
    this.runtimeService.estimateTokenCount = value;
  }

  public get shouldRetry(): AgentTaskWorkerRuntimeService['shouldRetry'] {
    return this.runtimeService.shouldRetry.bind(this.runtimeService);
  }

  public set shouldRetry(value: AgentTaskWorkerRuntimeService['shouldRetry']) {
    this.runtimeService.shouldRetry = value;
  }

  public get getMaxAttempts(): AgentTaskWorkerRuntimeService['getMaxAttempts'] {
    return this.runtimeService.getMaxAttempts.bind(this.runtimeService);
  }

  public set getMaxAttempts(value: AgentTaskWorkerRuntimeService['getMaxAttempts']) {
    this.runtimeService.getMaxAttempts = value;
  }

  public get resolveOrgId(): AgentTaskWorkerRuntimeService['resolveOrgId'] {
    return this.runtimeService.resolveOrgId.bind(this.runtimeService);
  }

  public set resolveOrgId(value: AgentTaskWorkerRuntimeService['resolveOrgId']) {
    this.runtimeService.resolveOrgId = value;
  }

  public get withTenantContext(): AgentTaskWorkerRuntimeService['withTenantContext'] {
    return this.runtimeService.withTenantContext.bind(this.runtimeService);
  }

  public set withTenantContext(value: AgentTaskWorkerRuntimeService['withTenantContext']) {
    this.runtimeService.withTenantContext = value;
  }

  private readonly logger = new Logger(AgentTaskWorker.name);
  private readonly supportService: AgentTaskWorkerSupportService;
  private readonly runtimeService: AgentTaskWorkerRuntimeService;

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
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
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
    @Optional()
    injectedSupportService?: AgentTaskWorkerSupportService,
    @Optional()
    injectedRuntimeService?: AgentTaskWorkerRuntimeService,
  ) {
    super();
    void throttleService;
    this.supportService =
      injectedSupportService ??
      new AgentTaskWorkerSupportService(db, agentRuntime, adapterFactory, stepStateMachine, nodeScheduler, throttleService, eventBridge, toolCallStateMachine, sessionPersistence, interventionPolicyService, notificationService, llmEncryptionService, smartRoutingService, organizationAutonomyPolicyService, workspaceIntegrationService, agentTaskQueue, circuitBreakerService, routingLearningProducer, memoryToolsService, memoryFusionService, skillResolverService);
    this.runtimeService =
      injectedRuntimeService ??
      new AgentTaskWorkerRuntimeService(this.supportService, db, agentRuntime, adapterFactory, stepStateMachine, nodeScheduler, throttleService, eventBridge, toolCallStateMachine, sessionPersistence, interventionPolicyService, notificationService, llmEncryptionService, smartRoutingService, organizationAutonomyPolicyService, workspaceIntegrationService, agentTaskQueue, circuitBreakerService, routingLearningProducer, memoryToolsService, memoryFusionService, skillResolverService);
  }

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async process(job: Job<AgentTaskJobData>): Promise<void> {
    if (job.name === 'intervention-timeout') {
      await this.runtimeService.handleInterventionTimeout(job);
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

    const [step] = await this.runtimeService.withTenantContext(tenantId, () =>
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
    const mcpServers = this.supportService.resolveSessionMcpServers(
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
    const sandboxNodeId = this.supportService.resolveWorkflowSandboxNodeId(
      workflowContextExtras,
    );
    const memorySessionIds = this.supportService.resolveMemorySessionIds(
      workflowContextExtras.memorySessionIds,
    );
    let sessionId = resumeSessionId;
    let accumulatedContent = '';
    let lastStopReason: string | undefined;
    let decision: Record<string, unknown> | undefined;
    let chunkIndex = 0;
    let toolCalls: ToolCallEvent[] = [];
    let segments: ConversationMessageSegmentRecord[] = [];
    const effectiveAutonomyMode = await this.runtimeService.resolveEffectiveAutonomyMode(
      tenantId,
      nodeData,
    );
    const llmCallStartedAt = Date.now();

    try {
      if (intervention) {
        await this.runtimeService.withTenantContext(tenantId, async () => {
          await this.supportService.handleIntervention({
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
        this.supportService.registerMemoryToolsProvider(runtime, sessionId, memorySessionIds);
        const toolLoopState = this.supportService.loadToolLoopStateFromCheckpoint(step);
        accumulatedContent = toolLoopState.partialContent;
        decision = toolLoopState.decision;
        chunkIndex = toolLoopState.chunkIndex;
        toolCalls = toolLoopState.toolCalls;
        segments = toolLoopState.segments;
        await this.supportService.startStepWorkspaceWatcher({
          executionId,
          stepId,
          tenantId,
          sandboxNodeId,
          enabled: Boolean(hasSandbox),
        });
        const contentBlocks = await this.supportService.resolveToolPermissionAndBuildBlocks({
          executionId,
          stepId,
          tenantId,
          step,
          toolPermission,
          nodeId: step.nodeId,
        });
        const resumedToolLoopState = this.supportService.loadToolLoopStateFromCheckpoint(step);
        const loopResult = await this.runtimeService.executeMultiTurnLoop({
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
          existingSegments: resumedToolLoopState.segments,
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
        toolCalls = loopResult.toolCalls;
        segments = loopResult.segments;
      } else {
        await this.runtimeService.withTenantContext(tenantId, async () => {
          await this.stepStateMachine.updateStepStatus(
            tenantId,
            stepId,
            'running',
          );
        });

        const isExistingSession = Boolean(sessionId);
        if (!sessionId) {
          const upstreamSkills = this.supportService.extractUpstreamSkills(input);
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

          const systemPrompt = await this.supportService.resolveWorkflowSystemPrompt(
            memorySessionIds,
            enrichedBasePrompt,
          );
          const nextSessionId = randomUUID();
          this.supportService.registerMemoryToolsProvider(
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
            ...this.supportService.getCheckpointData(step),
            session: this.sessionPersistence.serializeSession(session),
          };
          await this.sessionPersistence.saveToCheckpoint(
            tenantId,
            stepId,
            session,
          );
        }

        if (isExistingSession) {
          this.supportService.registerMemoryToolsProvider(
            runtime,
            sessionId,
            memorySessionIds,
          );
        }

        await this.supportService.startStepWorkspaceWatcher({
          executionId,
          stepId,
          tenantId,
          sandboxNodeId,
          enabled: Boolean(hasSandbox),
        });

        const initialContentBlocks = this.supportService.buildContentBlocks(input);
        const loopResult = await this.runtimeService.executeMultiTurnLoop({
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
            this.supportService.loadToolLoopStateFromCheckpoint(step).toolCalls,
          existingSegments: this.supportService.loadToolLoopStateFromCheckpoint(step).segments,
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
        toolCalls = loopResult.toolCalls;
        segments = loopResult.segments;
      }

      if (lastStopReason === 'intervention_required') {
        const requestedAt = new Date().toISOString();
        const nodeName = this.runtimeService.resolveNodeName(step);
        await this.runtimeService.withTenantContext(tenantId, async () => {
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
                ...(toolCalls.length > 0 ? { toolCalls } : {}),
                ...(segments.length > 0 ? { segments } : {}),
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

      const result: Record<string, unknown> = {
        content: accumulatedContent,
        'exec-out': { triggered: true },
      };
      if (lastStopReason && lastStopReason !== 'end_turn') {
        result.stopReason = lastStopReason;
      }
      if (decision) {
        result.decision = decision;
      }

      // E2EE: 加密 LLM 输出（如租户已配置加密密钥）
      let isEncrypted = false;
      try {
        const orgId = await this.runtimeService.resolveOrgId(tenantId);
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

      await this.supportService.archiveStepWorkspaceSnapshot({
        executionId,
        stepId,
        tenantId,
        step,
      });

      await this.runtimeService.withTenantContext(tenantId, async () => {
        await this.stepStateMachine.updateStepStatus(
          tenantId,
          stepId,
          'completed',
          {
            result,
            checkpointData: {
              ...this.supportService.getCheckpointData(step),
              ...(sessionId ? { sessionId } : {}),
              partialContent: accumulatedContent,
              ...(toolCalls.length > 0 ? { toolCalls } : {}),
              ...(segments.length > 0 ? { segments } : {}),
              ...(decision ? { decision } : {}),
            },
            ...(isEncrypted ? { isEncrypted } : {}),
          },
        );
      });
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        stepId,
      );
      await this.runtimeService.withTenantContext(tenantId, async () => {
        await this.nodeScheduler.onNodeCompleted(executionId, stepId, tenantId);
      });
      this.supportService.cleanupMemoryToolsProvider(runtime, sessionId, memorySessionIds);

      await this.runtimeService.reportSmartRoutingOutcome({
        tenantId,
        stepId,
        nodeData,
        smartRouting: job.data.smartRouting,
        success: true,
        latencyMs: Date.now() - llmCallStartedAt,
        tokenCount: this.runtimeService.estimateTokenCount(accumulatedContent),
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
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        ...(segments.length > 0 ? { segments } : {}),
        ...(decision ? { decision } : {}),
        attempts: allAttempts,
      };
      const smartRouting = job.data.smartRouting;
      const authenticationFailed = this.runtimeService.isAuthenticationFailure(err);
      const failureDecision = decideAgentTaskFailure({
        attemptsMade: job.attemptsMade,
        configuredAttempts: job.opts.attempts,
        accumulatedAttemptCount: allAttempts.length,
        authenticationFailed,
        recoverableRuntimeFailure: isRecoverableAgentRuntimeError(err),
        maxRecoverableRuntimeFailureAttempts:
          MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS,
        smartRouting,
      });

      await this.runtimeService.reportSmartRoutingOutcome({
        tenantId,
        stepId,
        nodeData,
        smartRouting,
        success: false,
        latencyMs: Date.now() - llmCallStartedAt,
        tokenCount: this.runtimeService.estimateTokenCount(finalAccumulatedContent),
        error: err,
      });


      if (failureDecision.kind === 'retry') {
        await this.runtimeService.withTenantContext(tenantId, async () => {
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
            maxAttempts: failureDecision.maxAttempts,
            errorMessage: err.message,
          },
        );
        throw err;
      }

      if (failureDecision.kind === 'fallback' && smartRouting) {
        const nextAttempt = allAttempts.length;
        const nextSmartRouting = failureDecision.nextSmartRouting;
        const fallbackMessage = `模型 ${smartRouting.selectedModelId} 调用失败，已切换到备用模型 ${nextSmartRouting.selectedModelId}。`;
        const fallbackDecision = this.runtimeService.buildFallbackRoutingDecision(
          smartRouting,
          nextSmartRouting,
          allAttempts,
          err,
        );
        let nextRoutingDecisionId: string | undefined;

        await this.runtimeService.withTenantContext(tenantId, async () => {
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

      if (failureDecision.kind === 'requeue_recoverable') {
        const recoveryMessage = '检测到运行时链路中断，系统将自动恢复执行。';

        await this.runtimeService.withTenantContext(tenantId, async () => {
          await this.tenantDb
            .update(schema.executionSteps)
            .set({ attemptCount: allAttempts.length })
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

        this.logger.warn(
          `Recoverable runtime failure detected, requeueing agent task: ${JSON.stringify({ executionId, stepId, tenantId, attempt: allAttempts.length, maxAttempts: MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS, error: err.message })}`,
        );
        this.stepStateMachine.broadcastStepRetry(
          tenantId,
          executionId,
          stepId,
          {
            attempt: allAttempts.length,
            maxAttempts: MAX_RECOVERABLE_RUNTIME_FAILURE_ATTEMPTS,
            errorMessage: `${err.message}；${recoveryMessage}`,
          },
        );
        await this.agentTaskQueue.add(
          'agent-task',
          {
            ...job.data,
            input,
            nodeData,
            workflowContext: job.data.workflowContext,
            ...(hasSandbox ? { hasSandbox: true } : {}),
          },
          {
            delay: RECOVERABLE_RUNTIME_FAILURE_REQUEUE_DELAY_MS,
          },
        );
        return;
      }

      const finalError =
        failureDecision.kind === 'fail' && failureDecision.fallbackExhausted
          ? new AllModelsFallbackExhaustedException(
              smartRouting?.routingNodeId ?? step.nodeId,
            )
          : err;

      await this.supportService.archiveStepWorkspaceSnapshot({
        executionId,
        stepId,
        tenantId,
        step,
      });
      const archivedWorkspaceSnapshotId =
        typeof step.checkpointData?.workspaceSnapshotId === 'string'
          ? step.checkpointData.workspaceSnapshotId
          : undefined;
      const terminalCheckpointData = {
        ...checkpointData,
        ...(archivedWorkspaceSnapshotId
          ? { workspaceSnapshotId: archivedWorkspaceSnapshotId }
          : {}),
      };

      await this.runtimeService.withTenantContext(tenantId, async () => {
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
            checkpointData: terminalCheckpointData,
          },
        );
      });
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        stepId,
      );
      await this.runtimeService.withTenantContext(tenantId, async () => {
        await this.nodeScheduler.onNodeFailed(executionId, stepId, tenantId);
      });
      this.supportService.cleanupMemoryToolsProvider(runtime, sessionId, memorySessionIds);
      throw finalError;
    } finally {
      this.workspaceIntegrationService.stopExecutionStepFileWatcher(
        executionId,
        stepId,
      );
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
      `Agent task failed: ${JSON.stringify({ stepId, executionId, tenantId, attempt: job.attemptsMade + 1, maxAttempts: this.runtimeService.getMaxAttempts(job), error: error.message })}`,
    );
  }


}
