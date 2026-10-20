import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, type Worker } from 'bullmq';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import {
  GENERATED_APP_GENERATION_QUEUE,
  type GeneratedAppGenerationJobData,
} from './generated-app-generation.constants';
import { GeneratedAppGenerationPipelineService } from './generated-app-generation-pipeline.service';
import { GeneratedAppRepository } from './generated-app.repository';

/** 消费生成运行队列；并发由 APP_GENERATED_APP_GENERATION_CONCURRENCY 控制（默认 2） */
@Injectable()
@Processor(GENERATED_APP_GENERATION_QUEUE)
export class GeneratedAppGenerationWorker
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(GeneratedAppGenerationWorker.name);

  constructor(
    private readonly pipeline: GeneratedAppGenerationPipelineService,
    private readonly repository: GeneratedAppRepository,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    const concurrency = this.configService.get<number>(
      'APP_GENERATED_APP_GENERATION_CONCURRENCY',
    );
    if (!concurrency) return;
    let worker: Worker;
    try {
      worker = this.worker;
    } catch {
      // e2e 与 ACP stdio 入口替换了 BullRegistrar，worker 不会创建
      return;
    }
    worker.concurrency = concurrency;
  }

  async process(job: Job<GeneratedAppGenerationJobData>): Promise<void> {
    await this.pipeline.executeRun(job.data);
  }

  /** 进程崩溃导致 stalled 超限、或 process 抛错时，运行不能停在 running */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<GeneratedAppGenerationJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const { tenantId, appId, generationRunId } = job.data;
    this.logger.error(
      `生成运行 ${generationRunId} 的 job 失败：${error.message}`,
    );
    await runInTenantTransaction(this.repository.globalDb, tenantId, () =>
      this.pipeline.markRunFailedIfActive(
        tenantId,
        appId,
        generationRunId,
        `生成运行 job 异常终止：${error.message}`.slice(0, 4000),
      ),
    );
  }
}
