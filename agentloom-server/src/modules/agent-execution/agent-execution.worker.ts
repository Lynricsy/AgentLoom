import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import type { ResolvedModelConfig } from '../llm/pi-ai-adapter';
import {
  mcpServerConfigs,
  memorySessions,
  type MemorySession,
} from '../../database/schema';
import { AgentAdapterFactory } from '../agent/agent-adapter.factory';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type {
  DecisionEvent,
  StopReason,
} from '../agent/types/agent-event.types';
import type { AgentSession } from '../agent/types/agent-session.types';
import type {
  ContentBlock,
  TextContentBlock,
} from '../agent/types/content-block.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import type { PreparationPhase } from '../execution/types/execution-event.types';
import {
  InputPreprocessorHandlerImpl,
  normalizeInputPreprocessorConfig,
} from '../execution/node-handlers/input-preprocessor.handler';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SelfEvolutionToolsProvider } from '../self-evolution/self-evolution-tools.provider';
import {
  SmartRoutingService,
} from '../smart-routing/smart-routing.service';
import type { RoutingStrategy } from '../smart-routing/dto/routing-context.dto';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';
import type {
  PiConfigInput,
  PiModelConfig,
  SkillInput,
} from '../sandbox/pi-config-generator.service';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import {
  MemoryResourceProvider,
  type MemoryResourceInstance,
} from '../agent-memory/memory-resource.provider';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import type { MemoryBootSequenceResult } from '../agent-memory/services/boot-protocol.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { ConversationTitleService } from '../agent-conversation/conversation-title.service';
import {
  appendTextConversationMessageSegment,
  appendThinkingConversationMessageSegment,
  ensureToolCallConversationMessageSegment,
  type ConversationMessageSegmentRecord,
} from '../agent-conversation/message-segments';
import { WorkspaceIntegrationService } from './workspace-integration.service';
import {
  type ExecuteSubAgentParams,
  type SubAgentCompletionNotice,
  type SubAgentHandle,
  type SubAgentResult,
  SubAgentRunStatus,
  SubAgentToolsProvider,
} from './subagent';
import {
  AGENT_CONVERSATION_EXECUTION_JOB,
  AGENT_CONVERSATION_EXECUTION_QUEUE,
  AGENT_CONVERSATION_IDLE_WAIT_MS,
  AgentExecutionService,
  type AgentConversationExecutionJobData,
} from './agent-execution.service';

type ConversationExecutionMetadata = {
  sessionId?: string;
  memorySessionIds?: string[];
  lastProcessedMessageId?: string;
  lastAssistantMessageId?: string;
  lastStopReason?: StopReason;
  runningState?: 'idle' | 'running' | 'failed' | 'cancelled';
};

type ConversationExecutionContext = {
  conversation: {
    id: string;
    agentDefinitionId: string;
    tenantId: string;
    status: 'active' | 'paused' | 'ended' | 'failed';
    metadata: Record<string, unknown>;
  };
  runtimeConfig: AgentRuntimeConfig;
  systemPrompt?: string;
  canvasNodes: AgentVersionSnapshot['nodes'];
  canvasEdges: AgentVersionSnapshot['edges'];
  hasSandbox: boolean;
  memoryInstanceIds: string[];
  executionMetadata: ConversationExecutionMetadata;
};

type PendingMessage = {
  id: string;
  content: string;
  createdAt: Date;
};

type ConversationHistoryMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: Record<string, unknown>[] | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type RuntimeSessionContext = {
  runtime: IAgentRuntime;
  session: AgentSession;
  memorySessionIds: string[];
  restoredExistingSession: boolean;
  sandboxReused: boolean;
  /** The last preparation phase reached before this context was returned. */
  lastPhase: PreparationPhase;
};

type SubAgentExecutionTracker = {
  abortControllers: Map<SubAgentHandle, AbortController>;
};

const DEFAULT_MEMORY_BOOT_URIS = [
  'system://boot',
  'system://index',
  'system://glossary',
];

type ConversationTurnResult = {
  assistantText: string;
  decision?: DecisionEvent;
  stopReason: StopReason;
  toolCalls: ToolCallEvent[];
  toolResults: Array<Record<string, unknown>>;
  segments: ConversationMessageSegmentRecord[];
};

class ConversationTurnFailedError extends Error {
  constructor(
    cause: unknown,
    readonly turnResult: ConversationTurnResult,
  ) {
    super(
      cause instanceof Error ? cause.message : 'Agent conversation turn failed',
    );
    this.name = 'ConversationTurnFailedError';
    if (cause instanceof Error && cause.stack) {
      this.stack = cause.stack;
    }
    this.cause = cause;
  }
}

