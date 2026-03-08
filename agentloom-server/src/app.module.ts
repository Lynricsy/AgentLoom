import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
    HealthModule,
    AuthModule,
    OrganizationModule,
    ApiKeyModule,
    WorkflowDefinitionModule,
    LlmModule,
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
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
