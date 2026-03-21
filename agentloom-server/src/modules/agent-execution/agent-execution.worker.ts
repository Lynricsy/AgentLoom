import { Injectable, Logger } from '@nestjs/common';
import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { and, asc, eq } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  agentVersions,
  type AgentVersionSnapshot,
} from '../../database/schema/agent-definitions.schema';
import { AgentAdapterFactory, AGENT_RUNTIME_FACTORY } from '../agent/agent-adapter.factory';
import { AGENT_RUNTIME, type IAgentRuntime } from '../agent/ports/agent-runtime.port';
import type { AgentEvent, DecisionEvent, StopReason } from '../agent/types/agent-event.types';
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
import {
  AGENT_CONVERSATION_EXECUTION_JOB,
  AGENT_CONVERSATION_EXECUTION_QUEUE,
  AGENT_CONVERSATION_IDLE_WAIT_MS,
  AgentExecutionService,
  type AgentConversationExecutionJobData,
} from './agent-execution.service';

type ConversationExecutionMetadata = {
  sessionId?: string;
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
  hasSandbox: boolean;
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
};

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

    try {
      const context = await this.loadConversationExecutionContext(
        conversationId,
        tenantId,
      );

      if (!context) {
        return;
      }

      if (context.conversation.status !== 'active') {
        terminalStatus = context.conversation.status === 'failed' ? 'failed' : 'cancelled';
        return;
      }

      executionMetadata = context.executionMetadata;
      conversationMetadata = context.conversation.metadata;
      ({ runtime, session } = await this.prepareRuntimeSession(
        context,
        conversationId,
        tenantId,
      ));

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

      abort.signal.addEventListener('abort', () => {
        void cancelRuntime();
      });

      executionMetadata = await this.updateExecutionMetadata(
        tenantId,
        conversationId,
        conversationMetadata,
        {
          sessionId: session.id,
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
          sandboxConfig: agentDefinitions.sandboxConfig,
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

      return {
        conversation,
        runtimeConfig,
        systemPrompt,
        hasSandbox: Boolean(runtimeConfig.sandboxConfig),
        executionMetadata: this.readExecutionMetadata(conversation.metadata),
      };
    });
  }

  private async prepareRuntimeSession(
    context: ConversationExecutionContext,
    conversationId: string,
    tenantId: string,
  ): Promise<RuntimeSessionContext> {
    const runtime = context.hasSandbox
      ? this.adapterFactory.selectAdapter(true)
      : this.agentRuntime;

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
        return { runtime, session };
      } catch (error) {
        this.logger.debug(
          `Failed to resume conversation session ${sessionId}, creating a new one: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const session = await runtime.createSession({
      agentId: context.conversation.agentDefinitionId,
      mode: 'conversation',
      tenantId,
      llmModelConfigId: context.runtimeConfig.modelConfig?.modelId,
      systemPrompt: context.systemPrompt,
      serverSandbox: { agentConversationId: conversationId },
      context: {
        tenantId,
        agentConversationId: conversationId,
        serverSandbox: { agentConversationId: conversationId },
      },
    });

    return { runtime, session };
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

    return execution as ConversationExecutionMetadata;
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
