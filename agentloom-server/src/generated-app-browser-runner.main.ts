import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE } from './modules/generated-app/types/browser-acceptance-job.schema';
import { GeneratedAppBrowserRunnerModule } from './modules/generated-app-browser-runner/generated-app-browser-runner.module';

/**
 * Gate 5 browser-runner 入口（ADR-0007 §6）：独立容器中只消费
 * `generated-app-browser-acceptance` 队列，用 Playwright Chromium 打开 Studio 公开页执行验收。
 * 不监听 HTTP 端口，不连接数据库。
 */
async function bootstrap() {
  const logger = new Logger('GeneratedAppBrowserRunner');
  const app = await NestFactory.createApplicationContext(
    GeneratedAppBrowserRunnerModule,
  );
  // SIGTERM/SIGINT 时按生命周期钩子关闭：先停队列 worker 并等进行中的验收结束
  app.enableShutdownHooks();
  logger.log(
    `browser-runner 已启动，消费队列 ${GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE}`,
  );
}
void bootstrap();
