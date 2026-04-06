import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server, type ServerOptions } from 'socket.io';
import Redis from 'ioredis';
import { MAX_CONVERSATION_TRANSPORT_PAYLOAD_BYTES } from '../../modules/agent-conversation/conversation-attachment';

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
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
      lazyConnect: true,
    };

    this.pubClient = new Redis(this.redisUrl, {
      ...redisOptions,
      connectionName: 'socketio-pub',
    });

    this.subClient = new Redis(this.redisUrl, {
      ...redisOptions,
      connectionName: 'socketio-sub',
    });

    this.pubClient.on('error', (err) => {
      this.logger.error(`Redis pub client error: ${err.message}`);
    });

    this.subClient.on('error', (err) => {
      this.logger.error(`Redis sub client error: ${err.message}`);
    });

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.isConnected = true;
    this.logger.log('Redis IO adapter connected');
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
