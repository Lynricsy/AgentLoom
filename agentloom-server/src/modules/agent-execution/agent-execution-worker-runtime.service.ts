/**
 * Conversation execution 的上下文加载、运行时准备与单轮事件服务。
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
  type AgentRuntimeMode,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import { isRecoverableAgentRuntimeErrorMessage } from '../agent/agent-runtime-error.utils';
import { memorySessions, type MemorySession } from '../../database/schema';
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
import { AgentSandboxNotConnectedException } from '../agent-definition/agent-definition.exceptions';
import {
  appendOutputSchemaToSystemPrompt,
  mergeRuntimeConfigWithSubAgentRef,
  resolveSubAgentSystemPrompt,
} from '../agent-definition/agent-runtime-config.utils';
import {
  deriveAgentSandboxConfigFromCanvas,
  mergeSandboxConfigCandidates,
} from '../agent-definition/agent-sandbox-config.utils';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import type { PreparationPhase } from '../execution/types/execution-event.types';
import { InputPreprocessorHandlerImpl } from '../execution/node-handlers/input-preprocessor.handler';
import { LlmService } from '../llm/llm.service';
import { McpService } from '../mcp/mcp.service';
import { SelfEvolutionToolsProvider } from '../self-evolution/self-evolution-tools.provider';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { resolveAgentRuntimeSandboxConfig } from '../sandbox/agent-runtime-sandbox-config';
import { SandboxService } from '../sandbox/sandbox.service';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import {
  MemoryResourceProvider,
  type MemoryResourceInstance,
} from '../agent-memory/memory-resource.provider';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
import { ConversationTitleService } from '../agent-conversation/conversation-title.service';
import { AgentTurnEventAccumulator } from '../agent/shared/agent-turn-event-accumulator';
import { bindMemoryToolSession } from '../agent/shared/memory-tool-session-binder';
import {
  buildConversationPromptBlocks,
  formatLatestPendingMessages,
  type HistoryConversationPromptMessage,
  type PendingConversationPromptMessage,
} from './conversation-prompt-blocks';
import { WorkspaceIntegrationService } from './workspace-integration.service';
import {
  readConversationAttachmentMetadataList,
  resolveConversationMessageContentType,
  withConversationAttachmentSandboxPaths,
} from '../agent-conversation/conversation-attachment';
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
import {
  buildExecutionMetadataForPublishedVersionRefresh,
  type ConversationExecutionMetadata,
  extractStringArray,
  isRecord,
  mergeExecutionMetadata,
  normalizeOptionalString,
  readExecutionMetadata,
  readStringValue,
  shouldRefreshConversationRuntimeForPublishedVersion,
  writeExecutionMetadata,
} from './conversation-execution-metadata';
import {
  buildMemoryBootPrompt,
  prependSystemPrompt,
} from './conversation-memory-prompt';
import {
  resolveConfiguredSkillIds as resolveConfiguredSkillIdsForConversation,
  resolveSkillAugmentedPrompt,
  resolveSkillPayloadsForGraph,
} from './conversation-skill-resolution';
import { buildPiConfigInput } from './pi-config-input.builder';
import {
  applyConversationInputPreprocessors,
  estimateConversationTokenCount,
  normalizeConversationRoutingStrategy,
} from './conversation-runtime-input';
import {
  buildConversationTurnResult,
  buildPromptBlocks as buildConversationWorkerPromptBlocks,
  type ConversationTurnResult,
  turnResultHasPersistableOutput,
} from './conversation-turn-values';

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
  publishedVersionId?: string;
  executionMetadata: ConversationExecutionMetadata;
};

type PendingMessage = {
  id: string;
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

type ConversationHistoryMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  contentType: string;
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

import { ConversationTurnFailedError } from './conversation-turn-failed.error';
import { AgentExecutionWorkerPersistenceService } from './agent-execution-worker-persistence.service';

@Injectable()
export class AgentExecutionWorkerRuntimeService {
  protected readonly logger = new Logger('AgentExecutionWorker');
  protected readonly inputPreprocessorHandler =
    new InputPreprocessorHandlerImpl();

  constructor(
    private readonly persistence: AgentExecutionWorkerPersistenceService,
    protected readonly db: DrizzleDB,
    protected readonly agentRuntime: IAgentRuntime,
    protected readonly adapterFactory: AgentAdapterFactory,
    protected readonly executionService: AgentExecutionService,
    protected readonly eventBridge: EventBridgeService,
    protected readonly sandboxService: SandboxService,
    protected readonly workspaceIntegrationService: WorkspaceIntegrationService,
    protected readonly agentDefinitionService: AgentDefinitionService,
    protected readonly llmService?: LlmService,
    protected readonly memoryToolsService?: MemoryToolsService,
    protected readonly memoryFusionService?: MemoryFusionService,
    protected readonly memoryResourceProvider?: MemoryResourceProvider,
    protected readonly skillResolverService?: SkillResolverService,
    protected readonly subAgentToolsProvider?: SubAgentToolsProvider,
    protected readonly mcpService?: McpService,
    protected readonly conversationTitleService?: ConversationTitleService,
    protected readonly selfEvolutionToolsProvider?: SelfEvolutionToolsProvider,
    protected readonly smartRoutingService?: SmartRoutingService,
  ) {
  }

  public async loadConversationExecutionContext(
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
          runtimeMode: agentDefinitions.runtimeMode,
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
      const definitionSystemPrompt =
        this.agentDefinitionService.resolveSystemPromptFromNodes?.(
          definition.nodes ?? [],
          definition.edges ?? [],
        ) ??
        definition.systemPrompt ??
        undefined;
      let systemPrompt = definitionSystemPrompt;
      let snapshot: AgentVersionSnapshot | null = null;
      let resolvedSandboxConfig: AgentRuntimeConfig['sandboxConfig'] | null;
      const normalizedDefinitionSandboxConfig =
        deriveAgentSandboxConfigFromCanvas(
          definition.nodes,
          definition.edges,
          definition.sandboxConfig,
        );

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
        const snapshotRuntimeMode = this.persistence.resolveAgentRuntimeMode(
          definition.runtimeMode,
          snapshot.runtimeMode,
        );
        const normalizedSnapshotSandboxConfig =
          deriveAgentSandboxConfigFromCanvas(
            snapshot.nodes,
            snapshot.edges,
            snapshot.sandboxConfig ?? null,
          );
        runtimeConfig = this.agentDefinitionService.buildRuntimeConfigFromNodes(
          snapshot.nodes,
          snapshot.edges,
          undefined,
          snapshotRuntimeMode,
        );
        runtimeConfig.runtimeMode ??= snapshotRuntimeMode;
        resolvedSandboxConfig =
          mergeSandboxConfigCandidates(
            runtimeConfig.sandboxConfig ?? null,
            normalizedSnapshotSandboxConfig,
          ) ?? normalizedDefinitionSandboxConfig;
        systemPrompt =
          this.agentDefinitionService.resolveSystemPromptFromNodes?.(
            snapshot.nodes,
            snapshot.edges,
          ) ??
          snapshot.systemPrompt ??
          definitionSystemPrompt;
      } else {
        runtimeConfig = await this.agentDefinitionService.compileCanvas(
          definition.id,
        );
        runtimeConfig.runtimeMode ??= this.persistence.resolveAgentRuntimeMode(
          definition.runtimeMode,
          undefined,
        );
        resolvedSandboxConfig =
          mergeSandboxConfigCandidates(
            runtimeConfig.sandboxConfig ?? null,
            normalizedDefinitionSandboxConfig,
          ) ?? null;
      }

      if (runtimeConfig.runtimeMode === 'sandbox' && !resolvedSandboxConfig) {
        throw new AgentSandboxNotConnectedException(definition.id);
      }
      runtimeConfig.sandboxConfig =
        runtimeConfig.runtimeMode === 'sandbox' && resolvedSandboxConfig
          ? resolveAgentRuntimeSandboxConfig(resolvedSandboxConfig)
          : undefined;

      const compiledMemoryInstanceIds = extractStringArray(
        runtimeConfig.memoryInstanceIds,
      );
      const memoryInstanceIds = compiledMemoryInstanceIds.length
        ? compiledMemoryInstanceIds
        : this.persistence.resolveDefaultMemoryInstanceIds(
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
        hasSandbox: runtimeConfig.runtimeMode === 'sandbox',
        memoryInstanceIds,
        publishedVersionId: normalizeOptionalString(
          definition.publishedVersionId,
        ),
        executionMetadata: readExecutionMetadata(conversation.metadata),
      };
    });
  }

  public async resolveConversationStartupRuntimeConfig(
    runtimeConfig: AgentRuntimeConfig,
    tenantId: string,
    pendingMessages: PendingMessage[],
  ): Promise<AgentRuntimeConfig> {
    const routingConfig = runtimeConfig.routingConfig;
    const candidateModelIds = extractStringArray(
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

  public async selectConversationRoutingModelId(params: {
    tenantId: string;
    routingConfig: NonNullable<AgentRuntimeConfig['routingConfig']>;
    candidateModelIds: string[];
    pendingMessages: PendingMessage[];
  }): Promise<string | undefined> {
    if (params.candidateModelIds.length === 1) {
      return params.candidateModelIds[0];
    }

    const strategy = normalizeConversationRoutingStrategy(
      params.routingConfig.strategy,
    );
    if (!strategy || !this.smartRoutingService) {
      return params.candidateModelIds[0];
    }

    const latestPrompt = formatLatestPendingMessages(
      params.pendingMessages as PendingConversationPromptMessage[],
    );

    try {
      const decision = await this.smartRoutingService.evaluate(
        params.candidateModelIds,
        {
          inputTokenCount: estimateConversationTokenCount(latestPrompt),
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

  public async prepareRuntimeSession(
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
    const hasSandboxRuntime =
      context.hasSandbox && Boolean(context.runtimeConfig.sandboxConfig);
    const runtime = this.resolveConversationRuntime(context);
    const memorySessionIds = await this.persistence.ensureConversationMemorySessions(
      context,
      conversationId,
      tenantId,
    );

    let sandboxReused = false;
    if (hasSandboxRuntime) {
      const skillPayloads = await this.persistence.resolveSkillPayloads(context);
      const piConfigInput = await buildPiConfigInput(
        {
          tenantId,
          runtimeConfig: context.runtimeConfig,
          systemPrompt: context.systemPrompt,
          skillPayloads,
        },
        this.llmService,
        this.mcpService,
        this.db,
        this.logger,
      );

      const existingSession = await this.sandboxService.findByConversationId(
        conversationId,
        tenantId,
      );
      sandboxReused = existingSession != null;

      if (!sandboxReused) {
        this.persistence.emitPreparationPhase(tenantId, conversationId, 'sandbox_creating');
      }

      await this.sandboxService.createSandboxSession({
        sandboxNodeId: null,
        config: context.runtimeConfig.sandboxConfig!,
        tenantId,
        agentConversationId: conversationId,
        piConfigInput,
      });
    }

    // Phase 4: agent_initializing — sandbox ready, creating agent runtime session
    this.persistence.emitPreparationPhase(tenantId, conversationId, 'agent_initializing', {
      sandboxReused,
    });

    const sessionId = context.executionMetadata.sessionId;
    if (sessionId) {
      try {
        const session = await runtime.loadSession(sessionId);
        this.persistence.registerMemoryToolsProvider(runtime, session.id, memorySessionIds);
        await this.persistence.registerSelfEvolutionToolsProvider({
          runtime,
          sessionId: session.id,
          runtimeConfig: context.runtimeConfig,
          conversationId,
          tenantId,
          currentAgentDefinitionId,
        });
        this.persistence.registerSubAgentToolsProvider({
          runtime,
          sessionId: session.id,
          runtimeConfig: context.runtimeConfig,
          conversationId,
          tenantId,
          parentAbortSignal,
          currentAgentDefinitionId,
          currentDepth: 0,
          parentUsesSandboxRuntime: hasSandboxRuntime,
          subAgentTracker,
        });
        if (hasSandboxRuntime) {
          await this.startConversationWorkspaceWatcher(
            conversationId,
            tenantId,
          );
        }
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
    const baseSystemPrompt = appendOutputSchemaToSystemPrompt(
      hasSandboxRuntime
        ? context.systemPrompt
        : await this.persistence.resolveConversationSkillPrompt(context),
      context.runtimeConfig.outputSchema,
    );

    const systemPrompt = await this.persistence.resolveConversationSystemPrompt(
      memorySessionIds,
      baseSystemPrompt,
    );

    const nextSessionId = randomUUID();
    this.persistence.registerMemoryToolsProvider(runtime, nextSessionId, memorySessionIds);
    await this.persistence.registerSelfEvolutionToolsProvider({
      runtime,
      sessionId: nextSessionId,
      runtimeConfig: context.runtimeConfig,
      conversationId,
      tenantId,
      currentAgentDefinitionId,
    });
    this.persistence.registerSubAgentToolsProvider({
      runtime,
      sessionId: nextSessionId,
      runtimeConfig: context.runtimeConfig,
      conversationId,
      tenantId,
      parentAbortSignal,
      currentAgentDefinitionId,
      currentDepth: 0,
      parentUsesSandboxRuntime: hasSandboxRuntime,
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
        ...(hasSandboxRuntime
          ? { serverSandbox: { agentConversationId: conversationId } }
          : {}),
        context: {
          tenantId,
          agentConversationId: conversationId,
          ...(hasSandboxRuntime
            ? { serverSandbox: { agentConversationId: conversationId } }
            : {}),
          ...(memorySessionIds.length ? { memorySessionIds } : {}),
        },
      });
    } catch (error) {
      runtime.unregisterSessionToolProvider?.(nextSessionId);
      throw error;
    }

    if (hasSandboxRuntime) {
      await this.startConversationWorkspaceWatcher(conversationId, tenantId);
    }

    return {
      runtime,
      session,
      memorySessionIds,
      restoredExistingSession: false,
      sandboxReused,
      lastPhase: 'agent_initializing',
    };
  }

  public resolveConversationRuntime(
    context: ConversationExecutionContext,
  ): IAgentRuntime {
    return this.adapterFactory.selectAdapter(context.hasSandbox);
  }

  public async startConversationWorkspaceWatcher(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const sandboxSession = await this.sandboxService.findByConversationId(
      conversationId,
      tenantId,
    );

    if (!sandboxSession?.runtimeHandle) {
      return;
    }

    this.workspaceIntegrationService.startFileWatcher(
      conversationId,
      tenantId,
      sandboxSession.runtimeHandle,
    );
  }

  public async loadPendingUserMessages(
    conversationId: string,
    tenantId: string,
    lastProcessedMessageId?: string,
  ): Promise<PendingMessage[]> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const messages = await dbClient
        .select({
          id: agentMessages.id,
          content: agentMessages.content,
          contentType: agentMessages.contentType,
          metadata: agentMessages.metadata,
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

  public async loadConversationHistoryMessages(
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
          contentType: agentMessages.contentType,
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

  public async runConversationTurn(
    runtime: IAgentRuntime,
    session: AgentSession,
    conversationId: string,
    tenantId: string,
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
    historyMessages: ConversationHistoryMessage[] = [],
    conversationMetadata: Record<string, unknown> = {},
  ): Promise<ConversationTurnResult> {
    const accumulator = new AgentTurnEventAccumulator<DecisionEvent>({
      mapDecision: (event) => event,
    });
    const subAgentCaptureToken =
      this.eventBridge.beginSubAgentConversationCapture(conversationId);
    try {
      const runtimePendingMessages =
        await this.persistence.materializePendingMessagesForRuntime(
          pendingMessages,
          conversationId,
          tenantId,
          session.runtimeConfig?.runtimeMode,
        );
      const latestPromptText = await applyConversationInputPreprocessors(
        formatLatestPendingMessages(
          runtimePendingMessages as PendingConversationPromptMessage[],
        ),
        session.runtimeConfig,
        this.inputPreprocessorHandler,
      );
      let promptBlocks = buildConversationPromptBlocks({
        pendingMessages:
          runtimePendingMessages as PendingConversationPromptMessage[],
        hasPriorTurns,
        historyMessages: historyMessages as HistoryConversationPromptMessage[],
        latestPromptOverride: latestPromptText,
        conversationMetadata,
      });

      while (true) {
        try {
          for await (const event of runtime.prompt(session.id, promptBlocks)) {
            const accumulatedEvent = accumulator.consume(event);
            if (accumulatedEvent.kind === 'message_chunk') {
              this.eventBridge.emitOutputChunk(tenantId, conversationId, {
                stepId: conversationId,
                chunk: accumulatedEvent.chunk,
                index: accumulatedEvent.index,
                executionType: 'conversation',
              });
              continue;
            }

            this.eventBridge.emitStepAgentEvent(tenantId, conversationId, {
              stepId: conversationId,
              executionType: 'conversation',
              event,
            });

            if (accumulatedEvent.kind === 'tool_call') {
              const nextCall = accumulator.toolCalls.find(
                (toolCall) => toolCall.id === accumulatedEvent.toolCall.id,
              )!;
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
            }
          }
        } catch (error) {
          throw new ConversationTurnFailedError(
            error,
            buildConversationTurnResult(
              accumulator.assistantText,
              accumulator.decision,
              accumulator.stopReason ?? 'end_turn',
              accumulator.toolCalls,
              accumulator.segments,
              this.eventBridge.consumeSubAgentConversationCapture(
                conversationId,
                subAgentCaptureToken,
              ),
            ),
          );
        }

        if (accumulator.stopReason !== 'tool_use') {
          break;
        }

        promptBlocks = [];
      }

      return buildConversationTurnResult(
        accumulator.assistantText,
        accumulator.decision,
        accumulator.stopReason ?? 'end_turn',
        accumulator.toolCalls,
        accumulator.segments,
        this.eventBridge.consumeSubAgentConversationCapture(
          conversationId,
          subAgentCaptureToken,
        ),
      );
    } finally {
      this.eventBridge.clearSubAgentConversationCapture(
        conversationId,
        subAgentCaptureToken,
      );
    }
  }

  public describeConversationExecutionError(error: unknown): {
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
      readStringValue(isRecord(target) ? target['rawMessage'] : undefined) ??
      target.message;

    return {
      errorMessage: this.formatConversationExecutionErrorMessage(
        errorCode,
        rawErrorMessage,
      ),
      ...(errorCode ? { errorCode } : {}),
      ...(rawErrorMessage ? { rawErrorMessage } : {}),
    };
  }

  public formatConversationExecutionErrorMessage(
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

  public isUpstreamModelStreamAbort(message: string): boolean {
    return isRecoverableAgentRuntimeErrorMessage(message);
  }

  public readErrorCode(error: Error): string | undefined {
    if (!isRecord(error)) {
      return undefined;
    }

    return readStringValue(error['code']);
  }


}
