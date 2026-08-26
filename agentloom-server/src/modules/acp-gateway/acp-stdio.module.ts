import { Module } from '@nestjs/common';
import { BullModule, BullRegistrar } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../../config/config.module';
import { RedisModule } from '../../common/redis/redis.module';
import { TokenBlacklistModule } from '../../common/services/token-blacklist.module';
import { UserIdentityResolverModule } from '../../common/services/user-identity-resolver.module';
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
    // WsJwtGuard/AuthGuard 依赖的两个 @Global() 模块必须由入口模块图注册:
    // @Global() 只在模块出现在图中时生效,HTTP 入口靠 AppModule 引入,
    // stdio 入口必须自己引入,否则 KnowledgeModule 等模块的 guard 无法解析。
    TokenBlacklistModule,
    UserIdentityResolverModule,
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
