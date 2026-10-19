import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import {
  safeQuitRedis,
  safeUnsubscribeRedis,
} from '../../../common/redis/redis-shutdown.util';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';

/** 跨实例取消频道：任一实例取消工作流执行，所有实例中止该执行在本地运行中的 Agent 会话。 */
export const WORKFLOW_EXECUTION_CANCEL_CHANNEL =
  '__workflow_execution_cancel__';

/**
 * 取消信号到达时会话可能尚未创建（步骤刚进入 running、还在加载 Agent 定义）。
 * 记住近期被取消的执行，晚到的会话注册时立即中止。
 */
const RECENTLY_CANCELLED_TTL_MS = 10 * 60 * 1000;

interface ActiveAgentSession {
  readonly runtime: Pick<IAgentRuntime, 'cancel'>;
  readonly sessionId: string;
}

/**
 * 工作流执行取消时中止运行中的 Agent 会话。
 *
 * Agent 节点在执行 worker 进程内跑 runtime.prompt 循环；取消请求可能落在任意实例，
 * 因此本实例直接中止，其余实例经 Redis 频道中止（与 Agent 对话取消同一模式）。
 */
@Injectable()
export class ExecutionCancellationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExecutionCancellationService.name);
  private readonly activeSessions = new Map<string, Set<ActiveAgentSession>>();
  private readonly recentlyCancelled = new Map<string, number>();
  private subscriber: Redis | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on('message', (channel: string, rawMessage: string) => {
      if (channel !== WORKFLOW_EXECUTION_CANCEL_CHANNEL) {
        return;
      }

      const executionId = this.parseExecutionId(rawMessage);
      if (executionId) {
        this.cancelLocalSessions(executionId);
      }
    });
    await subscriber.subscribe(WORKFLOW_EXECUTION_CANCEL_CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber) {
      return;
    }

    await safeUnsubscribeRedis(
      this.subscriber,
      WORKFLOW_EXECUTION_CANCEL_CHANNEL,
    );
    await safeQuitRedis(this.subscriber);
  }

  /**
   * 登记执行内正在运行的 Agent 会话，返回注销函数（会话结束时必须调用）。
   * 执行已被取消时立即中止该会话。
   */
  registerSession(
    executionId: string,
    runtime: Pick<IAgentRuntime, 'cancel'>,
    sessionId: string,
  ): () => void {
    const entry: ActiveAgentSession = { runtime, sessionId };

    const cancelledAt = this.recentlyCancelled.get(executionId);
    if (
      cancelledAt !== undefined &&
      Date.now() - cancelledAt < RECENTLY_CANCELLED_TTL_MS
    ) {
      this.cancelSession(executionId, entry);
      return () => undefined;
    }

    const sessions = this.activeSessions.get(executionId) ?? new Set();
    sessions.add(entry);
    this.activeSessions.set(executionId, sessions);

    return () => {
      const current = this.activeSessions.get(executionId);
      if (!current) {
        return;
      }
      current.delete(entry);
      if (current.size === 0) {
        this.activeSessions.delete(executionId);
      }
    };
  }

  /** 中止执行的全部 Agent 会话：本实例直接中止，并广播给其他实例。 */
  async cancelExecution(executionId: string): Promise<void> {
    this.cancelLocalSessions(executionId);
    await this.redis.publish(
      WORKFLOW_EXECUTION_CANCEL_CHANNEL,
      JSON.stringify({ executionId }),
    );
  }

  private cancelLocalSessions(executionId: string): void {
    this.pruneRecentlyCancelled();
    this.recentlyCancelled.set(executionId, Date.now());

    const sessions = this.activeSessions.get(executionId);
    if (!sessions) {
      return;
    }

    this.activeSessions.delete(executionId);
    for (const session of sessions) {
      this.cancelSession(executionId, session);
    }
  }

  private cancelSession(
    executionId: string,
    session: ActiveAgentSession,
  ): void {
    void session.runtime.cancel(session.sessionId).catch((error: unknown) => {
      this.logger.warn(
        `中止执行 ${executionId} 的 Agent 会话 ${session.sessionId} 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private pruneRecentlyCancelled(): void {
    const now = Date.now();
    for (const [executionId, cancelledAt] of this.recentlyCancelled) {
      if (now - cancelledAt >= RECENTLY_CANCELLED_TTL_MS) {
        this.recentlyCancelled.delete(executionId);
      }
    }
  }

  private parseExecutionId(rawMessage: string): string | null {
    try {
      const parsed: unknown = JSON.parse(rawMessage);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'executionId' in parsed &&
        typeof parsed.executionId === 'string' &&
        parsed.executionId.length > 0
      ) {
        return parsed.executionId;
      }
    } catch {
      // 落到下方统一告警
    }
    this.logger.warn('忽略无法解析的执行取消频道消息');
    return null;
  }
}
