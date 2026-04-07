import { Module } from '@nestjs/common';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../../config/config.module';
import { RedisModule } from '../../common/redis/redis.module';
import { DatabaseModule } from '../../database/database.module';
import { AgentModule } from '../agent/agent.module';
import { LlmModule } from '../llm/llm.module';
import { AcpGatewayModule } from './acp-gateway.module';
import { ACP_TEST_RUNTIME_PROVIDER } from './testing/acp-test-runtime';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    DatabaseModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('APP_REDIS_URL')!;
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            password: url.password || undefined,
            db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
          },
        };
      },
      inject: [ConfigService],
    }),
    LlmModule,
    AgentModule,
    AcpGatewayModule,
  ],
  providers: [
    ACP_TEST_RUNTIME_PROVIDER,
    {
      provide: BullRegistrar,
      useValue: {
        register: () => undefined,
        onModuleInit: () => undefined,
      },
    },
  ],
})
export class AcpStdioModule {}
