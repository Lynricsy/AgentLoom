import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import {
  safeQuitRedis,
  safeUnsubscribeRedis,
} from '../../common/redis/redis-shutdown.util';

export type DistributedToolPermissionResolution = 'approve' | 'deny';

type PendingResolutionCallback = (
  action: DistributedToolPermissionResolution,
) => void;

type ToolPermissionResolutionMessage = {
  sessionId: string;
  toolCallId: string;
  action: DistributedToolPermissionResolution;
};

const AGENT_TOOL_PERMISSION_SYNC_CHANNEL =
  '__agent_tool_permission_resolution__';

@Injectable()
export class AgentToolPermissionSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AgentToolPermissionSyncService.name);
  private readonly subscriber: Redis | null;
  private readonly ownsSubscriber: boolean;
  private readonly pendingResolutions = new Map<
    string,
    Map<string, PendingResolutionCallback>
  >();

  constructor(@Inject(REDIS_CLIENT) private readonly publisher: Redis) {
    const duplicate = (this.publisher as Redis & {
      duplicate?: (() => Redis) | undefined;
    }).duplicate;

    if (typeof duplicate === 'function') {
      this.subscriber = duplicate.call(this.publisher);
      this.ownsSubscriber = true;
      return;
    }

    this.subscriber = null;
    this.ownsSubscriber = false;
    this.logger.warn(
      'Redis publisher 未提供 duplicate()，跳过工具权限分布式订阅。',
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.subscriber) {
      return;
    }

    await this.subscriber.subscribe(AGENT_TOOL_PERMISSION_SYNC_CHANNEL);

    this.subscriber.on('message', (channel, rawMessage) => {
      if (channel !== AGENT_TOOL_PERMISSION_SYNC_CHANNEL) {
        return;
      }

      const payload = this.parseMessage(rawMessage);
      if (!payload) {
        return;
      }

      const sessionResolvers = this.pendingResolutions.get(payload.sessionId);
      const resolver = sessionResolvers?.get(payload.toolCallId);

      if (!resolver) {
        return;
      }

      resolver(payload.action);
    });
  }

  registerPendingResolution(
    sessionId: string,
    toolCallId: string,
    resolve: PendingResolutionCallback,
  ): void {
    const sessionResolvers =
      this.pendingResolutions.get(sessionId) ??
      new Map<string, PendingResolutionCallback>();
    sessionResolvers.set(toolCallId, resolve);
    this.pendingResolutions.set(sessionId, sessionResolvers);
  }

  unregisterPendingResolution(sessionId: string, toolCallId: string): void {
    const sessionResolvers = this.pendingResolutions.get(sessionId);
    if (!sessionResolvers) {
      return;
    }

    sessionResolvers.delete(toolCallId);
    if (sessionResolvers.size === 0) {
      this.pendingResolutions.delete(sessionId);
    }
  }

  async publishResolution(
    sessionId: string,
    toolCallId: string,
    action: DistributedToolPermissionResolution,
  ): Promise<void> {
    await this.publisher.publish(
      AGENT_TOOL_PERMISSION_SYNC_CHANNEL,
      JSON.stringify({
        sessionId,
        toolCallId,
        action,
      } satisfies ToolPermissionResolutionMessage),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber || !this.ownsSubscriber) {
      return;
    }

    await safeUnsubscribeRedis(
      this.subscriber,
      AGENT_TOOL_PERMISSION_SYNC_CHANNEL,
    );
    await safeQuitRedis(this.subscriber);
  }

  private parseMessage(
    rawMessage: string,
  ): ToolPermissionResolutionMessage | null {
    try {
      const parsed = JSON.parse(
        rawMessage,
      ) as Partial<ToolPermissionResolutionMessage>;

      if (
        typeof parsed.sessionId !== 'string' ||
        parsed.sessionId.length === 0 ||
        typeof parsed.toolCallId !== 'string' ||
        parsed.toolCallId.length === 0 ||
        (parsed.action !== 'approve' && parsed.action !== 'deny')
      ) {
        return null;
      }

      return {
        sessionId: parsed.sessionId,
        toolCallId: parsed.toolCallId,
        action: parsed.action,
      };
    } catch (error) {
      this.logger.warn(
        `忽略无法解析的工具权限同步消息: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