@Injectable()
@Processor(AGENT_CONVERSATION_EXECUTION_QUEUE)
export class AgentExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(AgentExecutionWorker.name);
  private readonly inputPreprocessorHandler =
    new InputPreprocessorHandlerImpl();

  constructor(
    private readonly db: DrizzleDB,
    private readonly agentRuntime: IAgentRuntime,
    private readonly adapterFactory: AgentAdapterFactory,
    private readonly executionService: AgentExecutionService,
    private readonly eventBridge: EventBridgeService,
    private readonly sandboxService: SandboxService,
    private readonly workspaceIntegrationService: WorkspaceIntegrationService,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly llmService?: LlmService,
    private readonly memoryToolsService?: MemoryToolsService,
    private readonly memoryFusionService?: MemoryFusionService,
    private readonly memoryResourceProvider?: MemoryResourceProvider,
    private readonly skillResolverService?: SkillResolverService,
    private readonly subAgentToolsProvider?: SubAgentToolsProvider,
    private readonly mcpService?: McpService,
    private readonly conversationTitleService?: ConversationTitleService,
    private readonly selfEvolutionToolsProvider?: SelfEvolutionToolsProvider,
    private readonly smartRoutingService?: SmartRoutingService,
  ) {
    super();
  }

  async process(job: Job<AgentConversationExecutionJobData>): Promise<void> {
    if (job.name !== AGENT_CONVERSATION_EXECUTION_JOB) {
      return;
    }

    await this.executeAgentLoop(job.data.conversationId, job.data.tenantId);
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<AgentConversationExecutionJobData> | undefined,
    error: Error,
  ) {
    if (!job) {
      return;
    }

    this.logger.error(
      `Agent conversation job failed for ${job.data.conversationId}: ${error.message}`,
      error.stack,
    );
  }

  async executeAgentLoop(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const abort = new AbortController();
    const activeRun = this.executionService.registerActiveRun(
      conversationId,
      abort,
    );

    if (!activeRun) {
      this.logger.debug(
        `Conversation ${conversationId} already has an active execution loop`,
      );
      return;
    }

    let runtime: IAgentRuntime | null = null;
    let session: AgentSession | null = null;
    let executionMetadata: ConversationExecutionMetadata = {};
    let conversationMetadata: Record<string, unknown> = {};
    let terminalStatus: 'completed' | 'cancelled' | 'failed' = 'completed';
    let conversationStatus: 'active' | 'paused' | 'ended' | 'failed' = 'active';
    let memorySessionIds: string[] = [];
    let currentPhase: PreparationPhase = 'queued';
    let currentPendingMessages: PendingMessage[] = [];
    const subAgentTracker: SubAgentExecutionTracker = {
      abortControllers: new Map(),
    };

    try {
      // Phase 1: queued — worker has picked up the job
      this.emitPreparationPhase(tenantId, conversationId, 'queued');

      // Phase 2: preparing — loading conversation execution context
      currentPhase = 'preparing';
      this.emitPreparationPhase(tenantId, conversationId, 'preparing');

      const context = await this.loadConversationExecutionContext(
        conversationId,
        tenantId,
      );

      if (!context) {
        return;
      }

      executionMetadata = context.executionMetadata;
      conversationMetadata = context.conversation.metadata;
      conversationStatus = context.conversation.status;

      if (context.conversation.status !== 'active') {
        terminalStatus =
          context.conversation.status === 'failed' ? 'failed' : 'cancelled';
        await this.cleanupConversationMemorySessions(
          tenantId,
          executionMetadata.memorySessionIds,
        );
        return;
      }

      let seededPendingMessages: PendingMessage[] = [];
      if (
        !executionMetadata.sessionId &&
        this.extractStringArray(
          context.runtimeConfig.routingConfig?.candidateModelIds,
        ).length > 0
      ) {
        seededPendingMessages = await this.loadPendingUserMessages(
          conversationId,
          tenantId,
          executionMetadata.lastProcessedMessageId,
        );
      }

      // Phases 3-4 are emitted inside prepareRuntimeSession
      currentPhase = 'sandbox_creating';
      const runtimeSessionContext = await this.prepareRuntimeSession(
        context,
        conversationId,
        tenantId,
        abort.signal,
        subAgentTracker,
        context.conversation.agentDefinitionId,
        seededPendingMessages,
      );
      currentPhase = runtimeSessionContext.lastPhase;
      runtime = runtimeSessionContext.runtime;
      session = runtimeSessionContext.session;
      memorySessionIds = runtimeSessionContext.memorySessionIds ?? [];
      let shouldRebuildHistoryOnce =
        Boolean(context.executionMetadata.lastProcessedMessageId) &&
        !runtimeSessionContext.restoredExistingSession;

      const cancelRuntime = async () => {
        if (!runtime || !session) {
          return;
        }

        try {
          await runtime.cancel(session.id);
        } catch (error) {
          this.logger.warn(
            `Failed to cancel runtime session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };

      const cancelSubAgents = () => {
        this.abortTrackedSubAgents(subAgentTracker, abort.signal.reason);
      };

      abort.signal.addEventListener(
        'abort',
        () => {
          cancelSubAgents();
          void cancelRuntime();
        },
        { once: true },
      );

      executionMetadata = await this.updateExecutionMetadata(
        tenantId,
        conversationId,
        {
          sessionId: session.id,
          ...(memorySessionIds.length ? { memorySessionIds } : {}),
          runningState: 'running',
        },
      );
      conversationMetadata = this.writeExecutionMetadata(
        conversationMetadata,
        executionMetadata,
      );

      // Phase 5: running — agent loop is starting
      currentPhase = 'running';
      this.emitPreparationPhase(tenantId, conversationId, 'running', {
        sandboxReused: runtimeSessionContext.sandboxReused,
      });

      while (!abort.signal.aborted) {
        currentPendingMessages =
          seededPendingMessages.length > 0
            ? seededPendingMessages
            : await this.loadPendingUserMessages(
                conversationId,
                tenantId,
                executionMetadata.lastProcessedMessageId,
              );
        seededPendingMessages = [];

        if (currentPendingMessages.length === 0) {
          const waitResult = await this.executionService.waitForNotification(
            conversationId,
            abort.signal,
            AGENT_CONVERSATION_IDLE_WAIT_MS,
          );

          if (waitResult === 'notified') {
            continue;
          }

          if (waitResult === 'aborted') {
            terminalStatus = 'cancelled';
          }

          break;
        }

        const historyMessages =
          executionMetadata.lastProcessedMessageId && shouldRebuildHistoryOnce
            ? await this.loadConversationHistoryMessages(
                conversationId,
                tenantId,
                currentPendingMessages[0]?.id,
              )
            : [];

        const turnResult = await this.runConversationTurn(
          runtime,
          session,
          conversationId,
          tenantId,
          currentPendingMessages,
          Boolean(executionMetadata.lastProcessedMessageId),
          historyMessages,
        );

        const hadPriorAssistant = !!executionMetadata.lastAssistantMessageId;

        executionMetadata = await this.persistConversationTurn(
          conversationId,
          tenantId,
          currentPendingMessages,
          turnResult,
          session.id,
        );
        conversationMetadata = this.writeExecutionMetadata(
          conversationMetadata,
          executionMetadata,
        );
        shouldRebuildHistoryOnce = false;

        // 首轮 assistant 回复后自动生成标题（fire-and-forget）
        if (
          !hadPriorAssistant &&
          executionMetadata.lastAssistantMessageId &&
          this.conversationTitleService
        ) {
          this.conversationTitleService
            .generateTitle(conversationId, tenantId)
            .catch(() => {});
        }

        if (turnResult.stopReason === 'cancelled') {
          terminalStatus = 'cancelled';
          break;
        }

        currentPendingMessages = [];
      }
    } catch (error) {
      terminalStatus = abort.signal.aborted ? 'cancelled' : 'failed';
      const errorSummary = this.describeConversationExecutionError(error);
      const errorMessage = errorSummary.errorMessage;

      if (
        error instanceof ConversationTurnFailedError &&
        session &&
        currentPendingMessages.length > 0 &&
        this.turnResultHasPersistableOutput(error.turnResult)
      ) {
        try {
          executionMetadata = await this.persistConversationTurn(
            conversationId,
            tenantId,
            currentPendingMessages,
            error.turnResult,
            session.id,
            {
              incomplete: true,
              errorMessage,
              ...(errorSummary.errorCode
                ? { errorCode: errorSummary.errorCode }
                : {}),
              ...(errorSummary.rawErrorMessage
                ? { rawErrorMessage: errorSummary.rawErrorMessage }
                : {}),
            },
          );
          conversationMetadata = this.writeExecutionMetadata(
            conversationMetadata,
            executionMetadata,
          );
          currentPendingMessages = [];
        } catch (persistError) {
          this.logger.warn(
            `Failed to persist partial assistant turn for ${conversationId}: ${
              persistError instanceof Error
                ? persistError.message
                : String(persistError)
            }`,
          );
        }
      }

      await this.safeUpdateExecutionMetadata(tenantId, conversationId, {
        ...executionMetadata,
        runningState: terminalStatus,
      });

      if (terminalStatus === 'failed') {
        await this.cleanupConversationMemorySessions(
          tenantId,
          executionMetadata.memorySessionIds ?? memorySessionIds,
        );
      }

      this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
        executionId: conversationId,
        status: terminalStatus,
        executionType: 'conversation',
        errorMessage,
        ...(terminalStatus === 'failed' && errorMessage
          ? { error: errorMessage }
          : {}),
        // Attach the phase where failure occurred so clients can show which step failed
        ...(terminalStatus === 'failed' && currentPhase !== 'running'
          ? { failedPhase: currentPhase }
          : {}),
      });

      if (!abort.signal.aborted) {
        throw error;
      }

      return;
    } finally {
      this.executionService.clearActiveRun(conversationId, abort);
    }

    await this.safeUpdateExecutionMetadata(tenantId, conversationId, {
      ...executionMetadata,
      runningState: terminalStatus === 'completed' ? 'idle' : terminalStatus,
    });

    if (conversationStatus !== 'active') {
      await this.cleanupConversationMemorySessions(
        tenantId,
        executionMetadata.memorySessionIds ?? memorySessionIds,
      );
    }

    this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
      executionId: conversationId,
      status: terminalStatus,
      executionType: 'conversation',
    });
  }

  private async loadConversationExecutionContext(
    conversationId: string,
    tenantId: string,
  ): Promise<ConversationExecutionContext | null> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const [conversation] = await dbClient
        .select({
          id: agentConversations.id,
          agentDefinitionId: agentConversations.agentDefinitionId,
          tenantId: agentConversations.tenantId,
          status: agentConversations.status,
          metadata: agentConversations.metadata,
        })
        .from(agentConversations)
        .where(eq(agentConversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        return null;
      }

      const [definition] = await dbClient
        .select({
          id: agentDefinitions.id,
          publishedVersionId: agentDefinitions.publishedVersionId,
          systemPrompt: agentDefinitions.systemPrompt,
          nodes: agentDefinitions.nodes,
          edges: agentDefinitions.edges,
          sandboxConfig: agentDefinitions.sandboxConfig,
          metadata: agentDefinitions.metadata,
        })
        .from(agentDefinitions)
        .where(eq(agentDefinitions.id, conversation.agentDefinitionId))
        .limit(1);

      if (!definition) {
        return null;
      }

      let runtimeConfig: AgentRuntimeConfig;
      let systemPrompt = definition.systemPrompt ?? undefined;
      let snapshot: AgentVersionSnapshot | null = null;

      if (definition.publishedVersionId) {
        const [version] = await dbClient
          .select({ snapshot: agentVersions.snapshot })
          .from(agentVersions)
          .where(
            and(
              eq(agentVersions.id, definition.publishedVersionId),
              eq(agentVersions.agentDefinitionId, definition.id),
            ),
          )
          .limit(1);
        snapshot = version?.snapshot ?? null;
      }

      if (snapshot) {
        runtimeConfig = this.agentDefinitionService.buildRuntimeConfigFromNodes(
          snapshot.nodes,
          snapshot.edges,
        );
        runtimeConfig.sandboxConfig = resolveAgentRuntimeSandboxConfig(
          snapshot.sandboxConfig ?? definition.sandboxConfig,
        );
        systemPrompt =
          snapshot.systemPrompt ?? definition.systemPrompt ?? undefined;
      } else {
        runtimeConfig = await this.agentDefinitionService.compileCanvas(
          definition.id,
        );
        runtimeConfig.sandboxConfig = resolveAgentRuntimeSandboxConfig(
          runtimeConfig.sandboxConfig ?? definition.sandboxConfig,
        );
      }

      const compiledMemoryInstanceIds = this.extractStringArray(
        runtimeConfig.memoryInstanceIds,
      );
      const memoryInstanceIds = compiledMemoryInstanceIds.length
        ? compiledMemoryInstanceIds
        : this.resolveDefaultMemoryInstanceIds(
            definition.metadata,
            snapshot?.metadata,
          );
      runtimeConfig.memoryInstanceIds = memoryInstanceIds;

      return {
        conversation,
        runtimeConfig,
        systemPrompt,
        canvasNodes: snapshot?.nodes ?? definition.nodes ?? [],
        canvasEdges: snapshot?.edges ?? definition.edges ?? [],
        hasSandbox: true,
        memoryInstanceIds,
        executionMetadata: this.readExecutionMetadata(conversation.metadata),
      };
    });
  }

  private async resolveConversationStartupRuntimeConfig(
    runtimeConfig: AgentRuntimeConfig,
    tenantId: string,
    pendingMessages: PendingMessage[],
  ): Promise<AgentRuntimeConfig> {
    const routingConfig = runtimeConfig.routingConfig;
    const candidateModelIds = this.extractStringArray(
      routingConfig?.candidateModelIds,
    );

    if (!routingConfig || candidateModelIds.length === 0) {
      return runtimeConfig;
    }

    const selectedModelId = await this.selectConversationRoutingModelId({
      tenantId,
      routingConfig,
      candidateModelIds,
      pendingMessages,
    });

    if (!selectedModelId) {
      return runtimeConfig;
    }

    return {
      ...runtimeConfig,
      modelConfig: {
        ...(runtimeConfig.modelConfig ?? {}),
        modelId: selectedModelId,
      },
      routingConfig: {
        ...routingConfig,
        candidateModelIds,
      },
    };
  }

  private async selectConversationRoutingModelId(params: {
    tenantId: string;
    routingConfig: NonNullable<AgentRuntimeConfig['routingConfig']>;
    candidateModelIds: string[];
    pendingMessages: PendingMessage[];
  }): Promise<string | undefined> {
    if (params.candidateModelIds.length === 1) {
      return params.candidateModelIds[0];
    }

    const strategy = this.normalizeConversationRoutingStrategy(
      params.routingConfig.strategy,
    );
    if (!strategy || !this.smartRoutingService) {
      return params.candidateModelIds[0];
    }

    const latestPrompt = this.formatLatestPendingMessages(params.pendingMessages);

    try {
      const decision = await this.smartRoutingService.evaluate(
        params.candidateModelIds,
        {
          inputTokenCount: this.estimateConversationTokenCount(latestPrompt),
          taskType: 'agent_conversation',
        },
        strategy,
        params.tenantId,
      );
      return decision.selectedModelId;
    } catch (error) {
      this.logger.warn(
        `Conversation smart routing failed, falling back to first candidate: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return params.candidateModelIds[0];
    }
  }

  private normalizeConversationRoutingStrategy(
    value: string | undefined,
  ): RoutingStrategy | null {
    const normalized = value?.trim();
    if (!normalized) {
      return 'FALLBACK_CHAIN';
    }

    const aliases: Record<string, RoutingStrategy> = {
      TOKEN_OPTIMIZED: 'TOKEN_OPTIMIZED',
      token_optimized: 'TOKEN_OPTIMIZED',
      COST_OPTIMIZED: 'COST_OPTIMIZED',
      cost_optimized: 'COST_OPTIMIZED',
      QUALITY_FIRST: 'QUALITY_FIRST',
      quality_first: 'QUALITY_FIRST',
      LATENCY_FIRST: 'LATENCY_FIRST',
      latency_first: 'LATENCY_FIRST',
      HISTORICAL_BEST: 'HISTORICAL_BEST',
      historical_best: 'HISTORICAL_BEST',
      FALLBACK_CHAIN: 'FALLBACK_CHAIN',
      fallback_chain: 'FALLBACK_CHAIN',
    };

    return aliases[normalized] ?? null;
  }

  private estimateConversationTokenCount(value: unknown): number {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value ?? {});
    return Math.max(0, Math.ceil(serialized.length / 4));
  }

  private async prepareRuntimeSession(
    context: ConversationExecutionContext,
    conversationId: string,
    tenantId: string,
    parentAbortSignal: AbortSignal,
    subAgentTracker: SubAgentExecutionTracker,
    currentAgentDefinitionId: string,
    initialPendingMessages: PendingMessage[] = [],
  ): Promise<RuntimeSessionContext> {
    context.runtimeConfig = await this.resolveConversationStartupRuntimeConfig(
      context.runtimeConfig,
      tenantId,
      initialPendingMessages,
    );
    const runtime = this.resolveConversationRuntime(context);
    const memorySessionIds = await this.ensureConversationMemorySessions(
      context,
      conversationId,
      tenantId,
    );

    // Standalone Agent conversations now always execute inside the sandbox
    // runtime so pi-coding-agent remains the single agent loop / LLM entry.
    const skillPayloads = await this.resolveSkillPayloads(context);
    const piConfigInput = await this.buildPiConfigInput({
      tenantId,
      runtimeConfig: context.runtimeConfig,
      systemPrompt: context.systemPrompt,
      skillPayloads,
    });

    // Check for existing sandbox session to detect reuse *before* calling
    // sandboxService.createSandboxSession, so we can decide whether to emit
    // the sandbox_creating phase.
    const existingSession = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );
    const sandboxReused = existingSession != null;

    if (!sandboxReused) {
      // Phase 3: sandbox_creating — no existing session, a new container will be spun up
      this.emitPreparationPhase(tenantId, conversationId, 'sandbox_creating');
    }

    await this.sandboxService.createSandboxSession({
      sandboxNodeId: null,
      config: context.runtimeConfig.sandboxConfig!,
      tenantId,
      agentConversationId: conversationId,
      piConfigInput,
    });

    // Phase 4: agent_initializing — sandbox ready, creating agent runtime session
    this.emitPreparationPhase(tenantId, conversationId, 'agent_initializing', {
      sandboxReused,
    });

    const sessionId = context.executionMetadata.sessionId;
    if (sessionId) {
      try {
        const session = await runtime.loadSession(sessionId);
        this.registerMemoryToolsProvider(runtime, session.id, memorySessionIds);
        await this.registerSelfEvolutionToolsProvider({
          runtime,
          sessionId: session.id,
          runtimeConfig: context.runtimeConfig,
          conversationId,
          tenantId,
          currentAgentDefinitionId,
        });
        this.registerSubAgentToolsProvider({
          runtime,
          sessionId: session.id,
          runtimeConfig: context.runtimeConfig,
          conversationId,
          tenantId,
          parentAbortSignal,
          currentAgentDefinitionId,
          currentDepth: 0,
          subAgentTracker,
        });
        await this.startConversationWorkspaceWatcher(conversationId, tenantId);
        return {
          runtime,
          session,
          memorySessionIds,
          restoredExistingSession: true,
          sandboxReused,
          lastPhase: 'agent_initializing',
        };
      } catch (error) {
        this.logger.debug(
          `Failed to resume conversation session ${sessionId}, creating a new one: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // For sandbox path, skills are passed as independent files via piConfigInput
    // so the system prompt should not include skill content.
    // For non-sandbox path, embed skills into the system prompt as before.
    const baseSystemPrompt = context.hasSandbox
      ? context.systemPrompt
      : await this.resolveConversationSkillPrompt(context);

    const systemPrompt = await this.resolveConversationSystemPrompt(
      memorySessionIds,
      baseSystemPrompt,
    );

    const nextSessionId = randomUUID();
    this.registerMemoryToolsProvider(runtime, nextSessionId, memorySessionIds);
    await this.registerSelfEvolutionToolsProvider({
      runtime,
      sessionId: nextSessionId,
      runtimeConfig: context.runtimeConfig,
      conversationId,
      tenantId,
      currentAgentDefinitionId,
    });
    this.registerSubAgentToolsProvider({
      runtime,
      sessionId: nextSessionId,
      runtimeConfig: context.runtimeConfig,
      conversationId,
      tenantId,
      parentAbortSignal,
      currentAgentDefinitionId,
      currentDepth: 0,
      subAgentTracker,
    });

    let session: AgentSession;
    try {
      session = await runtime.createSession({
        sessionId: nextSessionId,
        agentId: context.conversation.agentDefinitionId,
        mode: 'conversation',
        tenantId,
        llmModelConfigId: context.runtimeConfig.modelConfig?.modelId,
        systemPrompt,
        runtimeConfig: context.runtimeConfig,
        serverSandbox: { agentConversationId: conversationId },
        context: {
          tenantId,
          agentConversationId: conversationId,
          serverSandbox: { agentConversationId: conversationId },
          ...(memorySessionIds.length ? { memorySessionIds } : {}),
        },
      });
    } catch (error) {
      runtime.unregisterSessionToolProvider?.(nextSessionId);
      throw error;
    }

    await this.startConversationWorkspaceWatcher(conversationId, tenantId);

    return {
      runtime,
      session,
      memorySessionIds,
      restoredExistingSession: false,
      sandboxReused,
      lastPhase: 'agent_initializing',
    };
  }

  private resolveConversationRuntime(
    context: ConversationExecutionContext,
  ): IAgentRuntime {
    void context;
    void this.agentRuntime;
    return this.adapterFactory.selectAdapter(true);
  }

  private async startConversationWorkspaceWatcher(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const sandboxSession = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );

    if (!sandboxSession?.containerId) {
      return;
    }

    this.workspaceIntegrationService.startFileWatcher(
      conversationId,
      tenantId,
      sandboxSession.containerId,
    );
  }

  private async loadPendingUserMessages(
    conversationId: string,
    tenantId: string,
    lastProcessedMessageId?: string,
  ): Promise<PendingMessage[]> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const messages = await dbClient
        .select({
          id: agentMessages.id,
          content: agentMessages.content,
          createdAt: agentMessages.createdAt,
        })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.conversationId, conversationId),
            eq(agentMessages.role, 'user'),
          ),
        )
        .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id));

      if (!lastProcessedMessageId) {
        return messages;
      }

      const lastProcessedIndex = messages.findIndex(
        (message) => message.id === lastProcessedMessageId,
      );

      if (lastProcessedIndex < 0) {
        return messages;
      }

      return messages.slice(lastProcessedIndex + 1);
    });
  }

  private async loadConversationHistoryMessages(
    conversationId: string,
    tenantId: string,
    beforeMessageId?: string,
  ): Promise<ConversationHistoryMessage[]> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const messages = await dbClient
        .select({
          id: agentMessages.id,
          role: agentMessages.role,
          content: agentMessages.content,
          toolCalls: agentMessages.toolCalls,
          metadata: agentMessages.metadata,
          createdAt: agentMessages.createdAt,
        })
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId))
        .orderBy(asc(agentMessages.createdAt), asc(agentMessages.id));

      if (!beforeMessageId) {
        return messages;
      }

      const boundaryIndex = messages.findIndex(
        (message) => message.id === beforeMessageId,
      );

      return boundaryIndex >= 0 ? messages.slice(0, boundaryIndex) : messages;
    });
  }

  private async runConversationTurn(
    runtime: IAgentRuntime,
    session: AgentSession,
    conversationId: string,
    tenantId: string,
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
    historyMessages: ConversationHistoryMessage[] = [],
  ): Promise<ConversationTurnResult> {
    const toolCalls = new Map<string, ToolCallEvent>();
    let assistantText = '';
    let decision: DecisionEvent | undefined;
    let lastStopReason: StopReason = 'end_turn';
    let chunkIndex = 0;
    let segments: ConversationMessageSegmentRecord[] = [];
    const latestPromptText = await this.applyConversationInputPreprocessors(
      this.formatLatestPendingMessages(pendingMessages),
      session.runtimeConfig,
    );
    let promptBlocks = this.buildPromptBlocks(
      pendingMessages,
      hasPriorTurns,
      historyMessages,
      latestPromptText,
    );

    while (true) {
      try {
        for await (const event of runtime.prompt(session.id, promptBlocks)) {
          if (event.type === 'message_chunk') {
            assistantText += event.content;
            segments = appendTextConversationMessageSegment(
              segments,
              event.content,
            );
            this.eventBridge.emitOutputChunk(tenantId, conversationId, {
              stepId: conversationId,
              chunk: event.content,
              index: chunkIndex,
              executionType: 'conversation',
            });
            chunkIndex += 1;
            continue;
          }

          const thinkingContent = this.extractThinkingEventContent(event);
          if (thinkingContent) {
            segments = appendThinkingConversationMessageSegment(
              segments,
              thinkingContent,
            );
          }

          this.eventBridge.emitStepAgentEvent(tenantId, conversationId, {
            stepId: conversationId,
            executionType: 'conversation',
            event,
          });

          if (event.type === 'tool_call') {
            const nextCall = this.mergeToolCallEvent(
              toolCalls.get(event.call.id),
              event.call,
            );
            toolCalls.set(nextCall.id, nextCall);
            segments = ensureToolCallConversationMessageSegment(
              segments,
              nextCall.id,
            );
            this.eventBridge.emitToolCallStatus(tenantId, conversationId, {
              stepId: conversationId,
              nodeId: conversationId,
              toolCallId: nextCall.id,
              tool: nextCall.tool,
              executionType: 'conversation',
              status: nextCall.status,
              args: nextCall.args,
              result: nextCall.result,
              error: nextCall.error,
              permissionRequest: nextCall.permissionRequest,
              transitions: nextCall.transitions
                ? [...nextCall.transitions]
                : undefined,
            });
            continue;
          }

          if (event.type === 'decision') {
            decision = event;
            continue;
          }

          if (event.type === 'done') {
            lastStopReason = event.stopReason;
          }
        }
      } catch (error) {
        throw new ConversationTurnFailedError(
          error,
          this.buildConversationTurnResult(
            assistantText,
            decision,
            lastStopReason,
            toolCalls,
            segments,
          ),
        );
      }

      if (lastStopReason !== 'tool_use') {
        break;
      }

      promptBlocks = [];
    }

    return this.buildConversationTurnResult(
      assistantText,
      decision,
      lastStopReason,
      toolCalls,
      segments,
    );
  }

  private buildConversationTurnResult(
    assistantText: string,
    decision: DecisionEvent | undefined,
    stopReason: StopReason,
    toolCalls: Map<string, ToolCallEvent>,
    segments: ConversationMessageSegmentRecord[],
  ): ConversationTurnResult {
    const toolCallList = [...toolCalls.values()];
    const toolResults = toolCallList
      .filter((call) => call.result !== undefined || call.error !== undefined)
      .map((call) => ({
        toolCallId: call.id,
        tool: call.tool,
        status: call.status,
        ...(call.result !== undefined ? { result: call.result } : {}),
        ...(call.error !== undefined ? { error: call.error } : {}),
      }));

    return {
      assistantText,
      decision,
      stopReason,
      toolCalls: toolCallList,
      toolResults,
      segments,
    };
  }

  private turnResultHasPersistableOutput(
    turnResult: ConversationTurnResult,
  ): boolean {
    return (
      turnResult.assistantText.length > 0 ||
      turnResult.toolCalls.length > 0 ||
      turnResult.toolResults.length > 0 ||
      turnResult.segments.length > 0 ||
      Boolean(turnResult.decision)
    );
  }

  private describeConversationExecutionError(error: unknown): {
    errorMessage: string;
    errorCode?: string;
    rawErrorMessage?: string;
  } {
    const target =
      error instanceof ConversationTurnFailedError && error.cause
        ? error.cause
        : error;

    if (!(target instanceof Error)) {
      return {
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Agent conversation execution failed',
      };
    }

    const errorCode = this.readErrorCode(target);
    const rawErrorMessage =
      this.readStringValue(
        this.isRecord(target) ? target['rawMessage'] : undefined,
      ) ?? target.message;

    return {
      errorMessage: this.formatConversationExecutionErrorMessage(
        errorCode,
        rawErrorMessage,
      ),
      ...(errorCode ? { errorCode } : {}),
      ...(rawErrorMessage ? { rawErrorMessage } : {}),
    };
  }

  private formatConversationExecutionErrorMessage(
    errorCode: string | undefined,
    rawErrorMessage: string,
  ): string {
    if (errorCode === 'MODEL_PROVIDER_ERROR') {
      const label = this.isUpstreamModelStreamAbort(rawErrorMessage)
        ? '上游模型流中断'
        : '模型提供方错误';
      return `${label}（${errorCode}: ${rawErrorMessage}）`;
    }

    if (this.isUpstreamModelStreamAbort(rawErrorMessage)) {
      return `上游模型流中断（${rawErrorMessage}）`;
    }

    return rawErrorMessage;
  }

  private isUpstreamModelStreamAbort(message: string): boolean {
    return /terminated|STREAM_UPSTREAM_ABORTED|upstream.?aborted|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|timed? out|timeout/i.test(
      message,
    );
  }

  private readErrorCode(error: Error): string | undefined {
    if (!this.isRecord(error)) {
      return undefined;
    }

    return this.readStringValue(error['code']);
  }

  private mergeToolCallEvent(
    previous: ToolCallEvent | undefined,
    next: ToolCallEvent,
  ): ToolCallEvent {
    return {
      ...next,
      tool:
        this.hasConcreteToolName(next.tool) || !previous
          ? next.tool
          : previous.tool,
      args:
        this.hasConcreteToolArgs(next.args) || !previous
          ? next.args
          : previous.args,
      ...(next.transitions
        ? { transitions: next.transitions }
        : previous?.transitions
          ? { transitions: previous.transitions }
          : {}),
      ...(next.result !== undefined
        ? { result: next.result }
        : previous?.result !== undefined
          ? { result: previous.result }
          : {}),
      ...(next.error !== undefined
        ? { error: next.error }
        : previous?.error !== undefined
          ? { error: previous.error }
          : {}),
      ...(next.permissionRequest
        ? { permissionRequest: next.permissionRequest }
        : previous?.permissionRequest
          ? { permissionRequest: previous.permissionRequest }
          : {}),
    };
  }

  private hasConcreteToolName(tool: string | undefined): boolean {
    return (
      typeof tool === 'string' && tool.length > 0 && tool !== 'unknown_tool'
    );
  }

  private hasConcreteToolArgs(
    args: Record<string, unknown> | undefined,
  ): boolean {
    return !!args && Object.keys(args).length > 0;
  }

  private extractThinkingEventContent(event: {
    type?: unknown;
    content?: unknown;
    rationale?: unknown;
    suggestedContent?: unknown;
  }): string | undefined {
    switch (event.type) {
      case 'thinking':
      case 'plan':
        return this.readStringValue(event.content);
      case 'decision': {
        const rationale = this.readStringValue(event.rationale);
        const suggestedContent = this.readStringValue(event.suggestedContent);
        const parts = [rationale, suggestedContent].filter(Boolean);
        return parts.length > 0 ? parts.join('\n\n') : undefined;
      }
      default:
        return undefined;
    }
  }

  private async persistConversationTurn(
    conversationId: string,
    tenantId: string,
    pendingMessages: PendingMessage[],
    turnResult: ConversationTurnResult,
    sessionId: string,
    options?: {
      incomplete?: boolean;
      errorMessage?: string;
      errorCode?: string;
      rawErrorMessage?: string;
    },
  ): Promise<ConversationExecutionMetadata> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const currentMetadata = await this.loadConversationMetadata(
        dbClient,
        conversationId,
      );
      let lastAssistantMessageId: string | undefined;
      const isEmptyTurn =
        turnResult.assistantText.length === 0 &&
        turnResult.toolCalls.length === 0 &&
        !turnResult.decision;

      if (pendingMessages.length > 0 && turnResult.stopReason !== 'cancelled') {
        const [assistantMessage] = await dbClient
          .insert(agentMessages)
          .values({
            conversationId,
            tenantId,
            role: 'assistant',
            content: turnResult.assistantText,
            toolCalls:
              turnResult.toolCalls.length > 0
                ? turnResult.toolCalls.map((call) => ({
                    id: call.id,
                    tool: call.tool,
                    args: call.args,
                    status: call.status,
                    ...(call.transitions
                      ? { transitions: [...call.transitions] }
                      : {}),
                    ...(call.result !== undefined
                      ? { result: call.result }
                      : {}),
                    ...(call.error !== undefined ? { error: call.error } : {}),
                    ...(call.permissionRequest
                      ? { permissionRequest: call.permissionRequest }
                      : {}),
                  }))
                : null,
            toolResults:
              turnResult.toolResults.length > 0 ? turnResult.toolResults : null,
            metadata: {
              ...(turnResult.decision ? { decision: turnResult.decision } : {}),
              stopReason: turnResult.stopReason,
              ...(turnResult.segments.length > 0
                ? { segments: turnResult.segments }
                : {}),
              ...(isEmptyTurn ? { emptyTurn: true } : {}),
              ...(options?.incomplete ? { incomplete: true } : {}),
              ...(options?.errorMessage
                ? { errorMessage: options.errorMessage }
                : {}),
              ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
              ...(options?.rawErrorMessage
                ? { rawErrorMessage: options.rawErrorMessage }
                : {}),
            },
          })
          .returning({ id: agentMessages.id });

        lastAssistantMessageId = assistantMessage.id;
      }

      const lastProcessedMessageId = pendingMessages.at(-1)?.id;
      const executionMetadata = this.mergeExecutionMetadata(currentMetadata, {
        sessionId,
        lastProcessedMessageId,
        lastAssistantMessageId,
        lastStopReason: turnResult.stopReason,
        runningState: 'running',
      });

      await dbClient
        .update(agentConversations)
        .set({
          metadata: this.writeExecutionMetadata(
            currentMetadata,
            executionMetadata,
          ),
          updatedAt: new Date(),
        })
        .where(eq(agentConversations.id, conversationId));

      return executionMetadata;
    });
  }

  private async updateExecutionMetadata(
    tenantId: string,
    conversationId: string,
    patch: Partial<ConversationExecutionMetadata>,
  ): Promise<ConversationExecutionMetadata> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const currentMetadata = await this.loadConversationMetadata(
        dbClient,
        conversationId,
      );
      const nextExecutionMetadata = this.mergeExecutionMetadata(
        currentMetadata,
        patch,
      );
      await dbClient
        .update(agentConversations)
        .set({
          metadata: this.writeExecutionMetadata(
            currentMetadata,
            nextExecutionMetadata,
          ),
          updatedAt: new Date(),
        })
        .where(eq(agentConversations.id, conversationId));

      return nextExecutionMetadata;
    });
  }

  private async safeUpdateExecutionMetadata(
    tenantId: string,
    conversationId: string,
    metadata: ConversationExecutionMetadata,
  ): Promise<ConversationExecutionMetadata> {
    try {
      return await runInTenantTransaction(
        this.db,
        tenantId,
        async (dbClient) => {
          const currentMetadata = await this.loadConversationMetadata(
            dbClient,
            conversationId,
          );
          const nextMetadata = this.writeExecutionMetadata(
            currentMetadata,
            metadata,
          );

          await dbClient
            .update(agentConversations)
            .set({ metadata: nextMetadata, updatedAt: new Date() })
            .where(eq(agentConversations.id, conversationId));

          return this.readExecutionMetadata(nextMetadata);
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update conversation ${conversationId} metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      return metadata;
    }
  }

  private async loadConversationMetadata(
    dbClient: DrizzleDB,
    conversationId: string,
  ): Promise<Record<string, unknown>> {
    const [conversation] = await dbClient
      .select({ metadata: agentConversations.metadata })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    return conversation?.metadata ?? {};
  }

  private buildPromptBlocks(
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
    historyMessages: ConversationHistoryMessage[] = [],
    latestPromptOverride?: string,
  ): ContentBlock[] {
    const latestPrompt =
      latestPromptOverride ?? this.formatLatestPendingMessages(pendingMessages);

    if (historyMessages.length > 0) {

      return [
        {
          type: 'text',
          text:
            `以下是该 conversation 已有的历史，请保持上下文连续：\n` +
            `${this.formatConversationHistory(historyMessages)}\n\n` +
            `请继续回应用户最新消息：\n${latestPrompt}`,
        } satisfies TextContentBlock,
      ];
    }

    if (pendingMessages.length === 1) {
      return [
        {
          type: 'text',
          text: latestPrompt,
        } satisfies TextContentBlock,
      ];
    }

    const prefix = hasPriorTurns
      ? '在你上一轮回复后，用户又发送了以下新消息，请结合上下文继续回应：'
      : '用户连续发送了以下消息，请综合后统一回应：';

    return [
      {
        type: 'text',
        text: `${prefix}\n${latestPrompt}`,
      } satisfies TextContentBlock,
    ];
  }

  private formatLatestPendingMessages(
    pendingMessages: PendingMessage[],
  ): string {
    return pendingMessages.length === 1
      ? pendingMessages[0].content
      : pendingMessages
          .map((message, index) => `${index + 1}. ${message.content}`)
          .join('\n');
  }

  private async applyConversationInputPreprocessors(
    latestPrompt: string,
    runtimeConfig?: AgentRuntimeConfig,
  ): Promise<string> {
    const preprocessors = runtimeConfig?.inputPreprocessors ?? [];
    if (preprocessors.length === 0) {
      return latestPrompt;
    }

    let current: string | Record<string, unknown> = latestPrompt;

    for (const preprocessor of preprocessors) {
      const transformType = this.normalizeOptionalString(preprocessor.type);
      const configRecord = this.isRecord(preprocessor.config)
        ? preprocessor.config
        : {};

      if (!transformType) {
        continue;
      }

      const handlerInput: string | Record<string, unknown> =
        typeof current === 'string'
          ? {
              text: current,
              value: current,
              raw: current,
            }
          : current;

      current = (
        await this.inputPreprocessorHandler.execute(
          handlerInput,
          normalizeInputPreprocessorConfig(configRecord, transformType),
        )
      ).output;
    }

    return typeof current === 'string'
      ? current
      : JSON.stringify(current, null, 2);
  }

  private formatConversationHistory(
    historyMessages: ConversationHistoryMessage[],
  ): string {
    return historyMessages
      .map((message, index) => {
        const toolSummary = this.describeConversationHistoryToolCalls(
          message.toolCalls,
        );

        return [
          `${index + 1}. ${this.describeConversationRole(message.role)}: ${this.describeConversationHistoryMessage(message)}`,
          ...(toolSummary ? [`   工具调用: ${toolSummary}`] : []),
        ].join('\n');
      })
      .join('\n\n');
  }

  private describeConversationRole(
    role: ConversationHistoryMessage['role'],
  ): string {
    switch (role) {
      case 'assistant':
        return '助手';
      case 'system':
        return '系统';
      case 'tool':
        return '工具';
      default:
        return '用户';
    }
  }

  private describeConversationHistoryMessage(
    message: ConversationHistoryMessage,
  ): string {
    const trimmed = message.content.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }

    if (message.metadata['emptyTurn'] === true) {
      return '（该轮未返回可展示文本）';
    }

    if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
      return '（该轮主要执行了工具调用）';
    }

    return '（空消息）';
  }

  private describeConversationHistoryToolCalls(
    toolCalls: ConversationHistoryMessage['toolCalls'],
  ): string | null {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return null;
    }

    const items = toolCalls.flatMap((toolCall) => {
      if (!this.isRecord(toolCall)) {
        return [];
      }

      const tool =
        this.readStringValue(toolCall.tool) ??
        this.readStringValue(toolCall.name) ??
        'unknown_tool';
      const status = this.readStringValue(toolCall.status) ?? 'pending';

      return [`${tool} [${status}]`];
    });

    return items.length > 0 ? items.join('；') : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readExecutionMetadata(
    metadata: Record<string, unknown>,
  ): ConversationExecutionMetadata {
    const execution = metadata['execution'];
    if (
      !execution ||
      typeof execution !== 'object' ||
      Array.isArray(execution)
    ) {
      return {};
    }

    const executionRecord = execution as Record<string, unknown>;

    return {
      ...(typeof executionRecord.sessionId === 'string'
        ? { sessionId: executionRecord.sessionId }
        : {}),
      ...(Array.isArray(executionRecord.memorySessionIds)
        ? {
            memorySessionIds: executionRecord.memorySessionIds.filter(
              (value): value is string => typeof value === 'string',
            ),
          }
        : {}),
      ...(typeof executionRecord.lastProcessedMessageId === 'string'
        ? { lastProcessedMessageId: executionRecord.lastProcessedMessageId }
        : {}),
      ...(typeof executionRecord.lastAssistantMessageId === 'string'
        ? { lastAssistantMessageId: executionRecord.lastAssistantMessageId }
        : {}),
      ...(typeof executionRecord.lastStopReason === 'string'
        ? { lastStopReason: executionRecord.lastStopReason as StopReason }
        : {}),
      ...(typeof executionRecord.runningState === 'string'
        ? {
            runningState: executionRecord.runningState as
              | 'idle'
              | 'running'
              | 'failed'
              | 'cancelled',
          }
        : {}),
    };
  }

  private mergeExecutionMetadata(
    baseMetadata: Record<string, unknown>,
    patch: Partial<ConversationExecutionMetadata>,
  ): ConversationExecutionMetadata {
    const current = this.readExecutionMetadata(baseMetadata);
    return {
      ...current,
      ...patch,
      ...(patch.lastProcessedMessageId === undefined
        ? {}
        : { lastProcessedMessageId: patch.lastProcessedMessageId }),
      ...(patch.lastAssistantMessageId === undefined
        ? {}
        : { lastAssistantMessageId: patch.lastAssistantMessageId }),
      ...(patch.memorySessionIds === undefined
        ? {}
        : { memorySessionIds: patch.memorySessionIds }),
    };
  }

  private resolveDefaultMemoryInstanceIds(
    definitionMetadata: Record<string, unknown>,
    snapshotMetadata?: Record<string, unknown>,
  ): string[] {
    const snapshotMemoryInstanceIds = this.extractStringArray(
      snapshotMetadata?.memoryInstanceIds,
    );

    if (snapshotMemoryInstanceIds.length) {
      return snapshotMemoryInstanceIds;
    }

    return this.extractStringArray(definitionMetadata['memoryInstanceIds']);
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private async ensureConversationMemorySessions(
    context: ConversationExecutionContext,
    conversationId: string,
    tenantId: string,
  ): Promise<string[]> {
    const existingSessionIds = context.executionMetadata.memorySessionIds ?? [];
    if (existingSessionIds.length || !context.memoryInstanceIds.length) {
      return existingSessionIds;
    }

    return this.ensureAttachedMemorySessions(
      context.memoryInstanceIds,
      conversationId,
      tenantId,
    );
  }

  private async ensureAttachedMemorySessions(
    memoryInstanceIds: string[],
    conversationId: string,
    tenantId: string,
  ): Promise<string[]> {
    if (!memoryInstanceIds.length || !this.memoryResourceProvider) {
      return [];
    }

    const createdSessions: string[] = [];
    for (const [index, memoryInstanceId] of memoryInstanceIds.entries()) {
      const instance = await this.memoryResourceProvider.create({
        memoryInstanceId,
        role: index === 0 ? 'primary' : 'readonly',
        bootUris: DEFAULT_MEMORY_BOOT_URIS,
        fusionPriority: index + 1,
        tenantId,
        agentConversationId: conversationId,
      });
      createdSessions.push(instance.sessionId);
    }

    return createdSessions;
  }

  private async resolveConversationSystemPrompt(
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
        `Failed to load conversation memory boot context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return baseSystemPrompt;
    }
  }

  private async resolveConversationSkillPrompt(
    context: ConversationExecutionContext,
  ): Promise<string | undefined> {
    return this.resolveSkillAugmentedPrompt({
      tenantId: context.conversation.tenantId,
      agentDefinitionId: context.conversation.agentDefinitionId,
      skillIds: context.runtimeConfig.skillIds,
      nodes: context.canvasNodes,
      edges: context.canvasEdges,
      baseSystemPrompt: context.systemPrompt,
    });
  }

  /**
   * Resolve skill payloads as structured data without embedding into prompt.
   * Used by the sandbox code path to produce independent skill files.
   */
  private async resolveSkillPayloads(
    context: ConversationExecutionContext,
  ): Promise<import('../skill/skill.types').SkillPromptPayload[]> {
    return this.resolveSkillPayloadsForGraph({
      tenantId: context.conversation.tenantId,
      agentDefinitionId: context.conversation.agentDefinitionId,
      skillIds: context.runtimeConfig.skillIds,
      nodes: context.canvasNodes,
      edges: context.canvasEdges,
    });
  }

  private async resolveSkillPayloadsForGraph(params: {
    tenantId: string;
    agentDefinitionId: string;
    skillIds?: string[];
    nodes: AgentVersionSnapshot['nodes'];
    edges: AgentVersionSnapshot['edges'];
  }): Promise<import('../skill/skill.types').SkillPromptPayload[]> {
    if (!this.skillResolverService) {
      return [];
    }

    const skillIds = this.resolveConfiguredSkillIds(
      params.skillIds,
      params.nodes,
      params.edges,
    );

    if (!skillIds.length) {
      return [];
    }

    try {
      return await this.skillResolverService.resolveSkillsForAgent(
        params.tenantId,
        skillIds,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to resolve skill payloads for agent ${params.agentDefinitionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async buildPiConfigInput(params: {
    tenantId: string;
    runtimeConfig: AgentRuntimeConfig;
    systemPrompt?: string;
    skillPayloads?: import('../skill/skill.types').SkillPromptPayload[];
  }): Promise<PiConfigInput> {
    const [modelConfig, mcpServers] = await Promise.all([
      this.resolvePiModelConfig(params.runtimeConfig, params.tenantId),
      this.resolvePiMcpServers(params.runtimeConfig, params.tenantId),
    ]);

    return {
      ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
      ...(modelConfig ? { modelConfig } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      ...(params.skillPayloads?.length
        ? {
            skills: params.skillPayloads.map((skill) =>
              this.toSkillInput(skill),
            ),
          }
        : {}),
    };
  }

  private async resolvePiModelConfig(
    runtimeConfig: AgentRuntimeConfig,
    tenantId: string,
  ): Promise<PiModelConfig | undefined> {
    const runtimeModelConfig = runtimeConfig.modelConfig;
    const fallbackModelConfig =
      this.toPiModelConfigFromRuntimeModelConfig(runtimeModelConfig);
    const modelId = this.normalizeOptionalString(runtimeModelConfig?.modelId);

    if (!modelId || !this.llmService) {
      return fallbackModelConfig;
    }

    try {
      const modelConfig = await this.llmService.findById(modelId, tenantId);
      return this.toPiModelConfig(modelConfig);
    } catch (error) {
      if (!fallbackModelConfig) {
        throw error;
      }

      this.logger.warn(
        `Failed to load LLM model config ${modelId} for tenant ${tenantId}, falling back to node snapshot model data: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallbackModelConfig;
    }
  }

  private toPiModelConfig(resolved: ResolvedModelConfig): PiModelConfig {
    const baseUrl = this.resolvePiModelBaseUrl(resolved);

    return {
      provider: resolved.provider.slug,
      model: resolved.modelId,
      ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
      apiKeyId: resolved.provider.apiKeyId ?? null,
      organizationId: resolved.orgId,
      tenantId: resolved.tenantId,
    };
  }

  private resolvePiModelBaseUrl(
    resolved: ResolvedModelConfig,
  ): string | undefined {
    const providerBaseUrl =
      resolved.provider.baseUrl ?? resolved.provider.defaultBaseUrl;
    if (
      typeof providerBaseUrl === 'string' &&
      providerBaseUrl.trim().length > 0
    ) {
      return providerBaseUrl.trim();
    }

    const parameters =
      resolved.parameters &&
      typeof resolved.parameters === 'object' &&
      !Array.isArray(resolved.parameters)
        ? (resolved.parameters as Record<string, unknown>)
        : {};

    const candidates = [
      parameters.baseUrl,
      parameters.baseURL,
      parameters.apiBaseUrl,
      parameters.endpointUrl,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return undefined;
  }

  private toPiModelConfigFromRuntimeModelConfig(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): PiModelConfig | undefined {
    const provider = this.normalizeOptionalString(modelConfig?.provider);
    const model =
      this.normalizeOptionalString(modelConfig?.modelName) ??
      this.normalizeOptionalString(modelConfig?.modelId);

    if (!provider || !model) {
      return undefined;
    }

    const baseUrl = this.resolvePiRuntimeModelBaseUrl(modelConfig);
    const apiKeyId = modelConfig?.apiKeyId;
    const authMethod = this.normalizeOptionalString(modelConfig?.authMethod);

    return {
      provider,
      model,
      ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
      ...(typeof apiKeyId === 'string' || apiKeyId === null
        ? { apiKeyId }
        : {}),
      ...(authMethod ? { authMethod } : {}),
    };
  }

  private resolvePiRuntimeModelBaseUrl(
    modelConfig?: AgentRuntimeConfig['modelConfig'],
  ): string | undefined {
    const endpointUrl = this.normalizeOptionalString(modelConfig?.endpointUrl);
    if (endpointUrl) {
      return endpointUrl;
    }

    const parameters =
      modelConfig?.customParameters &&
      typeof modelConfig.customParameters === 'object' &&
      !Array.isArray(modelConfig.customParameters)
        ? (modelConfig.customParameters as Record<string, unknown>)
        : {};

    const candidates = [
      parameters.baseUrl,
      parameters.baseURL,
      parameters.apiBaseUrl,
      parameters.endpointUrl,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeOptionalString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private async resolvePiMcpServers(
    runtimeConfig: AgentRuntimeConfig,
    tenantId: string,
  ): Promise<PiConfigInput['mcpServers'] | undefined> {
    if (!this.mcpService) {
      return undefined;
    }

    const configIds = this.extractEnabledMcpServerConfigIds(
      runtimeConfig.tools,
    );
    if (configIds.length === 0) {
      return undefined;
    }

    const savedConfigs = await runInTenantTransaction(
      this.db,
      tenantId,
      async (dbClient) =>
        dbClient
          .select({
            id: mcpServerConfigs.id,
            name: mcpServerConfigs.name,
          })
          .from(mcpServerConfigs)
          .where(
            and(
              eq(mcpServerConfigs.tenantId, tenantId),
              inArray(mcpServerConfigs.id, configIds),
            ),
          ),
    );
    const namesById = new Map(
      savedConfigs.map((config) => [config.id, config.name] as const),
    );

    const servers: NonNullable<PiConfigInput['mcpServers']> = {};
    for (const configId of configIds) {
      try {
        const connection = await this.mcpService.resolveRuntimeConnection(
          configId,
          tenantId,
        );
        const key = this.resolvePiMcpServerKey(
          configId,
          namesById.get(configId),
          servers,
        );
        servers[key] = connection;
      } catch (error) {
        this.logger.warn(
          `Failed to resolve MCP server config ${configId} for conversation runtime: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return Object.keys(servers).length > 0 ? servers : undefined;
  }

  private extractEnabledMcpServerConfigIds(
    tools: AgentRuntimeConfig['tools'],
  ): string[] {
    if (!tools?.length) {
      return [];
    }

    const ids = new Set<string>();

    for (const tool of tools) {
      if (tool.enabled === false) {
        continue;
      }

      if (!('mcpServerConfigId' in tool)) {
        continue;
      }

      if (
        typeof tool.mcpServerConfigId === 'string' &&
        tool.mcpServerConfigId.trim().length > 0
      ) {
        ids.add(tool.mcpServerConfigId.trim());
      }
    }

    return [...ids];
  }

  private resolvePiMcpServerKey(
    configId: string,
    configName: string | undefined,
    existingServers: Record<string, unknown>,
  ): string {
    const base =
      this.sanitizePiMcpServerKey(configName) ??
      this.sanitizePiMcpServerKey(configId) ??
      'mcp_server';

    if (!(base in existingServers)) {
      return base;
    }

    let suffix = 2;
    while (`${base}_${suffix}` in existingServers) {
      suffix += 1;
    }

    return `${base}_${suffix}`;
  }

  private sanitizePiMcpServerKey(
    value: string | undefined,
  ): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    const normalized = value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized.length > 0 ? normalized : undefined;
  }

  /**
   * Convert a SkillPromptPayload to a SkillInput for PiConfigInput.
   */
  private toSkillInput(
    skill: import('../skill/skill.types').SkillPromptPayload,
  ): SkillInput {
    const files =
      skill.files && Object.keys(skill.files).length > 0
        ? skill.files
        : { 'SKILL.md': skill.content ?? '' };

    return {
      name: skill.name,
      description: skill.description,
      files,
    };
  }

  private async resolveSkillAugmentedPrompt(params: {
    tenantId: string;
    agentDefinitionId: string;
    skillIds?: string[];
    nodes: AgentVersionSnapshot['nodes'];
    edges: AgentVersionSnapshot['edges'];
    baseSystemPrompt?: string;
  }): Promise<string | undefined> {
    if (!this.skillResolverService) {
      return params.baseSystemPrompt;
    }

    const skillIds = this.resolveConfiguredSkillIds(
      params.skillIds,
      params.nodes,
      params.edges,
    );

    if (!skillIds.length) {
      return params.baseSystemPrompt;
    }

    try {
      const skills = await this.skillResolverService.resolveSkillsForAgent(
        params.tenantId,
        skillIds,
      );

      if (!skills.length) {
        return params.baseSystemPrompt;
      }

      const augmentedPrompt = this.skillResolverService
        .buildSkillAugmentedPrompt(params.baseSystemPrompt ?? '', skills)
        .trim();

      return augmentedPrompt || undefined;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve skills for agent ${params.agentDefinitionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return params.baseSystemPrompt;
    }
  }

  private extractConversationSkillIds(
    nodes: AgentVersionSnapshot['nodes'],
    edges: AgentVersionSnapshot['edges'],
  ): string[] {
    const skillNodes = nodes.filter(
      (node) => this.resolveCanvasNodeType(node) === 'skill',
    );
    if (!skillNodes.length) {
      return [];
    }

    const agentMainNode = nodes.find(
      (node) => this.resolveCanvasNodeType(node) === 'agent-main',
    );
    const agentMainId =
      typeof agentMainNode?.id === 'string' ? agentMainNode.id : null;
    const activeSkillNodes = agentMainId
      ? skillNodes.filter((node) =>
          edges.some(
            (edge) =>
              edge?.source === node.id &&
              edge?.target === agentMainId &&
              edge?.targetHandle === 'skills-in',
          ),
        )
      : skillNodes;

    return [
      ...new Set(activeSkillNodes.map((node) => this.extractSkillId(node))),
    ].filter(
      (skillId): skillId is string =>
        typeof skillId === 'string' && skillId.length > 0,
    );
  }

  private extractSkillId(
    node: AgentVersionSnapshot['nodes'][number],
  ): string | null {
    const skillId = this.normalizeOptionalString(
      this.resolveCanvasNodeData(node).skillId,
    );
    if (skillId) {
      return skillId;
    }

    return null;
  }

  private resolveConfiguredSkillIds(
    runtimeSkillIds: string[] | undefined,
    nodes: AgentVersionSnapshot['nodes'],
    edges: AgentVersionSnapshot['edges'],
  ): string[] {
    const normalizedRuntimeSkillIds =
      this.normalizeRuntimeSkillIds(runtimeSkillIds);
    if (normalizedRuntimeSkillIds.length > 0) {
      return normalizedRuntimeSkillIds;
    }

    return this.extractConversationSkillIds(nodes ?? [], edges ?? []);
  }

  private normalizeRuntimeSkillIds(skillIds: string[] | undefined): string[] {
    if (!Array.isArray(skillIds)) {
      return [];
    }

    return [
      ...new Set(
        skillIds
          .map((skillId) => this.normalizeOptionalString(skillId))
          .filter((skillId): skillId is string => typeof skillId === 'string'),
      ),
    ];
  }

  private resolveCanvasNodeType(
    node: AgentVersionSnapshot['nodes'][number],
  ): string {
    const nodeData =
      node.data && typeof node.data === 'object' && !Array.isArray(node.data)
        ? (node.data as Record<string, unknown>)
        : null;
    const nodeType = nodeData?.nodeType;

    if (typeof nodeType === 'string' && nodeType.length > 0) {
      return nodeType;
    }

    return typeof node.type === 'string' ? node.type : '';
  }

  private resolveCanvasNodeData(
    node: AgentVersionSnapshot['nodes'][number],
  ): Record<string, unknown> {
    const nodeData =
      node.data && typeof node.data === 'object' && !Array.isArray(node.data)
        ? (node.data as Record<string, unknown>)
        : {};
    const config =
      nodeData.config &&
      typeof nodeData.config === 'object' &&
      !Array.isArray(nodeData.config)
        ? (nodeData.config as Record<string, unknown>)
        : {};

    return {
      ...config,
      ...nodeData,
    };
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

  private registerSubAgentToolsProvider(params: {
    runtime: IAgentRuntime;
    sessionId: string;
    runtimeConfig: AgentRuntimeConfig;
    conversationId: string;
    tenantId: string;
    parentAbortSignal: AbortSignal;
    currentAgentDefinitionId: string;
    currentDepth: number;
    visitedAgentIds?: Set<string>;
    subAgentTracker: SubAgentExecutionTracker;
  }): void {
    if (
      !params.runtimeConfig.subAgents?.length ||
      !this.subAgentToolsProvider ||
      !params.runtime.registerSessionToolProvider
    ) {
      return;
    }

    params.runtime.registerSessionToolProvider(
      params.sessionId,
      this.subAgentToolsProvider.createSessionToolProvider(
        params.runtimeConfig.subAgents,
        {
          conversationId: params.conversationId,
          depth: params.currentDepth,
          tenantId: params.tenantId,
          parentAbortSignal: params.parentAbortSignal,
          visitedAgentIds: new Set([
            ...(params.visitedAgentIds ?? []),
            params.currentAgentDefinitionId,
          ]),
        },
        (subAgentParams) =>
          this.executeSubAgent(subAgentParams, params.subAgentTracker),
      ),
    );
  }

  private async registerSelfEvolutionToolsProvider(params: {
    runtime: IAgentRuntime;
    sessionId: string;
    runtimeConfig: AgentRuntimeConfig;
    conversationId: string;
    tenantId: string;
    currentAgentDefinitionId: string;
  }): Promise<void> {
    if (
      !params.runtimeConfig.selfEvolutionPolicy?.enabled ||
      !this.selfEvolutionToolsProvider ||
      !params.runtime.registerSessionToolProvider
    ) {
      return;
    }

    const context = await runInTenantTransaction(
      this.db,
      params.tenantId,
      async (dbClient) => {
        const [[conversation], [agent]] = await Promise.all([
          dbClient
            .select({
              createdBy: agentConversations.createdBy,
            })
            .from(agentConversations)
            .where(eq(agentConversations.id, params.conversationId))
            .limit(1),
          dbClient
            .select({
              name: agentDefinitions.name,
            })
            .from(agentDefinitions)
            .where(eq(agentDefinitions.id, params.currentAgentDefinitionId))
            .limit(1),
        ]);

        if (!conversation) {
          throw new Error(
            `Conversation ${params.conversationId} not found for self-evolution provider`,
          );
        }

        if (!agent) {
          throw new Error(
            `Agent ${params.currentAgentDefinitionId} not found for self-evolution provider`,
          );
        }

        return {
          actorUserId: conversation.createdBy,
          currentAgentName: agent.name,
        };
      },
    );

    params.runtime.registerSessionToolProvider(
      params.sessionId,
      this.selfEvolutionToolsProvider.createSessionToolProvider({
        sessionId: params.sessionId,
        conversationId: params.conversationId,
        tenantId: params.tenantId,
        currentAgentDefinitionId: params.currentAgentDefinitionId,
        runtimeConfig: params.runtimeConfig,
        actorUserId: context.actorUserId,
        currentAgentName: context.currentAgentName,
      }),
    );
  }

  private async executeSubAgent(
    params: ExecuteSubAgentParams,
    subAgentTracker: SubAgentExecutionTracker,
  ): Promise<SubAgentResult> {
    const trackedAbort = new AbortController();
    subAgentTracker.abortControllers.set(params.handle, trackedAbort);

    const linkedAbort = this.combineAbortSignals([
      params.abortSignal,
      trackedAbort.signal,
    ]);

    let runtime: IAgentRuntime | null = null;
    let session: AgentSession | null = null;

    try {
      const versionSnapshot = params.versionSnapshot?.snapshot;
      const runtimeConfig = versionSnapshot
        ? this.agentDefinitionService.buildRuntimeConfigFromNodes(
            versionSnapshot.nodes,
            versionSnapshot.edges,
            params.agentDefinition.id,
          )
        : await this.agentDefinitionService.compileCanvas(
            params.agentDefinition.id,
          );

      runtimeConfig.sandboxConfig = resolveAgentRuntimeSandboxConfig(
        versionSnapshot?.sandboxConfig ??
          runtimeConfig.sandboxConfig ??
          params.agentDefinition.sandboxConfig,
      );

      const memoryInstanceIds = runtimeConfig.memoryInstanceIds ?? [];
      const memorySessionIds = await this.ensureAttachedMemorySessions(
        memoryInstanceIds,
        params.parentContext.conversationId,
        params.parentContext.tenantId,
      );

      runtime = this.adapterFactory.selectAdapter(true);

      const skillPayloads = await this.resolveSkillPayloadsForGraph({
        tenantId: params.parentContext.tenantId,
        agentDefinitionId: params.agentDefinition.id,
        skillIds: runtimeConfig.skillIds,
        nodes: versionSnapshot?.nodes ?? params.agentDefinition.nodes,
        edges: versionSnapshot?.edges ?? params.agentDefinition.edges,
      });
      const piConfigInput = await this.buildPiConfigInput({
        tenantId: params.parentContext.tenantId,
        runtimeConfig,
        systemPrompt:
          versionSnapshot?.systemPrompt ??
          params.agentDefinition.systemPrompt ??
          undefined,
        skillPayloads,
      });
      await this.sandboxService.createSandboxSession({
        sandboxNodeId: null,
        config: runtimeConfig.sandboxConfig,
        tenantId: params.parentContext.tenantId,
        agentConversationId: params.parentContext.conversationId,
        piConfigInput,
      });

      const baseSystemPrompt = await this.resolveSkillAugmentedPrompt({
        tenantId: params.parentContext.tenantId,
        agentDefinitionId: params.agentDefinition.id,
        skillIds: runtimeConfig.skillIds,
        nodes: versionSnapshot?.nodes ?? params.agentDefinition.nodes,
        edges: versionSnapshot?.edges ?? params.agentDefinition.edges,
        baseSystemPrompt:
          versionSnapshot?.systemPrompt ??
          params.agentDefinition.systemPrompt ??
          undefined,
      });
      const systemPrompt = await this.resolveConversationSystemPrompt(
        memorySessionIds,
        baseSystemPrompt,
      );

      const nextSessionId = randomUUID();
      this.registerMemoryToolsProvider(
        runtime,
        nextSessionId,
        memorySessionIds,
      );
      await this.registerSelfEvolutionToolsProvider({
        runtime,
        sessionId: nextSessionId,
        runtimeConfig,
        conversationId: params.parentContext.conversationId,
        tenantId: params.parentContext.tenantId,
        currentAgentDefinitionId: params.agentDefinition.id,
      });
      this.registerSubAgentToolsProvider({
        runtime,
        sessionId: nextSessionId,
        runtimeConfig,
        conversationId: params.parentContext.conversationId,
        tenantId: params.parentContext.tenantId,
        parentAbortSignal: linkedAbort.signal,
        currentAgentDefinitionId: params.agentDefinition.id,
        currentDepth: params.depth,
        visitedAgentIds: params.parentContext.visitedAgentIds,
        subAgentTracker,
      });

      try {
        session = await runtime.createSession({
          sessionId: nextSessionId,
          agentId: params.agentDefinition.id,
          mode: 'conversation',
          tenantId: params.parentContext.tenantId,
          llmModelConfigId: runtimeConfig.modelConfig?.modelId,
          systemPrompt,
          runtimeConfig,
          serverSandbox: {
            agentConversationId: params.parentContext.conversationId,
          },
          context: {
            tenantId: params.parentContext.tenantId,
            agentConversationId: params.parentContext.conversationId,
            serverSandbox: {
              agentConversationId: params.parentContext.conversationId,
            },
            ...(memorySessionIds.length ? { memorySessionIds } : {}),
          },
        });
      } catch (error) {
        runtime.unregisterSessionToolProvider?.(nextSessionId);
        throw error;
      }

      const activeSession: AgentSession = session;

      linkedAbort.signal.addEventListener(
        'abort',
        () => {
          if (runtime && activeSession) {
            void runtime.cancel(activeSession.id).catch((error) => {
              this.logger.warn(
                `Failed to cancel sub-agent session ${activeSession.id}: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          }
        },
        { once: true },
      );

      const result = await this.runSubAgentPrompt(
        runtime,
        session,
        params.task,
        params.context,
        params.eventProxy,
      );

      if (params.invocationMode === 'spawn') {
        await this.injectSubAgentCompletionNotice(
          params.parentContext.conversationId,
          params.agentDefinition.name,
          params.handle,
          params.alias,
          'completed',
          result,
        );
      }

      return result;
    } catch (error) {
      if (params.invocationMode === 'spawn' && !linkedAbort.signal.aborted) {
        await this.injectSubAgentCompletionNotice(
          params.parentContext.conversationId,
          params.agentDefinition.name,
          params.handle,
          params.alias,
          'failed',
          undefined,
          error,
        );
      }
      throw error;
    } finally {
      linkedAbort.cleanup();
      subAgentTracker.abortControllers.delete(params.handle);
    }
  }

  private async runSubAgentPrompt(
    runtime: IAgentRuntime,
    session: AgentSession,
    task: string,
    context: string | undefined,
    eventProxy?: ExecuteSubAgentParams['eventProxy'],
  ): Promise<SubAgentResult> {
    let assistantText = '';
    let decision: DecisionEvent | undefined;
    let stopReason: StopReason = 'end_turn';
    let promptBlocks: ContentBlock[] = [
      {
        type: 'text',
        text: this.buildSubAgentPrompt(task, context),
      } satisfies TextContentBlock,
    ];

    while (true) {
      for await (const event of runtime.prompt(session.id, promptBlocks)) {
        eventProxy?.emitEvent(event);

        if (event.type === 'message_chunk') {
          assistantText += event.content;
          continue;
        }

        if (event.type === 'decision') {
          decision = event;
          continue;
        }

        if (event.type === 'done') {
          stopReason = event.stopReason;
        }
      }

      if (stopReason !== 'tool_use') {
        break;
      }

      promptBlocks = [];
    }

    return {
      content: assistantText,
      stopReason,
      ...(decision ? { decision: { ...decision } } : {}),
    };
  }

  private buildSubAgentPrompt(task: string, context?: string): string {
    if (!context?.trim()) {
      return task;
    }

    return ['任务：', task.trim(), '', '额外上下文：', context.trim()].join(
      '\n',
    );
  }

  private abortTrackedSubAgents(
    subAgentTracker: SubAgentExecutionTracker,
    reason?: unknown,
  ): void {
    for (const abortController of subAgentTracker.abortControllers.values()) {
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }
    }
  }

  private combineAbortSignals(signals: Array<AbortSignal | undefined>): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const listeners = new Map<AbortSignal, () => void>();

    const abortWith = (signal: AbortSignal) => {
      if (!controller.signal.aborted) {
        controller.abort(signal.reason);
      }
    };

    for (const signal of signals) {
      if (!signal) {
        continue;
      }

      if (signal.aborted) {
        abortWith(signal);
        break;
      }

      const listener = () => abortWith(signal);
      listeners.set(signal, listener);
      signal.addEventListener('abort', listener, { once: true });
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        for (const [signal, listener] of listeners) {
          signal.removeEventListener('abort', listener);
        }
      },
    };
  }

  private async injectSubAgentCompletionNotice(
    conversationId: string,
    agentName: string,
    handle: SubAgentHandle,
    alias: string,
    status: 'completed' | 'failed',
    result?: SubAgentResult,
    error?: unknown,
  ): Promise<void> {
    const summary =
      status === 'completed'
        ? this.summarizeSubAgentText(result?.content)
        : this.summarizeSubAgentText(
            error instanceof Error
              ? error.message
              : String(error ?? 'unknown error'),
          );
    const notice: SubAgentCompletionNotice = {
      type: 'subagent_completion_notice',
      handle,
      alias,
      status:
        status === 'completed'
          ? SubAgentRunStatus.COMPLETED
          : SubAgentRunStatus.FAILED,
      ...(status === 'failed' && summary ? { error: summary } : {}),
    };

    try {
      await this.executionService.injectMessage(conversationId, {
        role: 'user',
        contentType: 'text',
        content: `[Sub-Agent: ${agentName}] Completed: ${summary}`,
        metadata: {
          type: 'subagent_completion_notice' as const,
          handle,
          alias,
          status: notice.status,
          ...(notice.error ? { error: notice.error } : {}),
        },
      });
    } catch (injectError) {
      this.logger.warn(
        `Failed to inject sub-agent completion notice for ${handle}: ${injectError instanceof Error ? injectError.message : String(injectError)}`,
      );
    }
  }

  private summarizeSubAgentText(content: string | undefined): string {
    const normalized = (content ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'No summary available';
    }

    return normalized.length > 160
      ? `${normalized.slice(0, 157).trimEnd()}...`
      : normalized;
  }

  private registerMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string,
    memorySessionIds: string[],
  ): void {
    if (
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

  private async cleanupConversationMemorySessions(
    tenantId: string,
    memorySessionIds: string[] | undefined,
  ): Promise<void> {
    if (!memorySessionIds?.length || !this.memoryResourceProvider) {
      return;
    }

    try {
      const sessions = await runInTenantTransaction(
        this.db,
        tenantId,
        async (dbClient) =>
          dbClient
            .select()
            .from(memorySessions)
            .where(and(eq(memorySessions.tenantId, tenantId))),
      );
      const instances = sessions
        .filter((session) => memorySessionIds.includes(session.id))
        .map((session) => this.toMemoryResourceInstance(session, tenantId));

      for (const instance of instances) {
        await this.memoryResourceProvider.destroy(instance);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup conversation memory sessions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toMemoryResourceInstance(
    session: MemorySession,
    tenantId: string,
  ): MemoryResourceInstance {
    return {
      sessionId: session.id,
      session,
      memoryInstanceId: session.memoryInstanceId,
      tenantId,
    };
  }

  /**
   * Emit a preparation phase event for agent conversation startup.
   * Uses the existing `conversation.status.changed` channel with optional
   * `phase` / `sandboxReused` fields so old clients can safely ignore them.
   */
  private emitPreparationPhase(
    tenantId: string,
    conversationId: string,
    phase: PreparationPhase,
    extra?: {
      sandboxReused?: boolean;
      failedPhase?: PreparationPhase;
      error?: string;
    },
  ): void {
    this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
      executionId: conversationId,
      status: phase === 'running' ? 'running' : 'preparing',
      executionType: 'conversation',
      phase,
      ...(extra?.sandboxReused != null
        ? { sandboxReused: extra.sandboxReused }
        : {}),
      ...(extra?.failedPhase ? { failedPhase: extra.failedPhase } : {}),
      ...(extra?.error ? { error: extra.error } : {}),
    });
  }

  private writeExecutionMetadata(
    baseMetadata: Record<string, unknown>,
    executionMetadata: ConversationExecutionMetadata,
  ): Record<string, unknown> {
    return {
      ...baseMetadata,
      execution: executionMetadata,
    };
  }
}
