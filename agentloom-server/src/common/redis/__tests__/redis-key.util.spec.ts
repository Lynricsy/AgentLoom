import { describe, expect, it } from 'vitest';
import { redisKey, RedisDomain } from '../redis-key.util';

describe('redisKey', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const entityId = 'user-123';

  it('should format key with RedisDomain enum', () => {
    expect(redisKey(tenantId, RedisDomain.PERMISSIONS, entityId)).toBe(
      `${tenantId}:permissions:${entityId}`,
    );
  });

  it('should format key with string domain', () => {
    expect(redisKey(tenantId, 'custom', entityId)).toBe(
      `${tenantId}:custom:${entityId}`,
    );
  });

  it('should produce correct keys for all domains', () => {
    const domains = [
      [RedisDomain.PERMISSIONS, 'permissions'],
      [RedisDomain.CACHE, 'cache'],
      [RedisDomain.SESSION, 'session'],
      [RedisDomain.RATE_LIMIT, 'rate_limit'],
      [RedisDomain.RBAC, 'rbac'],
    ] as const;

    for (const [domain, expected] of domains) {
      expect(redisKey(tenantId, domain, entityId)).toBe(
        `${tenantId}:${expected}:${entityId}`,
      );
    }
  });

  it('should isolate keys between tenants', () => {
    const tenantA = 'aaaa-aaaa';
    const tenantB = 'bbbb-bbbb';

    expect(redisKey(tenantA, RedisDomain.RBAC, entityId)).not.toBe(
      redisKey(tenantB, RedisDomain.RBAC, entityId),
    );
  });

  it('should isolate keys between domains', () => {
    expect(redisKey(tenantId, RedisDomain.CACHE, entityId)).not.toBe(
      redisKey(tenantId, RedisDomain.SESSION, entityId),
    );
  });
});
