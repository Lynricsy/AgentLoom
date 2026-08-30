import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, sql } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
} from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import {
  ToolCallNotFoundException,
  ToolPermissionResolutionNotAllowedException,
} from '../../common/exceptions/tool-call.exceptions';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  type AgentRuntimeMode,
} from '../../database/schema/agent-definitions.schema';
import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import { SandboxAgentAdapter } from '../agent/sandbox-agent.adapter';
import { SelfEvolutionPermissionService } from '../self-evolution/self-evolution-permission.service';
import type { CreateConversationDto } from './dto/create-conversation.dto';
import type { StartConversationDto } from './dto/start-conversation.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  normalizeIncomingConversationMetadata,
  readConversationAttachmentMetadataList,
  type ConversationMessageContentType,
} from './conversation-attachment';
import { serializeConversation } from './dto/conversation-response.dto';
import { serializeMessage } from './dto/message-response.dto';

type ConversationDbClient = Pick<DrizzleDB, 'select' | 'insert' | 'update'>;

@Injectable()
export class AgentConversationService {
  private readonly logger = new Logger(AgentConversationService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
    private readonly sandboxAgentAdapter: SandboxAgentAdapter,
    @Inject(AGENT_RUNTIME)
    private readonly inProcessAgentRuntime: IAgentRuntime,
    private readonly selfEvolutionPermissionService: SelfEvolutionPermissionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  private emitConversationEnded(conversation: {
    id: string;
    tenantId: string;
    createdBy: string;
  }): void {
    const payload = {
      conversationId: conversation.id,
      tenantId: conversation.tenantId,
      organizationId: conversation.tenantId,
      userId: conversation.createdBy,
    };

    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(async () => {
        this.eventEmitter.emit('agent-conversation.ended', payload);
      });
      return;
    }

    this.eventEmitter.emit('agent-conversation.ended', payload);
  }

