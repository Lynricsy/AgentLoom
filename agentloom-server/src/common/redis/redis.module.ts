import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisCacheService } from './redis-cache.service';
import { RedisPubSubService } from './redis-pubsub.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        return new Redis(configService.get<string>('APP_REDIS_URL')!, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => Math.min(times * 200, 2000),
        });
      },
      inject: [ConfigService],
    },
    RedisCacheService,
    RedisPubSubService,
  ],
  exports: [REDIS_CLIENT, RedisCacheService, RedisPubSubService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    private readonly cacheService: RedisCacheService,
    private readonly pubsubService: RedisPubSubService,
  ) {}

  async onModuleDestroy() {
    await this.cacheService.onModuleDestroy();
    await this.pubsubService.onModuleDestroy();
  }
}
