import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

/**
 * 合并后的输出块。
 * 同一 stepId 在 merge window 内的多个 chunk 会被合并为一条。
 */
export interface MergedOutputChunk {
  readonly stepId: string;
  readonly chunk: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

export type FlushCallback = (
  executionId: string,
  merged: MergedOutputChunk[],
) => void;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface PendingChunk {
  chunks: string[];
  startIndex: number;
  endIndex: number;
}

/**
 * 事件节流服务。
 *
 * 背压策略：
 * 1. Token Bucket — 每个执行实例 100 events/s 限流
 * 2. Merge Window — 同一 stepId 的 output_chunk 在 50ms 窗口内合并
 *
 * 非 output_chunk 事件直接通过 token bucket 判断是否可发送；
 * output_chunk 事件先缓冲，50ms 后合并发送（合并后的结果也消耗 token）。
 */
@Injectable()
export class ThrottleService implements OnModuleDestroy {
  private readonly logger = new Logger(ThrottleService.name);

  static readonly RATE_LIMIT = 100;
  static readonly MERGE_WINDOW_MS = 50;

  private readonly buckets = new Map<string, TokenBucket>();
  /** executionId -> stepId -> PendingChunk */
  private readonly pendingChunks = new Map<string, Map<string, PendingChunk>>();
  private readonly flushTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private flushHandler: FlushCallback | null = null;

  /**
   * 注册合并回调。
   * 当 50ms 窗口到期后，ThrottleService 会调用此回调通知调用方发送合并后的事件。
   * 通常由 ExecutionGateway 在初始化时注册一次。
   */
  registerFlushHandler(handler: FlushCallback): void {
    this.flushHandler = handler;
  }

  /**
   * 令牌桶：尝试消耗 1 个令牌。
   * 根据距离上次补充的时间差按比例补充令牌，最大不超过 RATE_LIMIT。
   *
   * @returns true 如果令牌可用（已消耗），false 如果被限流
   */
  tryConsume(executionId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(executionId);

    if (!bucket) {
      bucket = { tokens: ThrottleService.RATE_LIMIT, lastRefill: now };
      this.buckets.set(executionId, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      const refill = Math.floor((elapsed / 1000) * ThrottleService.RATE_LIMIT);
      if (refill > 0) {
        bucket.tokens = Math.min(
          ThrottleService.RATE_LIMIT,
          bucket.tokens + refill,
        );
        bucket.lastRefill = now;
      }
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    this.logger.warn(`执行 ${executionId} 触发限流，令牌已耗尽`);
    return false;
  }

  /**
   * 缓冲一个 output_chunk。
   * 如果该执行实例没有运行中的合并定时器，则启动 50ms 定时器。
   */
  bufferOutputChunk(
    executionId: string,
    stepId: string,
    chunk: string,
    index: number,
  ): void {
    let execChunks = this.pendingChunks.get(executionId);
    if (!execChunks) {
      execChunks = new Map();
      this.pendingChunks.set(executionId, execChunks);
    }

    let pending = execChunks.get(stepId);
    if (!pending) {
      pending = { chunks: [], startIndex: index, endIndex: index };
      execChunks.set(stepId, pending);
    }

    pending.chunks.push(chunk);
    pending.endIndex = index;

    if (!this.flushTimers.has(executionId)) {
      const timer = setTimeout(() => {
        this.flushTimers.delete(executionId);
        this.doFlush(executionId);
      }, ThrottleService.MERGE_WINDOW_MS);
      this.flushTimers.set(executionId, timer);
    }
  }

  /**
   * 强制立即刷新所有待合并的块。
   * 适用于执行结束时确保所有内容都已发送。
   */
  forceFlush(executionId: string): MergedOutputChunk[] {
    const timer = this.flushTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(executionId);
    }

    return this.collectMerged(executionId);
  }

  /**
   * 检查是否有待合并的块。
   */
  hasPending(executionId: string): boolean {
    const execChunks = this.pendingChunks.get(executionId);
    return !!execChunks && execChunks.size > 0;
  }

  /**
   * 清理指定执行实例的所有节流状态。
   * 在执行到达终态后调用以释放内存。
   */
  clearExecution(executionId: string, tenantId?: string): void {
    this.buckets.delete(executionId);
    this.clearPendingState(executionId);

    if (tenantId) {
      this.clearPendingState(`${tenantId}:${executionId}`);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    this.flushTimers.clear();
    this.buckets.clear();
    this.pendingChunks.clear();
    this.flushHandler = null;
  }

  private doFlush(executionId: string): void {
    const merged = this.collectMerged(executionId);
    if (merged.length > 0 && this.flushHandler) {
      this.flushHandler(executionId, merged);
    }
  }

  private collectMerged(executionId: string): MergedOutputChunk[] {
    const execChunks = this.pendingChunks.get(executionId);
    if (!execChunks || execChunks.size === 0) return [];

    const result: MergedOutputChunk[] = [];
    for (const [stepId, pending] of execChunks) {
      result.push({
        stepId,
        chunk: pending.chunks.join(''),
        startIndex: pending.startIndex,
        endIndex: pending.endIndex,
      });
    }

    execChunks.clear();
    return result;
  }

  private clearPendingState(executionId: string): void {
    this.pendingChunks.delete(executionId);
    const timer = this.flushTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(executionId);
    }
  }
}
