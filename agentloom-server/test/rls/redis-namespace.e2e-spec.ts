import { describe, expect, it } from 'vitest';
import { RedisTTL } from '../../src/common/redis/redis.constants';
import { RedisDomain, redisKey } from '../../src/common/redis/redis-key.util';

const TENANT_ONE_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_TWO_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

describe('Redis namespace isolation', () => {
  it('tenant + domain + entity 组合出预期 key', () => {
    expect(redisKey(TENANT_ONE_ID, RedisDomain.RBAC, USER_ID)).toBe(
      `${TENANT_ONE_ID}:rbac:${USER_ID}`,
    );
  });

  it('相同实体在不同 tenant 下 key 不同', () => {
    expect(redisKey(TENANT_ONE_ID, RedisDomain.RBAC, USER_ID)).not.toBe(
      redisKey(TENANT_TWO_ID, RedisDomain.RBAC, USER_ID),
    );
  });

  it('相同实体在不同 domain 下 key 不同', () => {
    expect(redisKey(TENANT_ONE_ID, RedisDomain.CACHE, USER_ID)).not.toBe(
      redisKey(TENANT_ONE_ID, RedisDomain.SESSION, USER_ID),
    );
  });

  it('RedisTTL 常量保持预期值', () => {
    expect(RedisTTL.PERMISSIONS).toBe(900);
    expect(RedisTTL.CACHE).toBe(3600);
    expect(RedisTTL.SESSION).toBe(86400);
  });
});
