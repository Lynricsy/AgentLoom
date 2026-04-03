import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, sql } from 'drizzle-orm';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
} from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import {
  agentDefinitions,
  type AgentRuntimeMode,
} from '../../database/schema/agent-definitions.schema';
import type { CreateConversationDto } from './dto/create-conversation.dto';
import type { SendMessageDto } from './dto/send-message.dto';
import type { UpdateConversationDto } from './dto/update-conversation.dto';
import { serializeConversation } from './dto/conversation-response.dto';
import { serializeMessage } from './dto/message-response.dto';

@Injectable()
export class AgentConversationService {
  private readonly logger = new Logger(AgentConversationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly eventEmitter: EventEmitter2,
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

  async create(
    agentDefinitionId: string,
    tenantId: string,
    userId: string,
    dto: CreateConversationDto,
  ) {
    const [agent] = await this.tenantDb
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, agentDefinitionId))
      .limit(1);

    if (!agent) {
      throw new NotFoundException(
        `Agent definition ${agentDefinitionId} not found`,
      );
    }

    const [conversation] = await this.tenantDb
      .insert(agentConversations)
      .values({
        agentDefinitionId,
        tenantId,
        title: dto.title,
        metadata: dto.metadata ?? {},
        createdBy: userId,
      })
      .returning();

    this.logger.log(
      `Created conversation ${conversation.id} for agent ${agentDefinitionId}`,
    );

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
    const [conversation] = await this.tenantDb
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

    const [message] = await this.tenantDb
      .insert(agentMessages)
      .values({
        conversationId,
        tenantId,
        role: dto.role ?? 'user',
        content: dto.content,
        metadata: dto.metadata ?? {},
      })
      .returning();

    await this.tenantDb
      .update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(eq(agentConversations.id, conversationId));

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
