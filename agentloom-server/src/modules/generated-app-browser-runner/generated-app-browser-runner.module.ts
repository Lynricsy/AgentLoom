import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';

import { toBullMqConnectionOptions } from '../../common/redis/redis-connection.util';
import { QueueWorkerShutdownService } from '../../common/services/queue-worker-shutdown.service';
import {
  browserRunnerEnvSchema,
  type BrowserRunnerEnvConfig,
} from '../../config/env.schema';
import { StorageModule, StorageService } from '../../infrastructure/storage';
import { GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE } from '../generated-app/types/browser-acceptance-job.schema';
import {
  GENERATED_APP_BROWSER_ACCEPTANCE_EXECUTOR,
  GeneratedAppBrowserAcceptanceProcessor,
} from './generated-app-browser-acceptance.processor';
import { PlaywrightBrowserAcceptanceExecutor } from './playwright-browser-acceptance.executor';

/**
 * browser-runner 进程的根模块（入口 `generated-app-browser-runner.main.ts`）：只装配配置、
 * BullMQ 连接、对象存储与验收队列消费者，不连数据库，也不加载任何业务模块。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        const result = browserRunnerEnvSchema.safeParse(config);
        if (!result.success) {
          const formatted = result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
          throw new Error(`环境变量验证失败:\n${formatted}`);
        }
        return result.data;
      },
    }),
    DiscoveryModule,
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: toBullMqConnectionOptions(
          configService.getOrThrow<string>('APP_REDIS_URL'),
        ),
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE }),
    StorageModule,
  ],
  providers: [
    {
      provide: GENERATED_APP_BROWSER_ACCEPTANCE_EXECUTOR,
      useFactory: (
        storage: StorageService,
        configService: ConfigService<BrowserRunnerEnvConfig, true>,
      ) =>
        new PlaywrightBrowserAcceptanceExecutor({
          storage,
          baseUrl: configService.get('APP_GENERATED_APP_BROWSER_BASE_URL', {
            infer: true,
          }),
        }),
      inject: [StorageService, ConfigService],
    },
    GeneratedAppBrowserAcceptanceProcessor,
    // SIGTERM 时先停止拉取任务并等进行中的验收结束，再关闭 Redis 与存储连接
    QueueWorkerShutdownService,
  ],
})
export class GeneratedAppBrowserRunnerModule {}
