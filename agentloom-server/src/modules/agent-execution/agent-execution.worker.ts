import { Injectable, Logger } from '@nestjs/common';
import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type { Job } from 'bullmq';
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
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import { memorySessions, type MemorySession } from '../../database/schema';
import { AgentAdapterFactory } from '../agent/agent-adapter.factory';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type { DecisionEvent, StopReason } from '../agent/types/agent-event.types';
import type { AgentSession } from '../agent/types/agent-session.types';
import type {
  ContentBlock,
  TextContentBlock,
} from '../agent/types/content-block.types';
import type { ToolCallEvent } from '../agent/types/tool-call-event.types';
import { AgentDefinitionService } from '../agent-definition/agent-definition.service';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import { EventBridgeService } from '../execution/services/event-bridge.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { MemoryToolsService } from '../agent-memory/memory-tools.service';
import { MemoryResourceProvider, type MemoryResourceInstance } from '../agent-memory/memory-resource.provider';
import { MemoryFusionService } from '../agent-memory/services/memory-fusion.service';
import type { MemoryBootSequenceResult } from '../agent-memory/services/boot-protocol.service';
import { SkillResolverService } from '../skill/skill-resolver.service';
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

type RuntimeSessionContext = {
  runtime: IAgentRuntime;
  session: AgentSession;
  memorySessionIds: string[];
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
};

@Injectable()
@Processor(AGENT_CONVERSATION_EXECUTION_QUEUE)
export class AgentExecutionWorker extends WorkerHost {
  private readonly logger = new Logger(AgentExecutionWorker.name);

  constructor(
    private readonly db: DrizzleDB,
    private readonly agentRuntime: IAgentRuntime,
    private readonly adapterFactory: AgentAdapterFactory,
    private readonly executionService: AgentExecutionService,
    private readonly eventBridge: EventBridgeService,
    private readonly sandboxService: SandboxService,
    private readonly agentDefinitionService: AgentDefinitionService,
    private readonly memoryToolsService?: MemoryToolsService,
    private readonly memoryFusionService?: MemoryFusionService,
    private readonly memoryResourceProvider?: MemoryResourceProvider,
    private readonly skillResolverService?: SkillResolverService,
    private readonly subAgentToolsProvider?: SubAgentToolsProvider,
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
  onFailed(job: Job<AgentConversationExecutionJobData> | undefined, error: Error) {
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
    const activeRun = this.executionService.registerActiveRun(conversationId, abort);

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
    const subAgentTracker: SubAgentExecutionTracker = {
      abortControllers: new Map(),
    };

    try {
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
        terminalStatus = context.conversation.status === 'failed' ? 'failed' : 'cancelled';
        await this.cleanupConversationMemorySessions(tenantId, executionMetadata.memorySessionIds);
        return;
      }

      const runtimeSessionContext = await this.prepareRuntimeSession(
        context,
        conversationId,
        tenantId,
        abort.signal,
        subAgentTracker,
        context.conversation.agentDefinitionId,
      );
      runtime = runtimeSessionContext.runtime;
      session = runtimeSessionContext.session;
      memorySessionIds = runtimeSessionContext.memorySessionIds ?? [];

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

      abort.signal.addEventListener('abort', () => {
        cancelSubAgents();
        void cancelRuntime();
      }, { once: true });

      executionMetadata = await this.updateExecutionMetadata(
        tenantId,
        conversationId,
        conversationMetadata,
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

      this.eventBridge.emitExecutionStatusChanged(tenantId, conversationId, {
        executionId: conversationId,
        status: 'running',
      });

      while (!abort.signal.aborted) {
        const pendingMessages = await this.loadPendingUserMessages(
          conversationId,
          tenantId,
          executionMetadata.lastProcessedMessageId,
        );

        if (pendingMessages.length === 0) {
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

        const turnResult = await this.runConversationTurn(
          runtime,
          session,
          conversationId,
          tenantId,
          pendingMessages,
          Boolean(executionMetadata.lastProcessedMessageId),
        );

        executionMetadata = await this.persistConversationTurn(
          conversationId,
          tenantId,
          conversationMetadata,
          pendingMessages,
          turnResult,
          session.id,
        );
        conversationMetadata = this.writeExecutionMetadata(
          conversationMetadata,
          executionMetadata,
        );

        if (turnResult.stopReason === 'cancelled') {
          terminalStatus = 'cancelled';
          break;
        }
      }
    } catch (error) {
      terminalStatus = abort.signal.aborted ? 'cancelled' : 'failed';

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
        errorMessage:
          error instanceof Error ? error.message : 'Agent conversation execution failed',
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
        runtimeConfig.sandboxConfig =
          snapshot.sandboxConfig ?? definition.sandboxConfig ?? undefined;
        systemPrompt = snapshot.systemPrompt ?? definition.systemPrompt ?? undefined;
      } else {
        runtimeConfig = await this.agentDefinitionService.compileCanvas(
          definition.id,
        );
        runtimeConfig.sandboxConfig =
          runtimeConfig.sandboxConfig ?? definition.sandboxConfig ?? undefined;
      }

      const memoryInstanceIds = this.resolveDefaultMemoryInstanceIds(
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
        hasSandbox: Boolean(runtimeConfig.sandboxConfig),
        memoryInstanceIds,
        executionMetadata: this.readExecutionMetadata(conversation.metadata),
      };
    });
  }

