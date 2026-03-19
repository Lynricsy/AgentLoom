import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnModuleDestroy,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { TokenBlacklistModule } from './common/services/token-blacklist.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { WorkflowDefinitionModule } from './modules/workflow-definition/workflow-definition.module';
import { LlmModule } from './modules/llm/llm.module';
import { AgentModule } from './modules/agent/agent.module';
import { McpModule } from './modules/mcp/mcp.module';
import { StorageModule } from './infrastructure/storage';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { NotificationModule } from './modules/notification/notification.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { TemplateModule } from './modules/template/template.module';
import { ReusableBlockModule } from './modules/reusable-block/reusable-block.module';
import { TenantKeyModule } from './modules/tenant-key/tenant-key.module';
import { TriggerModule } from './modules/trigger/trigger.module';
import { InterventionPolicyModule } from './modules/intervention-policy/intervention-policy.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { ShareModule } from './modules/share/share.module';
import { PlatformApiTokenModule } from './modules/platform-api-token/platform-api-token.module';
import { PluginModule } from './modules/plugin/plugin.module';
import { SmartRoutingModule } from './modules/smart-routing/smart-routing.module';
import { ExecutionRecordModule } from './modules/execution-record/execution-record.module';
import { OptimizationSuggestionModule } from './modules/optimization-suggestion/optimization-suggestion.module';
import { ResourceGovernanceModule } from './modules/resource-governance/resource-governance.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { PrivateDeploymentModule } from './modules/private-deployment/private-deployment.module';
import { AcpGatewayModule } from './modules/acp-gateway/acp-gateway.module';
import { AuthGuard } from './common/guards/auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantTransactionInterceptor } from './common/interceptors/tenant-transaction.interceptor';
import { RbacCacheService } from './common/services/rbac-cache.service';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { safeQuitRedis } from './common/redis/redis-shutdown.util';

let throttlerRedisClient: Redis | null = null;

function createThrottlerOptions(configService: ConfigService) {
  throttlerRedisClient = new Redis(configService.get<string>('APP_REDIS_URL')!);

  return {
    throttlers: [
      { name: 'default', ttl: 60_000, limit: 100 },
    ],
    storage: new ThrottlerStorageRedisService(throttlerRedisClient),
  };
}

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    TokenBlacklistModule,
    RedisModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: createThrottlerOptions,
      inject: [ConfigService],
    }),
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
    HealthModule,
    AuthModule,
    OrganizationModule,
    ApiKeyModule,
    WorkflowDefinitionModule,
    LlmModule,
    AgentModule,
    McpModule,
    StorageModule,
    KnowledgeModule,
    ExecutionModule,
    NotificationModule,
    EvidenceModule,
    TemplateModule,
    ReusableBlockModule,
    TenantKeyModule,
    TriggerModule,
    InterventionPolicyModule,
    MarketplaceModule,
    ShareModule,
    PlatformApiTokenModule,
    PluginModule,
    SmartRoutingModule,
    ExecutionRecordModule,
    OptimizationSuggestionModule,
    ResourceGovernanceModule,
    MonitoringModule,
    PrivateDeploymentModule,
    AcpGatewayModule,
  ],
  providers: [
    RbacCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantTransactionInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule, OnModuleDestroy {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'templates', method: RequestMethod.ALL },
        { path: 'templates/{*splat}', method: RequestMethod.ALL },
        { path: 'marketplace/browse', method: RequestMethod.ALL },
        { path: 'marketplace/browse/{*splat}', method: RequestMethod.ALL },
        { path: 's', method: RequestMethod.ALL },
        { path: 's/{*splat}', method: RequestMethod.ALL },
        { path: 'webhooks', method: RequestMethod.ALL },
        { path: 'webhooks/{*splat}', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }

  async onModuleDestroy() {
    if (!throttlerRedisClient) {
      return;
    }

    const redisClient = throttlerRedisClient;
    throttlerRedisClient = null;
    await safeQuitRedis(redisClient);
  }
}
