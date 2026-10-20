import type { ThrottlerStorage } from '@nestjs/throttler';
// 包根入口未导出该接口，类型从声明文件直接引入
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';

/**
 * 固定窗口计数，一次 EVAL 内完成判定与计数，并发请求之间原子。
 * - 判定只看「窗口内已放行次数」与本次传入的上限：调高或调低上限后，下一次请求立即按新上限判定，
 *   不存在独立于上限、要等到期才失效的阻断键（D-211、D-215）。
 * - 被拦截的请求不计数，所以 totalHits 是窗口内实际放行的次数，重试不会推迟恢复时间。
 * - 拦截持续到当前窗口结束，timeToBlockExpire 等于窗口剩余时间。
 */
const FIXED_WINDOW_SCRIPT = `
local hitKey = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', hitKey) or '0')
local blocked = 0
if current >= limit then
  blocked = 1
else
  current = redis.call('INCR', hitKey)
end
local pttl = redis.call('PTTL', hitKey)
if pttl < 0 then
  redis.call('PEXPIRE', hitKey, ttl)
  pttl = ttl
end
return { current, pttl, blocked }
`.trim();

export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  /**
   * 窗口长度由 ttl 决定；blockDuration 不参与计算：拦截总是持续到窗口结束
   * （全局节流器与各路由都没有配置独立的 blockDuration）。
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `{${key}:${throttlerName}}:hits`;
    const result = await this.redis.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      hitKey,
      ttl,
      limit,
    );

    if (
      !Array.isArray(result) ||
      result.length !== 3 ||
      !result.every((value) => typeof value === 'number')
    ) {
      throw new TypeError(
        `Unexpected throttler storage result: ${JSON.stringify(result)}`,
      );
    }

    const [totalHits, windowTtlMs, blocked] = result as [
      number,
      number,
      number,
    ];
    const timeToExpire = Math.ceil(windowTtlMs / 1000);
    const isBlocked = blocked === 1;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
