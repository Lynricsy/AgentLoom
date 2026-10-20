import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, type ServerOptions } from 'socket.io';
import Redis from 'ioredis';
import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../modules/agent-conversation/conversation-attachment';
import {
  observeRedisConnection,
  redisReconnectDelay,
} from '../redis/redis-connection.util';

/**
 * 基于 Redis 的 Socket.IO 适配器
 * 用于多实例部署时跨进程广播 WebSocket 事件
 *
 * 创建独立的 pub/sub Redis 客户端，不复用业务连接，
 * 避免 pub/sub 模式下的 Redis 客户端限制问题
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient!: Redis;
  private subClient!: Redis;
  private isConnected = false;

  constructor(
    app: INestApplication,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  static create(app: INestApplication): RedisIoAdapter {
    const configService = app.get(ConfigService);
    const redisUrl = configService.get<string>('APP_REDIS_URL')!;
    return new RedisIoAdapter(app, redisUrl);
  }

  /**
   * 初始化 Redis pub/sub 连接
   * 必须在 useWebSocketAdapter() 之前调用
   */
  async connectToRedis(): Promise<void> {
    const redisOptions = {
      maxRetriesPerRequest: 3,
      retryStrategy: redisReconnectDelay,
      lazyConnect: true,
    };

    this.pubClient = observeRedisConnection(
      new Redis(this.redisUrl, {
        ...redisOptions,
        connectionName: 'socketio-pub',
      }),
      'socketio-pub',
      this.logger,
    );
    this.subClient = observeRedisConnection(
      new Redis(this.redisUrl, {
        ...redisOptions,
        connectionName: 'socketio-sub',
      }),
      'socketio-sub',
      this.logger,
    );
    this.guardFireAndForgetPublish();

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.isConnected = true;
    this.logger.log('Redis IO adapter connected');
  }

  /**
   * `@socket.io/redis-adapter` 广播时以 fire-and-forget 方式调用 `pubClient.publish`，既不 await 也不 catch。
   * Redis 中断超过 `maxRetriesPerRequest` 的重试窗口（约 1s）后 publish 被拒绝，成为未处理的
   * Promise rejection，Node 默认据此退出进程。这里让 publish 失败时只记日志：
   * 本地投递不经过 Redis，本实例的客户端照常收到事件；中断期间发往其他实例的广播被丢弃，
   * 与 Socket.IO 至多一次的投递语义一致；断线期间短暂缓冲的命令在恢复后照常发出。
   */
  private guardFireAndForgetPublish(): void {
    const publish = this.pubClient.publish.bind(this.pubClient) as (
      channel: string | Buffer,
      message: string | Buffer,
    ) => Promise<number>;
    let dropped = 0;

    const guardedPublish = (
      channel: string | Buffer,
      message: string | Buffer,
    ): Promise<number> =>
      publish(channel, message).then(
        (receivers) => {
          if (dropped > 0) {
            this.logger.log(
              `Redis 已恢复，中断期间丢弃了 ${dropped} 条跨实例广播`,
            );
            dropped = 0;
          }
          return receivers;
        },
        (error: unknown) => {
          if (dropped === 0) {
            this.logger.warn(
              `跨实例广播发布失败，Redis 恢复前的跨实例广播将被丢弃（本实例客户端不受影响）: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          dropped += 1;
          return 0;
        },
      );
    this.pubClient.publish = guardedPublish as Redis['publish'];
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const server = super.createIOServer(port, {
      ...options,
      // 正式会话消息仍会走 Socket.IO，buffer ceiling 需要覆盖多附件 base64 负载。
      maxHttpBufferSize: Math.max(
        options?.maxHttpBufferSize ?? 0,
        MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES,
      ),
    }) as Server;

    if (this.isConnected) {
      server.adapter(createAdapter(this.pubClient, this.subClient));
      this.logger.log('Socket.IO Redis adapter attached');
    } else {
      this.logger.warn(
        'Redis not connected — Socket.IO running without Redis adapter (single-instance mode)',
      );
    }

    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);

    if (this.isConnected) {
      this.pubClient.disconnect();
      this.subClient.disconnect();
      this.isConnected = false;
      this.logger.log('Redis IO adapter disconnected');
    }
  }
}
