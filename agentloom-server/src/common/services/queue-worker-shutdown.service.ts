import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { collectQueueWorkers } from './queue-workers.util';

/**
 * 进程收到 SIGTERM 等关闭信号时，先停掉全部 BullMQ worker：不再拉取新任务，等进行中的任务跑完。
 *
 * BullModule 自己在 onApplicationShutdown 才关 worker，那时数据库连接池等全局模块已在
 * onModuleDestroy 中关闭，进行中的任务会失败、留到 stalled 检查后被别的进程整轮重跑。
 * 本服务注册在根模块：Nest 按模块距离由近到远调用 onModuleDestroy，根模块最先执行，
 * 全局模块（数据库、Redis）最后，因此任务结束前依赖仍可用。
 * 超过部署的停止宽限期仍未结束的任务随进程被强杀，由 stalled 检查转交其他进程。
 */
@Injectable()
export class QueueWorkerShutdownService
  implements OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(QueueWorkerShutdownService.name);

  constructor(private readonly discoveryService: DiscoveryService) {}

  async onModuleDestroy(): Promise<void> {
    const workers = collectQueueWorkers(this.discoveryService);
    if (workers.length === 0) {
      return;
    }

    const startedAt = Date.now();
    this.logger.log(
      `正在关闭 ${workers.length} 个队列 worker：停止拉取新任务，等待进行中的任务结束`,
    );
    await Promise.all(
      workers.map(async (worker) => {
        try {
          await worker.close();
        } catch (error) {
          this.logger.warn(
            `关闭队列 ${worker.name} 的 worker 失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
    this.logger.log(`队列 worker 已全部关闭，用时 ${Date.now() - startedAt}ms`);
  }

  onApplicationShutdown(signal?: string): void {
    this.logger.log(`进程已完成关闭${signal ? `（${signal}）` : ''}`);
  }
}
