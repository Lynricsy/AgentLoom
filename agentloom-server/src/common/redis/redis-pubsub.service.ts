import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CACHE_INVALIDATION_CHANNEL, REDIS_CLIENT } from './redis.constants';
import { RedisCacheService } from './redis-cache.service';

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private subscriber: Redis;

  constructor(
    @Inject(REDIS_CLIENT) private readonly publisher: Redis,
    private readonly configService: ConfigService,
    private readonly cacheService: RedisCacheService,
  ) {
    this.subscriber = new Redis(
      this.configService.get<string>('APP_REDIS_URL')!,
      {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 200, 2000),
      },
    );
  }

  async onModuleInit() {
    await this.subscriber.subscribe(CACHE_INVALIDATION_CHANNEL);

    this.subscriber.on('message', async (channel: string, message: string) => {
      if (channel === CACHE_INVALIDATION_CHANNEL) {
        try {
          const { key } = JSON.parse(message) as { key: string };
          await this.cacheService.del(key);
        } catch (error) {
          this.logger.error('缓存失效处理失败', error);
        }
      }
    });
  }

  async publish(key: string): Promise<void> {
    await this.publisher.publish(
      CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ key }),
    );
  }

  async onModuleDestroy() {
    await this.subscriber.unsubscribe(CACHE_INVALIDATION_CHANNEL);
    await this.subscriber.quit();
  }
}
