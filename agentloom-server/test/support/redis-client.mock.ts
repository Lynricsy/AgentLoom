import { type Mock, vi } from 'vitest';

/**
 * `REDIS_CLIENT` 派生连接（`redis.duplicate()`）的替身。
 *
 * 启动与运行路径会从 `REDIS_CLIENT` 派生独立连接：
 * - `AgentExecutionService.onModuleInit` 派生订阅连接并 `subscribe` 取消/通知频道，
 *   `onModuleDestroy` 时 `unsubscribe` + `quit`；
 * - `AgentApiEventStreamService` 派生阻塞读连接（`client('ID')` + `xread`）。
 */
export interface MockRedisDuplicate {
  connect: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
  on: Mock;
  client: Mock;
  xread: Mock;
  quit: Mock;
  disconnect: Mock;
}

/** e2e 中覆盖 `REDIS_CLIENT` provider 的替身。 */
export interface MockRedisClient {
  get: Mock;
  set: Mock;
  del: Mock;
  keys: Mock;
  publish: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
  on: Mock;
  connect: Mock;
  disconnect: Mock;
  quit: Mock;
  ping: Mock;
  duplicate: Mock<() => MockRedisDuplicate>;
}

export function createMockRedisDuplicate(): MockRedisDuplicate {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnThis(),
    client: vi.fn().mockResolvedValue(1),
    xread: vi.fn().mockResolvedValue(null),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
  };
}

/**
 * e2e 共享的 `REDIS_CLIENT` 工厂，每次调用返回独立实例。
 *
 * 只提供默认返回值；各 spec 需要的特定行为（例如 `set` 的 NX 语义）
 * 在 spec 内对返回对象的 `vi.fn()` 继续打桩。
 */
export function createMockRedisClient(): MockRedisClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    keys: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnThis(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
    duplicate: vi.fn(createMockRedisDuplicate),
  };
}
