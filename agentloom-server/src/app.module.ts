import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { TriggerModule } from './modules/trigger/trigger.module';
import { AuthGuard } from './common/guards/auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { TenantTransactionInterceptor } from './common/interceptors/tenant-transaction.interceptor';
import { RbacCacheService } from './common/services/rbac-cache.service';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    TokenBlacklistModule,
    RedisModule,
    EventEmitterModule.forRoot(),
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
    TriggerModule,
  ],
  providers: [
    RbacCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantTransactionInterceptor,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'templates', method: RequestMethod.ALL },
        { path: 'templates/{*splat}', method: RequestMethod.ALL },
        { path: 'webhooks', method: RequestMethod.ALL },
        { path: 'webhooks/{*splat}', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