  private async prepareRuntimeSession(
    context: ConversationExecutionContext,
    conversationId: string,
    tenantId: string,
    parentAbortSignal: AbortSignal,
    subAgentTracker: SubAgentExecutionTracker,
    currentAgentDefinitionId: string,
  ): Promise<RuntimeSessionContext> {
    const runtime = this.resolveConversationRuntime(context);
    const memorySessionIds = await this.ensureConversationMemorySessions(
      context,
      conversationId,
      tenantId,
    );

    if (context.runtimeConfig.sandboxConfig) {
      await this.sandboxService.createSandboxSession({
        sandboxNodeId: null,
        config: context.runtimeConfig.sandboxConfig,
        tenantId,
        agentConversationId: conversationId,
      });
    }

    const sessionId = context.executionMetadata.sessionId;
    if (sessionId) {
      try {
        const session = await runtime.loadSession(sessionId);
        this.registerMemoryToolsProvider(runtime, session.id, memorySessionIds);
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
        return { runtime, session, memorySessionIds };
      } catch (error) {
        this.logger.debug(
          `Failed to resume conversation session ${sessionId}, creating a new one: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const baseSystemPrompt = await this.resolveConversationSkillPrompt(context);

    const systemPrompt = await this.resolveConversationSystemPrompt(
      memorySessionIds,
      baseSystemPrompt,
    );

    const session = await runtime.createSession({
      agentId: context.conversation.agentDefinitionId,
      mode: 'conversation',
      tenantId,
      llmModelConfigId: context.runtimeConfig.modelConfig?.modelId,
      systemPrompt,
      serverSandbox: { agentConversationId: conversationId },
      context: {
        tenantId,
        agentConversationId: conversationId,
        serverSandbox: { agentConversationId: conversationId },
        ...(memorySessionIds.length ? { memorySessionIds } : {}),
      },
    });

    this.registerMemoryToolsProvider(runtime, session.id, memorySessionIds);
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

    return { runtime, session, memorySessionIds };
  }

  private resolveConversationRuntime(
    context: ConversationExecutionContext,
  ): IAgentRuntime {
    return context.runtimeConfig.sandboxConfig
      ? this.adapterFactory.selectAdapter(true)
      : this.agentRuntime;
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

  private async runConversationTurn(
    runtime: IAgentRuntime,
    session: AgentSession,
    conversationId: string,
    tenantId: string,
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
  ): Promise<ConversationTurnResult> {
    const toolCalls = new Map<string, ToolCallEvent>();
    let assistantText = '';
    let decision: DecisionEvent | undefined;
    let lastStopReason: StopReason = 'end_turn';
    let chunkIndex = 0;
    let promptBlocks = this.buildPromptBlocks(pendingMessages, hasPriorTurns);

    while (true) {
      for await (const event of runtime.prompt(session.id, promptBlocks)) {
        if (event.type === 'message_chunk') {
          assistantText += event.content;
          this.eventBridge.emitOutputChunk(tenantId, conversationId, {
            stepId: conversationId,
            chunk: event.content,
            index: chunkIndex,
          });
          chunkIndex += 1;
          continue;
        }

        this.eventBridge.emitStepAgentEvent(tenantId, conversationId, {
          stepId: conversationId,
          event,
        });

        if (event.type === 'tool_call') {
          toolCalls.set(event.call.id, event.call);
          this.eventBridge.emitToolCallStatus(tenantId, conversationId, {
            stepId: conversationId,
            nodeId: conversationId,
            toolCallId: event.call.id,
            tool: event.call.tool,
            status: event.call.status,
            args: event.call.args,
            result: event.call.result,
            error: event.call.error,
            transitions: event.call.transitions
              ? [...event.call.transitions]
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

      if (lastStopReason !== 'tool_use') {
        break;
      }

      promptBlocks = [];
    }

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
      stopReason: lastStopReason,
      toolCalls: toolCallList,
      toolResults,
    };
  }

  private async persistConversationTurn(
    conversationId: string,
    tenantId: string,
    baseMetadata: Record<string, unknown>,
    pendingMessages: PendingMessage[],
    turnResult: ConversationTurnResult,
    sessionId: string,
  ): Promise<ConversationExecutionMetadata> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      let lastAssistantMessageId: string | undefined;

      if (
        turnResult.assistantText.length > 0 ||
        turnResult.toolCalls.length > 0 ||
        turnResult.decision
      ) {
        const [assistantMessage] = await dbClient
          .insert(agentMessages)
          .values({
            conversationId,
            tenantId,
            role: 'assistant',
            content: turnResult.assistantText,
            toolCalls:
              turnResult.toolCalls.length > 0
                ? turnResult.toolCalls.map(
                    (call) => ({
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
                      ...(call.error !== undefined
                        ? { error: call.error }
                        : {}),
                      ...(call.permissionRequest
                        ? { permissionRequest: call.permissionRequest }
                        : {}),
                    }),
                  )
                : null,
            toolResults:
              turnResult.toolResults.length > 0 ? turnResult.toolResults : null,
            metadata: {
              ...(turnResult.decision ? { decision: turnResult.decision } : {}),
              stopReason: turnResult.stopReason,
            },
          })
          .returning({ id: agentMessages.id });

        lastAssistantMessageId = assistantMessage.id;
      }

      const lastProcessedMessageId = pendingMessages.at(-1)?.id;
      const executionMetadata = this.mergeExecutionMetadata(baseMetadata, {
        sessionId,
        lastProcessedMessageId,
        lastAssistantMessageId,
        lastStopReason: turnResult.stopReason,
        runningState: 'running',
      });

      await dbClient
        .update(agentConversations)
        .set({
          metadata: this.writeExecutionMetadata(baseMetadata, executionMetadata),
          updatedAt: new Date(),
        })
        .where(eq(agentConversations.id, conversationId));

      return executionMetadata;
    });
  }

  private async updateExecutionMetadata(
    tenantId: string,
    conversationId: string,
    baseMetadata: Record<string, unknown>,
    patch: Partial<ConversationExecutionMetadata>,
  ): Promise<ConversationExecutionMetadata> {
    return runInTenantTransaction(this.db, tenantId, async (dbClient) => {
      const nextExecutionMetadata = this.mergeExecutionMetadata(baseMetadata, patch);
      await dbClient
        .update(agentConversations)
        .set({
          metadata: this.writeExecutionMetadata(baseMetadata, nextExecutionMetadata),
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
      return await runInTenantTransaction(this.db, tenantId, async (dbClient) => {
        const [conversation] = await dbClient
          .select({ metadata: agentConversations.metadata })
          .from(agentConversations)
          .where(eq(agentConversations.id, conversationId))
          .limit(1);

        if (!conversation) {
          return metadata;
        }

        const nextMetadata = this.writeExecutionMetadata(
          conversation.metadata,
          metadata,
        );

        await dbClient
          .update(agentConversations)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(eq(agentConversations.id, conversationId));

        return this.readExecutionMetadata(nextMetadata);
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update conversation ${conversationId} metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      return metadata;
    }
  }

  private buildPromptBlocks(
    pendingMessages: PendingMessage[],
    hasPriorTurns: boolean,
  ): ContentBlock[] {
    if (pendingMessages.length === 1) {
      return [
        {
          type: 'text',
          text: pendingMessages[0].content,
        } satisfies TextContentBlock,
      ];
    }

    const prefix = hasPriorTurns
      ? '在你上一轮回复后，用户又发送了以下新消息，请结合上下文继续回应：'
      : '用户连续发送了以下消息，请综合后统一回应：';

    return [
      {
        type: 'text',
        text: `${prefix}\n${pendingMessages
          .map((message, index) => `${index + 1}. ${message.content}`)
          .join('\n')}`,
      } satisfies TextContentBlock,
    ];
  }

  private readExecutionMetadata(
    metadata: Record<string, unknown>,
  ): ConversationExecutionMetadata {
    const execution = metadata['execution'];
    if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
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
      const bootSequence = await this.memoryFusionService.bootAll(memorySessionIds);
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
      nodes: context.canvasNodes,
      edges: context.canvasEdges,
      baseSystemPrompt: context.systemPrompt,
    });
  }

  private async resolveSkillAugmentedPrompt(params: {
    tenantId: string;
    agentDefinitionId: string;
    nodes: AgentVersionSnapshot['nodes'];
    edges: AgentVersionSnapshot['edges'];
    baseSystemPrompt?: string;
  }): Promise<string | undefined> {
    if (!this.skillResolverService) {
      return params.baseSystemPrompt;
    }

    const skillIds = this.extractConversationSkillIds(params.nodes, params.edges);

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
    const skillNodes = nodes.filter((node) => node.type === 'skill');
    if (!skillNodes.length) {
      return [];
    }

    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      if (typeof edge.source === 'string') {
        connectedNodeIds.add(edge.source);
      }
      if (typeof edge.target === 'string') {
        connectedNodeIds.add(edge.target);
      }
    }

    const connectedSkillNodes = skillNodes.filter((node) =>
      connectedNodeIds.has(node.id),
    );
    const activeSkillNodes = connectedSkillNodes.length
      ? connectedSkillNodes
      : skillNodes;

    return [...new Set(activeSkillNodes.map((node) => this.extractSkillId(node)))].filter(
      (skillId): skillId is string => typeof skillId === 'string' && skillId.length > 0,
    );
  }

  private extractSkillId(node: AgentVersionSnapshot['nodes'][number]): string | null {
    const nodeData =
      node.data && typeof node.data === 'object' && !Array.isArray(node.data)
        ? (node.data as Record<string, unknown>)
        : null;
    const config =
      nodeData?.config &&
      typeof nodeData.config === 'object' &&
      !Array.isArray(nodeData.config)
        ? (nodeData.config as Record<string, unknown>)
        : null;

    if (typeof config?.skillId === 'string' && config.skillId.trim()) {
      return config.skillId.trim();
    }

    if (typeof nodeData?.skillId === 'string' && nodeData.skillId.trim()) {
      return nodeData.skillId.trim();
    }

    return null;
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
        ['## Memory Index', ...bootSequence.index.map((path) => `- ${path.domain}://${path.pathString}`)].join('\n'),
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
      !params.runtimeConfig.subAgents?.length
      || !this.subAgentToolsProvider
      || !params.runtime.registerSessionToolProvider
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
        (subAgentParams) => this.executeSubAgent(subAgentParams, params.subAgentTracker),
      ),
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
        : await this.agentDefinitionService.compileCanvas(params.agentDefinition.id);

      runtimeConfig.sandboxConfig =
        versionSnapshot?.sandboxConfig
        ?? runtimeConfig.sandboxConfig
        ?? params.agentDefinition.sandboxConfig
        ?? undefined;

      const memoryInstanceIds = runtimeConfig.memoryInstanceIds ?? [];
      const memorySessionIds = await this.ensureAttachedMemorySessions(
        memoryInstanceIds,
        params.parentContext.conversationId,
        params.parentContext.tenantId,
      );

      runtime = runtimeConfig.sandboxConfig
        ? this.adapterFactory.selectAdapter(true)
        : this.agentRuntime;

      if (runtimeConfig.sandboxConfig) {
        await this.sandboxService.createSandboxSession({
          sandboxNodeId: null,
          config: runtimeConfig.sandboxConfig,
          tenantId: params.parentContext.tenantId,
          agentConversationId: params.parentContext.conversationId,
        });
      }

      const baseSystemPrompt = await this.resolveSkillAugmentedPrompt({
        tenantId: params.parentContext.tenantId,
        agentDefinitionId: params.agentDefinition.id,
        nodes: versionSnapshot?.nodes ?? params.agentDefinition.nodes,
        edges: versionSnapshot?.edges ?? params.agentDefinition.edges,
        baseSystemPrompt:
          versionSnapshot?.systemPrompt ?? params.agentDefinition.systemPrompt ?? undefined,
      });
      const systemPrompt = await this.resolveConversationSystemPrompt(
        memorySessionIds,
        baseSystemPrompt,
      );

      session = await runtime.createSession({
        agentId: params.agentDefinition.id,
        mode: 'conversation',
        tenantId: params.parentContext.tenantId,
        llmModelConfigId: runtimeConfig.modelConfig?.modelId,
        systemPrompt,
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

      this.registerMemoryToolsProvider(runtime, session.id, memorySessionIds);
      this.registerSubAgentToolsProvider({
        runtime,
        sessionId: session.id,
        runtimeConfig,
        conversationId: params.parentContext.conversationId,
        tenantId: params.parentContext.tenantId,
        parentAbortSignal: linkedAbort.signal,
        currentAgentDefinitionId: params.agentDefinition.id,
        currentDepth: params.depth,
        visitedAgentIds: params.parentContext.visitedAgentIds,
        subAgentTracker,
      });

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

    return ['任务：', task.trim(), '', '额外上下文：', context.trim()].join('\n');
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

  private combineAbortSignals(
    signals: Array<AbortSignal | undefined>,
  ): { signal: AbortSignal; cleanup: () => void } {
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
            error instanceof Error ? error.message : String(error ?? 'unknown error'),
          );
    const notice: SubAgentCompletionNotice = {
      type: 'subagent_completion',
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
        metadata: { notice },
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
      const sessions = await runInTenantTransaction(this.db, tenantId, async (dbClient) =>
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
