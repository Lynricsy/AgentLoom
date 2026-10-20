import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueEvents, type Queue } from 'bullmq';

import type { EnvConfig } from '../../config/env.schema';
import { GeneratedAppRepository } from './generated-app.repository';
import {
  GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE,
  GeneratedAppBrowserAcceptanceJobSchema,
  GeneratedAppBrowserAcceptanceResultSchema,
  type GeneratedAppBrowserAcceptanceJob,
  type GeneratedAppBrowserAcceptanceResult,
} from './types/browser-acceptance-job.schema';
import type { GeneratedAppRepositoryV2Additions } from './types/generation-v2.ports';

/** worker 等待 runner 回传结果时，在任务总超时之外多等的时间（排队、上传证据） */
export const GENERATED_APP_BROWSER_WAIT_GRACE_MS = 30_000;
/** 验收令牌 TTL 在任务总超时之外的余量：令牌要比等待更晚失效 */
export const GENERATED_APP_BROWSER_TOKEN_GRACE_MS = 60_000;

export interface GeneratedAppBrowserAcceptanceRequest {
  tenantId: string;
  appId: string;
  generationRunId: string;
  viewports: GeneratedAppBrowserAcceptanceJob['viewports'];
  scenarios: GeneratedAppBrowserAcceptanceJob['scenarios'];
}

/**
 * worker 侧一次 Gate 5 投递的结局。runner 返回了结果（无论通过与否）才是 `completed`；
 * 其余三种都表示没有拿到可信的浏览器执行结果。`jobId` 为已投递的队列任务 id。
 */
export type GeneratedAppBrowserAcceptanceOutcome =
  | {
      kind: 'completed';
      jobId: string;
      result: GeneratedAppBrowserAcceptanceResult;
    }
  /** 队列没有在线 runner，任务未投递 */
  | { kind: 'runner-unavailable'; message: string }
  /** 在总超时 + 余量内没有等到结果，或运行级截止（signal）先到 */
  | {
      kind: 'runner-timeout';
      jobId: string | null;
      message: string;
      waitedMs: number;
    }
  /** runner 处理失败（任务被判失败、返回值不符合契约、同一运行的旧任务仍未结束） */
  | { kind: 'runner-failed'; jobId: string | null; message: string };

type AcceptanceTokenStore = Pick<
  GeneratedAppRepositoryV2Additions,
  'issueAcceptanceToken' | 'revokeAcceptanceToken'
>;

export function buildGate5ArtifactPrefix(
  tenantId: string,
  appId: string,
  generationRunId: string,
): string {
  return `tenants/${tenantId}/generated-apps/${appId}/runs/${generationRunId}/gate-5`;
}

/**
 * worker 侧 Gate 5 投递：确认有在线 runner → 签发验收令牌 → 投递任务（jobId `gate5-<runId>`）
 * → 等待 runner 返回值 → 撤销令牌。调用方不得持有数据库事务：等待可达十几分钟，令牌签发与撤销
 * 各自开租户事务。
 */
