import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Worker } from 'bullmq';

import type { BrowserRunnerEnvConfig } from '../../config/env.schema';
import {
  GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE,
  GeneratedAppBrowserAcceptanceJobSchema,
  GeneratedAppBrowserAcceptanceResultSchema,
  type GeneratedAppBrowserAcceptanceResult,
} from '../generated-app/types/browser-acceptance-job.schema';
import type { GeneratedAppBrowserAcceptanceExecutor } from '../generated-app/types/generation-v2.ports';

/** runner 进程中 {@link GeneratedAppBrowserAcceptanceExecutor} 的注入令牌（Playwright 实现） */
export const GENERATED_APP_BROWSER_ACCEPTANCE_EXECUTOR = Symbol(
  'GENERATED_APP_BROWSER_ACCEPTANCE_EXECUTOR',
);

/**
 * 消费 Gate 5 浏览器验收队列。任务数据与返回值都在边界按契约 schema 解析：任务格式不符时
 * 任务失败（worker 侧映射为 runner 不可用），返回值即 worker 等到的验收结果。
 */
@Injectable()
@Processor(GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE)
export class GeneratedAppBrowserAcceptanceProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    @Inject(GENERATED_APP_BROWSER_ACCEPTANCE_EXECUTOR)
    private readonly executor: GeneratedAppBrowserAcceptanceExecutor,
    private readonly configService: ConfigService<BrowserRunnerEnvConfig, true>,
  ) {
    super();
  }

  /** worker 由 BullModule 在 onModuleInit 创建，这里按 APP_GENERATED_APP_BROWSER_CONCURRENCY 调整并发 */
  onApplicationBootstrap(): void {
    let worker: Worker;
    try {
      worker = this.worker;
    } catch {
      return;
    }
    worker.concurrency = this.configService.get(
      'APP_GENERATED_APP_BROWSER_CONCURRENCY',
      { infer: true },
    );
  }

  async process(
    job: Job<unknown>,
  ): Promise<GeneratedAppBrowserAcceptanceResult> {
    const parsed = GeneratedAppBrowserAcceptanceJobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(
        `Gate 5 验收任务格式无效：${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('；')}`,
      );
    }
    const result = await this.executor.execute(parsed.data);
    return GeneratedAppBrowserAcceptanceResultSchema.parse(result);
  }
}
