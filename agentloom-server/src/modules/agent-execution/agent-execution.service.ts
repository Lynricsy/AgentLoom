import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import type { ConversationSnapshotMessage } from '@agentloom/contracts';

import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
  runInTenantTransaction,
} from '../../common/interceptors/tenant-transaction.context';
import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import type { DrizzleDB } from '../../database/database.module';
import {
  agentConversations,
  agentMessages,
} from '../../database/schema/agent-conversations.schema';
import { AgentConversationService } from '../agent-conversation/agent-conversation.service';
import type { SendMessageDto } from '../agent-conversation/dto/send-message.dto';
import { SandboxMaintenanceException } from '../sandbox/sandbox.exceptions';

export const AGENT_CONVERSATION_EXECUTION_QUEUE =
  'agent-conversation-execution';

export const AGENT_CONVERSATION_EXECUTION_JOB = 'execute-agent-loop';

export const AGENT_CONVERSATION_EXECUTION_QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
  attempts: 1,
} as const;

export const AGENT_CONVERSATION_IDLE_WAIT_MS = 5_000;

export interface AgentConversationExecutionJobData {
  conversationId: string;
  tenantId: string;
}

export interface AgentConversationActiveRun {
  abort: AbortController;
  notify: () => void;
}

type NotificationWaiter = (result: AgentConversationWaitResult) => void;

export type AgentConversationWaitResult = 'notified' | 'timeout' | 'aborted';