@Injectable()
export class GeneratedAppBrowserAcceptanceDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(
    GeneratedAppBrowserAcceptanceDispatcher.name,
  );
  private queueEvents: QueueEvents | null = null;

  constructor(
    @InjectQueue(GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE)
    private readonly queue: Queue,
    @Inject(GeneratedAppRepository)
    private readonly tokenStore: AcceptanceTokenStore,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async dispatch(
    request: GeneratedAppBrowserAcceptanceRequest,
    signal: AbortSignal,
  ): Promise<GeneratedAppBrowserAcceptanceOutcome> {
    const workers = await this.queue.getWorkers();
    if (workers.length === 0) {
      return {
        kind: 'runner-unavailable',
        message: `队列 ${GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE} 没有在线的 browser-runner，Gate 5 未执行。`,
      };
    }

    const scenarioTimeoutMs = this.configService.get(
      'APP_GENERATED_APP_BROWSER_SCENARIO_TIMEOUT_MS',
      { infer: true },
    );
    const totalTimeoutMs = this.configService.get(
      'APP_GENERATED_APP_BROWSER_TOTAL_TIMEOUT_MS',
      { infer: true },
    );
    const jobId = `gate5-${request.generationRunId}`;
    const waitMs = totalTimeoutMs + GENERATED_APP_BROWSER_WAIT_GRACE_MS;

    // 同一运行修复后重跑 Gate 5 时沿用 jobId：已结束的旧任务先删掉，否则 add 会被去重成旧任务
    const previous = await this.queue.getJob(jobId);
    if (previous) {
      const state = await previous.getState();
      if (state !== 'completed' && state !== 'failed') {
        return {
          kind: 'runner-failed',
          jobId: null,
          message: `同一运行的上一个 Gate 5 任务仍处于 ${state} 状态，未重复投递。`,
        };
      }
      await previous.remove();
    }
    if (signal.aborted) {
      return {
        kind: 'runner-timeout',
        jobId: null,
        message: '生成运行已到截止时间，Gate 5 未投递。',
        waitedMs: 0,
      };
    }

    const { token } = await this.tokenStore.issueAcceptanceToken({
      tenantId: request.tenantId,
      appId: request.appId,
      generationRunId: request.generationRunId,
      ttlMs: totalTimeoutMs + GENERATED_APP_BROWSER_TOKEN_GRACE_MS,
    });
    const startedAt = Date.now();
    let removeAbortListener = () => {};
    try {
      const job = GeneratedAppBrowserAcceptanceJobSchema.parse({
        jobVersion: 1,
        tenantId: request.tenantId,
        appId: request.appId,
        generationRunId: request.generationRunId,
        acceptanceToken: token,
        viewports: request.viewports,
        scenarios: request.scenarios,
        limits: { scenarioTimeoutMs, totalTimeoutMs },
        artifactPrefix: buildGate5ArtifactPrefix(
          request.tenantId,
          request.appId,
          request.generationRunId,
        ),
      });

      const queued = await this.queue.add('gate-5-browser-acceptance', job, {
        jobId,
        attempts: 1,
        // 保留一段时间供 waitUntilFinished 读取已结束的任务；任务数据里的令牌在等待结束后即被撤销
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 86_400, count: 200 },
      });

      const aborted = new Promise<{ kind: 'aborted' }>((resolve) => {
        const onAbort = () => resolve({ kind: 'aborted' });
        signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () =>
          signal.removeEventListener('abort', onAbort);
        if (signal.aborted) {
          onAbort();
        }
      });
      const finished = queued
        .waitUntilFinished(await this.getQueueEvents(), waitMs)
        .then(
          (value: unknown) => ({ kind: 'returned' as const, value }),
          (error: unknown) => ({ kind: 'rejected' as const, error }),
        );
      const settled = await Promise.race([finished, aborted]);
      const waitedMs = Date.now() - startedAt;

      if (settled.kind === 'aborted') {
        // 等待中的任务直接删除；已在执行的任务删不掉，令牌随后撤销，runner 打开的页面会立即失效
        await queued.remove().catch(() => undefined);
        return {
          kind: 'runner-timeout',
          jobId,
          message: '生成运行已到截止时间，Gate 5 等待被取消。',
          waitedMs,
        };
      }
      if (settled.kind === 'rejected') {
        if (waitedMs >= waitMs) {
          await queued.remove().catch(() => undefined);
          return {
            kind: 'runner-timeout',
            jobId,
            message: `browser-runner 未在 ${waitMs}ms 内回传 Gate 5 结果。`,
            waitedMs,
          };
        }
        return {
          kind: 'runner-failed',
          jobId,
          message: `browser-runner 处理 Gate 5 任务失败：${
            settled.error instanceof Error
              ? settled.error.message
              : String(settled.error)
          }`,
        };
      }

      const parsed = GeneratedAppBrowserAcceptanceResultSchema.safeParse(
        settled.value,
      );
      if (!parsed.success) {
        return {
          kind: 'runner-failed',
          jobId,
          message: 'browser-runner 回传的 Gate 5 结果不符合契约。',
        };
      }
      return { kind: 'completed', jobId, result: parsed.data };
    } finally {
      removeAbortListener();
      await this.tokenStore
        .revokeAcceptanceToken(request.tenantId, request.appId)
        .catch((error: unknown) => {
          // 撤销失败时令牌仍会按 TTL 过期
          this.logger.warn(
            `撤销应用 ${request.appId} 的 Gate 5 验收令牌失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
    this.queueEvents = null;
  }

  /** QueueEvents 需要独占一条阻塞连接，只在第一次投递时创建 */
  private async getQueueEvents(): Promise<QueueEvents> {
    if (!this.queueEvents) {
      this.queueEvents = new QueueEvents(
        GENERATED_APP_BROWSER_ACCEPTANCE_QUEUE,
        {
          connection: this.queue.opts.connection,
          prefix: this.queue.opts.prefix,
        },
      );
      await this.queueEvents.waitUntilReady();
    }
    return this.queueEvents;
  }
}
