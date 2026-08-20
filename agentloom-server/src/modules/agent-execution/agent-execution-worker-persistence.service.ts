/**
 * Conversation execution 的消息持久化、子代理与会话资源服务。
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
@Injectable()
export class AgentExecutionWorkerPersistenceService {
  protected readonly logger = new Logger('AgentExecutionWorker');
  protected readonly inputPreprocessorHandler =
    new InputPreprocessorHandlerImpl();

  constructor(
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

  public async persistConversationTurn(
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
              ...(turnResult.subAgentStreams &&
              Object.keys(turnResult.subAgentStreams).length > 0
                ? { subAgentStreams: turnResult.subAgentStreams }
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
      const executionMetadata = mergeExecutionMetadata(currentMetadata, {
        sessionId,
        lastProcessedMessageId,
        lastAssistantMessageId,
        lastStopReason: turnResult.stopReason,
        runningState: 'running',
      });

      await dbClient
        .update(agentConversations)
        .set({
          metadata: writeExecutionMetadata(currentMetadata, executionMetadata),
          updatedAt: new Date(),
        })
        .where(eq(agentConversations.id, conversationId));

      return executionMetadata;
    });
  }

  public async updateExecutionMetadata(
    tenantId: string,
    conversationId: string,
    patch: Partial<ConversationExecutionMetadata>,
  ): Promise<ConversationExecutionMetadata> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const currentMetadata = await this.loadConversationMetadata(
        dbClient,
        conversationId,
      );
      const nextExecutionMetadata = mergeExecutionMetadata(
        currentMetadata,
        patch,
      );
      await dbClient
        .update(agentConversations)
        .set({
          metadata: writeExecutionMetadata(
            currentMetadata,
            nextExecutionMetadata,
          ),
          updatedAt: new Date(),
        })
        .where(eq(agentConversations.id, conversationId));

      return nextExecutionMetadata;
    });
  }

  public async safeUpdateExecutionMetadata(
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
          const nextMetadata = writeExecutionMetadata(
            currentMetadata,
            metadata,
          );

          await dbClient
            .update(agentConversations)
            .set({ metadata: nextMetadata, updatedAt: new Date() })
            .where(eq(agentConversations.id, conversationId));

          return readExecutionMetadata(nextMetadata);
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to update conversation ${conversationId} metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      return metadata;
    }
  }

  public async loadConversationMetadata(
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

  public async materializePendingMessagesForRuntime(
    pendingMessages: PendingMessage[],
    conversationId: string,
    tenantId: string,
    runtimeMode: AgentRuntimeMode | undefined,
  ): Promise<PendingMessage[]> {
    if (runtimeMode !== 'sandbox' || pendingMessages.length === 0) {
      return pendingMessages;
    }

    const nextMessages: PendingMessage[] = [];

    for (const message of pendingMessages) {
      const attachments = readConversationAttachmentMetadataList(
        message.metadata,
      );

      if (attachments.length === 0) {
        nextMessages.push(message);
        continue;
      }

      try {
        const sandboxPaths: Array<string | undefined> = [];
        for (const attachment of attachments) {
          const sandboxPath =
            await this.workspaceIntegrationService.stageConversationAttachment(
              conversationId,
              tenantId,
              { attachment },
            );
          sandboxPaths.push(sandboxPath ?? undefined);
        }

        if (sandboxPaths.every((sandboxPath) => !sandboxPath)) {
          nextMessages.push(message);
          continue;
        }

        nextMessages.push({
          ...message,
          metadata: withConversationAttachmentSandboxPaths(
            message.metadata,
            sandboxPaths,
          ),
        });
      } catch (error) {
        this.logger.warn(
          `Failed to materialize conversation attachment for ${conversationId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        nextMessages.push(message);
      }
    }

    return nextMessages;
  }
  public buildPromptBlocks(
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
    historyMessages: ConversationHistoryMessage[] = [],
    latestPromptOverride?: string,
    conversationMetadata: Record<string, unknown> = {},
  ): ContentBlock[] {
    return buildConversationWorkerPromptBlocks(
      pendingMessages,
      hasPriorTurns,
      historyMessages,
      latestPromptOverride,
      conversationMetadata,
    );
  }

  public resolveDefaultMemoryInstanceIds(
    definitionMetadata: Record<string, unknown>,
    snapshotMetadata?: Record<string, unknown>,
  ): string[] {
    const snapshotMemoryInstanceIds = extractStringArray(
      snapshotMetadata?.memoryInstanceIds,
    );

    if (snapshotMemoryInstanceIds.length) {
      return snapshotMemoryInstanceIds;
    }

    return extractStringArray(definitionMetadata['memoryInstanceIds']);
  }

  public async ensureConversationMemorySessions(
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

  public async ensureAttachedMemorySessions(
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

  public async resolveConversationSystemPrompt(
    memorySessionIds: string[],
    baseSystemPrompt?: string,
  ): Promise<string | undefined> {
    if (!memorySessionIds.length || !this.memoryFusionService) {
      return baseSystemPrompt;
    }

    try {
      const bootSequence =
        await this.memoryFusionService.bootAll(memorySessionIds);
      const memoryPrompt = buildMemoryBootPrompt(bootSequence);
      return prependSystemPrompt(memoryPrompt, baseSystemPrompt);
    } catch (error) {
      this.logger.warn(
        `Failed to load conversation memory boot context: ${error instanceof Error ? error.message : String(error)}`,
      );
      return baseSystemPrompt;
    }
  }

  public async resolveConversationSkillPrompt(
    context: ConversationExecutionContext,
  ): Promise<string | undefined> {
    return resolveSkillAugmentedPrompt(
      {
        tenantId: context.conversation.tenantId,
        agentDefinitionId: context.conversation.agentDefinitionId,
        skillIds: context.runtimeConfig.skillIds,
        nodes: context.canvasNodes,
        edges: context.canvasEdges,
        baseSystemPrompt: context.systemPrompt,
      },
      this.skillResolverService,
      this.logger,
    );
  }

  /**
   * Resolve skill payloads as structured data without embedding into prompt.
   * Used by the sandbox code path to produce independent skill files.
   */
  public async resolveSkillPayloads(
    context: ConversationExecutionContext,
  ): Promise<import('../skill/skill.types').SkillPromptPayload[]> {
    return resolveSkillPayloadsForGraph(
      {
        tenantId: context.conversation.tenantId,
        agentDefinitionId: context.conversation.agentDefinitionId,
        skillIds: context.runtimeConfig.skillIds,
        nodes: context.canvasNodes,
        edges: context.canvasEdges,
      },
      this.skillResolverService,
      this.logger,
    );
  }

  public resolveConfiguredSkillIds(
    runtimeSkillIds: string[] | undefined,
    nodes: AgentVersionSnapshot['nodes'],
    edges: AgentVersionSnapshot['edges'],
  ): string[] {
    return resolveConfiguredSkillIdsForConversation(
      runtimeSkillIds,
      nodes,
      edges,
    );
  }

  public resolveAgentRuntimeMode(
    definitionRuntimeMode: unknown,
    snapshotRuntimeMode: unknown,
  ): AgentRuntimeMode {
    if (
      snapshotRuntimeMode === 'sandbox' ||
      snapshotRuntimeMode === 'no_sandbox'
    ) {
      return snapshotRuntimeMode;
    }

    return definitionRuntimeMode === 'no_sandbox' ? 'no_sandbox' : 'sandbox';
  }

  public buildReadOnlyNativeToolPolicy() {
    return {
      readEnabled: true,
      writeEnabled: false,
      editEnabled: false,
      terminalEnabled: false,
    } as const;
  }

  public registerSubAgentToolsProvider(params: {
    runtime: IAgentRuntime;
    sessionId: string;
    runtimeConfig: AgentRuntimeConfig;
    conversationId: string;
    tenantId: string;
    parentAbortSignal: AbortSignal;
    currentAgentDefinitionId: string;
    currentDepth: number;
    parentUsesSandboxRuntime: boolean;
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
          parentUsesSandboxRuntime: params.parentUsesSandboxRuntime,
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

  public async registerSelfEvolutionToolsProvider(params: {
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

  public async executeSubAgent(
    params: ExecuteSubAgentParams,
    subAgentTracker: SubAgentExecutionTracker,
  ): Promise<SubAgentResult> {
    const trackedAbort = new AbortController();
    subAgentTracker.abortControllers.set(params.handle, trackedAbort);
    const conversationId = params.parentContext.conversationId;

    if (!conversationId) {
      throw new Error('对话子代理执行缺少 conversationId');
    }

    const linkedAbort = this.combineAbortSignals([
      params.abortSignal,
      trackedAbort.signal,
    ]);

    let runtime: IAgentRuntime | null = null;
    let session: AgentSession | null = null;

    try {
      const versionSnapshot = params.versionSnapshot?.snapshot;
      const runtimeMode = this.resolveAgentRuntimeMode(
        params.agentDefinition.runtimeMode,
        versionSnapshot?.runtimeMode,
      );
      const normalizedDefinitionSandboxConfig =
        deriveAgentSandboxConfigFromCanvas(
          params.agentDefinition.nodes,
          params.agentDefinition.edges,
          params.agentDefinition.sandboxConfig,
        );
      const normalizedVersionSandboxConfig = versionSnapshot
        ? deriveAgentSandboxConfigFromCanvas(
            versionSnapshot.nodes,
            versionSnapshot.edges,
            versionSnapshot.sandboxConfig ?? null,
          )
        : null;
      const graphSystemPrompt =
        this.agentDefinitionService.resolveSystemPromptFromNodes?.(
          versionSnapshot?.nodes ?? params.agentDefinition.nodes,
          versionSnapshot?.edges ?? params.agentDefinition.edges,
        ) ??
        versionSnapshot?.systemPrompt ??
        params.agentDefinition.systemPrompt ??
        undefined;
      const compiledRuntimeConfig = versionSnapshot
        ? this.agentDefinitionService.buildRuntimeConfigFromNodes(
            versionSnapshot.nodes,
            versionSnapshot.edges,
            params.agentDefinition.id,
            runtimeMode,
          )
        : await this.agentDefinitionService.compileCanvas(
            params.agentDefinition.id,
          );
      const runtimeConfig = mergeRuntimeConfigWithSubAgentRef(
        compiledRuntimeConfig,
        params.subAgentRef,
      );
      runtimeConfig.runtimeMode ??= runtimeMode;
      const usesSandboxRuntime =
        runtimeConfig.runtimeMode === 'sandbox' ||
        (runtimeConfig.runtimeMode === 'no_sandbox' &&
          params.parentContext.parentUsesSandboxRuntime);

      if (
        runtimeConfig.runtimeMode === 'sandbox' &&
        !params.parentContext.parentUsesSandboxRuntime
      ) {
        throw new Error('无 sandbox Agent 不支持调用有 sandbox 的子 Agent');
      }

      if (runtimeConfig.runtimeMode === 'sandbox') {
        const sandboxConfig =
          mergeSandboxConfigCandidates(
            runtimeConfig.sandboxConfig ?? null,
            normalizedVersionSandboxConfig,
          ) ??
          normalizedDefinitionSandboxConfig ??
          params.agentDefinition.sandboxConfig;

        if (!sandboxConfig) {
          throw new AgentSandboxNotConnectedException(
            params.agentDefinition.id,
          );
        }

        runtimeConfig.sandboxConfig =
          resolveAgentRuntimeSandboxConfig(sandboxConfig);
      } else {
        runtimeConfig.sandboxConfig = undefined;
        if (usesSandboxRuntime) {
          runtimeConfig.nativeToolPolicy = this.buildReadOnlyNativeToolPolicy();
        }
      }

      const memoryInstanceIds = runtimeConfig.memoryInstanceIds ?? [];
      const memorySessionIds = await this.ensureAttachedMemorySessions(
        memoryInstanceIds,
        conversationId,
        params.parentContext.tenantId,
      );

      runtime = this.adapterFactory.selectAdapter(usesSandboxRuntime);

      if (runtimeConfig.runtimeMode === 'sandbox') {
        const skillPayloads = await resolveSkillPayloadsForGraph(
          {
            tenantId: params.parentContext.tenantId,
            agentDefinitionId: params.agentDefinition.id,
            skillIds: runtimeConfig.skillIds,
            nodes: versionSnapshot?.nodes ?? params.agentDefinition.nodes,
            edges: versionSnapshot?.edges ?? params.agentDefinition.edges,
          },
          this.skillResolverService,
          this.logger,
        );
        const piConfigInput = await buildPiConfigInput(
          {
            tenantId: params.parentContext.tenantId,
            runtimeConfig,
            systemPrompt: appendOutputSchemaToSystemPrompt(
              resolveSubAgentSystemPrompt(
                graphSystemPrompt,
                params.subAgentRef,
              ),
              runtimeConfig.outputSchema,
            ),
            skillPayloads,
          },
          this.llmService,
          this.mcpService,
          this.db,
          this.logger,
        );
        await this.sandboxService.createSandboxSession({
          sandboxNodeId: null,
          config: runtimeConfig.sandboxConfig!,
          tenantId: params.parentContext.tenantId,
          agentConversationId: conversationId,
          piConfigInput,
        });
      }

      const baseSystemPrompt = await resolveSkillAugmentedPrompt(
        {
          tenantId: params.parentContext.tenantId,
          agentDefinitionId: params.agentDefinition.id,
          skillIds: runtimeConfig.skillIds,
          nodes: versionSnapshot?.nodes ?? params.agentDefinition.nodes,
          edges: versionSnapshot?.edges ?? params.agentDefinition.edges,
          baseSystemPrompt: appendOutputSchemaToSystemPrompt(
            resolveSubAgentSystemPrompt(graphSystemPrompt, params.subAgentRef),
            runtimeConfig.outputSchema,
          ),
        },
        this.skillResolverService,
        this.logger,
      );
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
        conversationId,
        tenantId: params.parentContext.tenantId,
        currentAgentDefinitionId: params.agentDefinition.id,
      });
      this.registerSubAgentToolsProvider({
        runtime,
        sessionId: nextSessionId,
        runtimeConfig,
        conversationId,
        tenantId: params.parentContext.tenantId,
        parentAbortSignal: linkedAbort.signal,
        currentAgentDefinitionId: params.agentDefinition.id,
        currentDepth: params.depth,
        parentUsesSandboxRuntime: usesSandboxRuntime,
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
          ...(usesSandboxRuntime
            ? {
                serverSandbox: {
                  agentConversationId: conversationId,
                },
              }
            : {}),
          context: {
            tenantId: params.parentContext.tenantId,
            agentConversationId: conversationId,
            ...(usesSandboxRuntime
              ? {
                  serverSandbox: {
                    agentConversationId: conversationId,
                  },
                }
              : {}),
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
        void this.injectSubAgentCompletionNotice(
          conversationId,
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
        void this.injectSubAgentCompletionNotice(
          conversationId,
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

  public async runSubAgentPrompt(
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

  public buildSubAgentPrompt(task: string, context?: string): string {
    if (!context?.trim()) {
      return task;
    }

    return ['任务：', task.trim(), '', '额外上下文：', context.trim()].join(
      '\n',
    );
  }

  public abortTrackedSubAgents(
    subAgentTracker: SubAgentExecutionTracker,
    reason?: unknown,
  ): void {
    for (const abortController of subAgentTracker.abortControllers.values()) {
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }
    }
  }

  public combineAbortSignals(signals: Array<AbortSignal | undefined>): {
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

  public async injectSubAgentCompletionNotice(
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

  public summarizeSubAgentText(content: string | undefined): string {
    const normalized = (content ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'No summary available';
    }

    return normalized.length > 160
      ? `${normalized.slice(0, 157).trimEnd()}...`
      : normalized;
  }

  public registerMemoryToolsProvider(
    runtime: IAgentRuntime,
    sessionId: string,
    memorySessionIds: string[],
  ): void {
    bindMemoryToolSession({
      runtime,
      memoryToolsService: this.memoryToolsService,
      sessionId,
      memorySessionIds,
    });
  }

  public async cleanupConversationMemorySessions(
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

  public toMemoryResourceInstance(
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
  public emitPreparationPhase(
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
}