type ConversationIdentity = {
  id: string;
  tenantId: string;
  status: 'active' | 'paused' | 'ended' | 'failed';
};

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);
  private readonly activeRuns = new Map<string, AgentConversationActiveRun>();
  private readonly notificationWaiters = new Map<
    string,
    Set<NotificationWaiter>
  >();

  constructor(
    private readonly db: DrizzleDB,
    private readonly executionQueue: Queue,
    private readonly conversationService: AgentConversationService,
  ) {}

  @OnEvent('agent-conversation.message-sent')
  async handleMessageSent(payload: {
    conversationId: string;
    tenantId: string;
    messageId: string;
  }): Promise<void> {
    this.logger.debug(
      `Received message-sent event for conversation ${payload.conversationId}, dispatching execution`,
    );
    await this.dispatchConversationExecution(
      payload.conversationId,
      payload.tenantId,
    );
  }

  async startConversation(
    conversationId: string,
    initialMessage: string,
  ): Promise<void> {
    await this.injectMessage(conversationId, initialMessage);
  }

  async injectMessage(
    conversationId: string,
    message: string | SendMessageDto,
  ): Promise<void> {
    const conversation =
      await this.getConversationIdentityOrThrow(conversationId);
    const normalizedMessage = this.normalizeMessage(message);

    await this.withTenantContext(conversation.tenantId, async () => {
      await this.conversationService.sendMessage(
        conversationId,
        conversation.tenantId,
        normalizedMessage,
      );
    });

    await this.dispatchConversationExecution(
      conversationId,
      conversation.tenantId,
    );
  }

  async cancelExecution(conversationId: string): Promise<void> {
    const conversation =
      await this.getConversationIdentityOrThrow(conversationId);

    await this.withTenantContext(conversation.tenantId, async () => {
      await this.conversationService.cancel(conversationId);
    });

    await this.dispatchAfterCommit(async () => {
      const activeRun = this.activeRuns.get(conversationId);
      if (!activeRun) {
        return;
      }

      activeRun.abort.abort();
      activeRun.notify();
    });
  }

  registerActiveRun(
    conversationId: string,
    abort: AbortController,
  ): AgentConversationActiveRun | null {
    const existing = this.activeRuns.get(conversationId);
    if (existing && !existing.abort.signal.aborted) {
      return null;
    }

    const handle: AgentConversationActiveRun = {
      abort,
      notify: () => {
        this.resolveNotificationWaiters(conversationId, 'notified');
      },
    };

    this.activeRuns.set(conversationId, handle);
    return handle;
  }

  clearActiveRun(conversationId: string, abort?: AbortController): void {
    const current = this.activeRuns.get(conversationId);
    if (!current) {
      return;
    }

    if (abort && current.abort !== abort) {
      return;
    }

    this.activeRuns.delete(conversationId);
    this.resolveNotificationWaiters(conversationId, 'timeout');
  }

  getActiveRun(conversationId: string): AgentConversationActiveRun | undefined {
    return this.activeRuns.get(conversationId);
  }

  async waitForNotification(
    conversationId: string,
    abortSignal: AbortSignal,
    timeoutMs = AGENT_CONVERSATION_IDLE_WAIT_MS,
  ): Promise<AgentConversationWaitResult> {
    if (abortSignal.aborted) {
      return 'aborted';
    }

    return new Promise<AgentConversationWaitResult>((resolve) => {
      const waiters =
        this.notificationWaiters.get(conversationId) ??
        new Set<NotificationWaiter>();

      const finish = (result: AgentConversationWaitResult) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        abortSignal.removeEventListener('abort', onAbort);

        const currentWaiters = this.notificationWaiters.get(conversationId);
        currentWaiters?.delete(waiter);
        if (currentWaiters && currentWaiters.size === 0) {
          this.notificationWaiters.delete(conversationId);
        }

        resolve(result);
      };

      const waiter: NotificationWaiter = (result) => {
        finish(result);
      };
      const onAbort = () => {
        finish('aborted');
      };
      const timeoutId = setTimeout(() => {
        finish('timeout');
      }, timeoutMs);
      let settled = false;

      waiters.add(waiter);
      this.notificationWaiters.set(conversationId, waiters);
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async dispatchConversationExecution(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    if (process.env.APP_SANDBOX_MAINTENANCE_MODE === 'true') {
      throw new SandboxMaintenanceException('execute');
    }
    await this.dispatchAfterCommit(async () => {
      const activeRun = this.activeRuns.get(conversationId);
      if (activeRun) {
        activeRun.notify();
        return;
      }

      await this.enqueueExecutionJob(conversationId, tenantId);
    });
  }

  private async dispatchAfterCommit(
    operation: () => Promise<void>,
  ): Promise<void> {
    if (hasActiveTenantTransaction()) {
      registerAfterCommitHook(operation);
      return;
    }

    await operation();
  }

  private resolveNotificationWaiters(
    conversationId: string,
    result: AgentConversationWaitResult,
  ): void {
    const waiters = this.notificationWaiters.get(conversationId);
    if (!waiters || waiters.size === 0) {
      return;
    }

    this.notificationWaiters.delete(conversationId);
    for (const waiter of waiters) {
      waiter(result);
    }
  }

  private async enqueueExecutionJob(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const existingJob = await this.executionQueue.getJob(conversationId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed' || state === 'failed') {
        await existingJob.remove();
      } else {
        this.logger.debug(
          `Skipped queueing agent conversation execution for ${conversationId} because job already exists in state ${state}`,
        );
        return;
      }
    }

    await this.executionQueue.add(
      AGENT_CONVERSATION_EXECUTION_JOB,
      {
        conversationId,
        tenantId,
      } satisfies AgentConversationExecutionJobData,
      {
        jobId: conversationId,
      },
    );

    this.logger.debug(
      `Queued agent conversation execution for ${conversationId}`,
    );
  }

  private normalizeMessage(message: string | SendMessageDto): SendMessageDto {
    if (typeof message === 'string') {
      return {
        content: message,
        role: 'user',
        contentType: 'text',
      } as SendMessageDto;
    }

    return {
      content: message.content,
      role: message.role ?? 'user',
      contentType: message.contentType ?? 'text',
      metadata: message.metadata,
    } as SendMessageDto;
  }

  private async getConversationIdentityOrThrow(
    conversationId: string,
  ): Promise<ConversationIdentity> {
    const dbClient = hasActiveTenantTransaction()
      ? getTenantDb(this.db)
      : this.db;
    const [conversation] = await dbClient
      .select({
        id: agentConversations.id,
        tenantId: agentConversations.tenantId,
        status: agentConversations.status,
      })
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  /**
   * 读取对话的持久快照，用于重连时 EventBridge 缓存出现缺口的兜底补发。
   *
   * 对话侧没有带 wire eventId 的持久事件表，`agent_messages` 只有轮末聚合正文，
   * 因此缓存缺口时只能整体重放这份持久状态，不能逐事件补发。
   * 查询强制带 tenantId 条件：ws 订阅只校验 JWT 的 tenant，不能靠 conversationId 兜底。
   */
  async getConversationSnapshotMessages(
    tenantId: string,
    conversationId: string,
  ): Promise<ConversationSnapshotMessage[]> {
    const rows = await runInTenantTransaction(this.db, tenantId, async (tx) =>
      tx
        .select({
          id: agentMessages.id,
          role: agentMessages.role,
          contentType: agentMessages.contentType,
          content: agentMessages.content,
          toolCalls: agentMessages.toolCalls,
          metadata: agentMessages.metadata,
          createdAt: agentMessages.createdAt,
        })
        .from(agentMessages)
        .where(
          and(
            eq(agentMessages.conversationId, conversationId),
            eq(agentMessages.tenantId, tenantId),
          ),
        )
        .orderBy(agentMessages.createdAt),
    );

    // 原样带上 toolCalls 与 metadata：客户端按历史消息的同一套规则归一化。
    // snapshot 是按 messageId 整条覆盖的，少带一个字段就等于抹掉界面上对应的部分
    // （工具卡、附件、thinking 都只存在于这两处）。
    return rows.map((row) => ({
      messageId: row.id,
      role: row.role,
      contentType: row.contentType,
      content: row.content,
      toolCalls: row.toolCalls ?? null,
      metadata: row.metadata ?? {},
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async withTenantContext<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (hasActiveTenantTransaction()) {
      return operation();
    }

    return runInTenantTransaction(this.db, tenantId, async () => operation());
  }
}
