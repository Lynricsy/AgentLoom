export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const CACHE_INVALIDATION_CHANNEL = '__cache_invalidation__';

export const RBAC_CACHE_TTL = 900; // 15 分钟

export const RedisTTL = {
  PERMISSIONS: 900,
  CACHE: 3600,
  SESSION: 86400,
  RATE_LIMIT: 60,
} as const satisfies Record<string, number>;