  private async ensureAgentExists(
    dbClient: ConversationDbClient,
    agentDefinitionId: string,
  ): Promise<void> {
    const [agent] = await dbClient
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, agentDefinitionId))
      .limit(1);

    if (!agent) {
      throw new NotFoundException(
        `Agent definition ${agentDefinitionId} not found`,
      );
    }
  }

  private async insertConversationRecord(
    dbClient: ConversationDbClient,
    agentDefinitionId: string,
    tenantId: string,
    userId: string,
    dto: CreateConversationDto,
  ) {
    const [conversation] = await dbClient
      .insert(agentConversations)
      .values({
        agentDefinitionId,
        tenantId,
        title: dto.title,
        metadata: dto.metadata ?? {},
        createdBy: userId,
      })
      .returning();

    return conversation;
  }

  private async assertConversationIsActive(
    dbClient: ConversationDbClient,
    conversationId: string,
  ): Promise<void> {
    const [conversation] = await dbClient
      .select({
        id: agentConversations.id,
        status: agentConversations.status,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.status !== 'active') {
      throw new NotFoundException(
        `Conversation ${conversationId} is not active (status: ${conversation.status})`,
      );
    }
  }

  private normalizeMessagePayload(dto: SendMessageDto) {
    const requestedContentType =
      (dto.contentType as ConversationMessageContentType | undefined) ?? 'text';
    const metadata = normalizeIncomingConversationMetadata(
      requestedContentType,
      dto.metadata ?? {},
    );
    const attachments = readConversationAttachmentMetadataList(metadata);
    const contentType: ConversationMessageContentType =
      attachments.length > 0 &&
      requestedContentType !== 'text' &&
      attachments.every(
        (attachment) => attachment.kind === requestedContentType,
      )
        ? requestedContentType
        : 'text';

    return {
      contentType,
      metadata,
      role: dto.role ?? 'user',
    };
  }

  private async insertMessageRecord(
    dbClient: ConversationDbClient,
    conversationId: string,
    tenantId: string,
    dto: SendMessageDto,
  ) {
    const { contentType, metadata, role } = this.normalizeMessagePayload(dto);

    const [message] = await dbClient
      .insert(agentMessages)
      .values({
        conversationId,
        tenantId,
        role,
        contentType,
        content: dto.content,
        metadata,
      })
      .returning();

    await dbClient
      .update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(eq(agentConversations.id, conversationId));

    return message;
  }

  async create(
    agentDefinitionId: string,
    tenantId: string,
    userId: string,
    dto: CreateConversationDto,
  ) {
    await this.ensureAgentExists(this.tenantDb, agentDefinitionId);

    const conversation = await this.insertConversationRecord(
      this.tenantDb,
      agentDefinitionId,
      tenantId,
      userId,
      dto,
    );

    this.logger.log(
      `Created conversation ${conversation.id} for agent ${agentDefinitionId}`,
    );

    return { data: serializeConversation(conversation) };
  }

  async startConversation(
    agentDefinitionId: string,
    tenantId: string,
    userId: string,
    dto: StartConversationDto,
  ) {
    const { conversation, message } = await this.tenantDb.transaction(
      async (tx) => {
        await this.ensureAgentExists(tx, agentDefinitionId);

        const conversation = await this.insertConversationRecord(
          tx,
          agentDefinitionId,
          tenantId,
          userId,
          {
            ...(dto.title ? { title: dto.title } : {}),
          },
        );

        const message = await this.insertMessageRecord(
          tx,
          conversation.id,
          tenantId,
          {
            content: dto.content,
            role: 'user',
            contentType: dto.contentType ?? 'text',
            ...(dto.metadata ? { metadata: dto.metadata } : {}),
          },
        );

        return { conversation, message };
      },
    );

    this.logger.log(
      `Started conversation ${conversation.id} for agent ${agentDefinitionId}`,
    );

    this.eventEmitter.emit('agent-conversation.message-sent', {
      conversationId: conversation.id,
      tenantId,
      messageId: message.id,
    });

    return { data: serializeConversation(conversation) };
  }

  async listByAgent(
    agentDefinitionId: string,
    query: { page: number; limit: number; status?: string },
  ) {
    const { page, limit, status } = query;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(agentConversations.agentDefinitionId, agentDefinitionId),
    ];

    if (status) {
      conditions.push(
        eq(
          agentConversations.status,
          status as 'active' | 'paused' | 'ended' | 'failed',
        ),
      );
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      this.tenantDb
        .select()
        .from(agentConversations)
        .where(whereClause)
        .orderBy(desc(agentConversations.updatedAt))
        .limit(limit)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(agentConversations)
        .where(whereClause),
    ]);

    return {
      data: data.map(serializeConversation),
      meta: {
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listMessages(conversationId: string, page = 1, limit = 50) {
    const [conversation] = await this.tenantDb
      .select({ id: agentConversations.id })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const offset = (page - 1) * limit;

    const [messages, [{ total }]] = await Promise.all([
      this.tenantDb
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId))
        .orderBy(agentMessages.createdAt)
        .limit(limit)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId)),
    ]);

    return {
      data: messages.map(serializeMessage),
      meta: {
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDetail(
    conversationId: string,
    messagesPage = 1,
    messagesLimit = 50,
  ) {
    const [conversation] = await this.tenantDb
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const offset = (messagesPage - 1) * messagesLimit;

    const [messages, [{ total }]] = await Promise.all([
      this.tenantDb
        .select()
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId))
        .orderBy(agentMessages.createdAt)
        .limit(messagesLimit)
        .offset(offset),
      this.tenantDb
        .select({ total: sql<number>`count(*)::int` })
        .from(agentMessages)
        .where(eq(agentMessages.conversationId, conversationId)),
    ]);

    return {
      data: {
        ...serializeConversation(conversation),
        messages: {
          data: messages.map(serializeMessage),
          meta: {
            total,
            page: messagesPage,
            pageSize: messagesLimit,
            totalPages: Math.ceil(total / messagesLimit),
          },
        },
      },
    };
  }

  async validateConversationToolCallPermissionState(
    tenantId: string,
    conversationId: string,
    toolCallId: string,
  ): Promise<boolean> {
    const messages = await this.tenantDb
      .select({ toolCalls: agentMessages.toolCalls })
      .from(agentMessages)
      .where(
        and(
          eq(agentMessages.tenantId, tenantId),
          eq(agentMessages.conversationId, conversationId),
        ),
      );

    for (const message of messages) {
      if (!Array.isArray(message.toolCalls)) {
        continue;
      }

      for (const entry of message.toolCalls) {
        if (!this.isRecord(entry)) {
          continue;
        }

        const persistedId =
          typeof entry.id === 'string'
            ? entry.id
            : typeof entry.toolCallId === 'string'
              ? entry.toolCallId
              : undefined;
        if (persistedId !== toolCallId) {
          continue;
        }

        const status = this.readPersistedToolCallStatus(entry);
        if (status !== 'awaiting_permission') {
          // 持久消息是完成状态的最终事实，必须优先于可能尚未清理的 Redis gate，
          // 否则同一工具调用会在完成后再次被批准或拒绝。
          throw new ToolPermissionResolutionNotAllowedException(
            toolCallId,
            status,
          );
        }

        return true;
      }
    }
    if (
      await this.selfEvolutionPermissionService.hasConversationRequest(
        conversationId,
        toolCallId,
      )
    ) {
      return false;
    }

    const target = await this.getPermissionResolutionTarget(conversationId);
    const hasRuntimeGate =
      target.runtimeMode === 'no_sandbox'
        ? Boolean(
            target.sessionId &&
            this.inProcessAgentRuntime.hasPendingToolPermission?.(
              target.sessionId,
              toolCallId,
            ),
          )
        : this.sandboxAgentAdapter.hasPendingConversationToolPermission(
            conversationId,
            toolCallId,
          );
    if (hasRuntimeGate) {
      return false;
    }

    // 持久历史和所有 live gate 都无法证明调用存在时才返回 404，
    // 既不会误杀尚未归档的请求，也不会让随机 ID 进入决议 adapter。
    throw new ToolCallNotFoundException(toolCallId);
  }

  async getPermissionResolutionTarget(conversationId: string): Promise<{
    runtimeMode: AgentRuntimeMode;
    sessionId?: string;
  }> {
    const [conversation] = await this.tenantDb
      .select({
        id: agentConversations.id,
        metadata: agentConversations.metadata,
        runtimeMode: agentDefinitions.runtimeMode,
      })
      .from(agentConversations)
      .innerJoin(
        agentDefinitions,
        eq(agentDefinitions.id, agentConversations.agentDefinitionId),
      )
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const executionRecord = this.readExecutionMetadata(conversation.metadata);
    return {
      runtimeMode: conversation.runtimeMode ?? 'sandbox',
      ...(executionRecord.sessionId
        ? { sessionId: executionRecord.sessionId }
        : {}),
    };
  }

  async sendMessage(
    conversationId: string,
    tenantId: string,
    dto: SendMessageDto,
  ) {
    await this.assertConversationIsActive(this.tenantDb, conversationId);

    const message = await this.insertMessageRecord(
      this.tenantDb,
      conversationId,
      tenantId,
      dto,
    );

    this.logger.log(
      `Message ${message.id} sent to conversation ${conversationId}`,
    );

    this.eventEmitter.emit('agent-conversation.message-sent', {
      conversationId,
      tenantId,
      messageId: message.id,
    });

    return { data: serializeMessage(message) };
  }

  async cancel(conversationId: string) {
    const [conversation] = await this.tenantDb
      .update(agentConversations)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(
        and(
          eq(agentConversations.id, conversationId),
          eq(agentConversations.status, 'active'),
        ),
      )
      .returning();

    if (!conversation) {
      throw new NotFoundException(
        `Active conversation ${conversationId} not found`,
      );
    }

    this.logger.log(`Conversation ${conversationId} cancelled`);
    this.emitConversationEnded(conversation);

    return { data: serializeConversation(conversation) };
  }

  async end(conversationId: string) {
    const [conversation] = await this.tenantDb
      .update(agentConversations)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(agentConversations.id, conversationId))
      .returning();

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    this.logger.log(`Conversation ${conversationId} ended`);
    this.emitConversationEnded(conversation);
  }

  async updateConversation(
    conversationId: string,
    tenantId: string,
    dto: UpdateConversationDto,
  ) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.metadata !== undefined) updates.metadata = dto.metadata;

    const [conversation] = await this.tenantDb
      .update(agentConversations)
      .set(updates)
      .where(
        and(
          eq(agentConversations.id, conversationId),
          eq(agentConversations.tenantId, tenantId),
        ),
      )
      .returning();

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return { data: serializeConversation(conversation) };
  }

  private readPersistedToolCallStatus(entry: Record<string, unknown>): string {
    switch (entry.status) {
      case 'pending':
      case 'awaiting_permission':
      case 'denied':
      case 'in_progress':
      case 'completed':
      case 'failed':
        return entry.status;
      default:
        // 必须与历史消息 serializer 保持同一优先级，避免 API 展示状态与审批守卫冲突。
        return entry.error !== undefined
          ? 'failed'
          : entry.result !== undefined
            ? 'completed'
            : 'pending';
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readExecutionMetadata(
    metadata: unknown,
  ): { sessionId?: string } & Record<string, unknown> {
    if (
      metadata &&
      typeof metadata === 'object' &&
      'execution' in metadata &&
      metadata.execution &&
      typeof metadata.execution === 'object'
    ) {
      return metadata.execution as { sessionId?: string } & Record<
        string,
        unknown
      >;
    }

    return {};
  }
}
