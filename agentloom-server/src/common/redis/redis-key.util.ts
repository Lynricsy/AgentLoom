export enum RedisDomain {
  PERMISSIONS = 'permissions',
  CACHE = 'cache',
  SESSION = 'session',
  RATE_LIMIT = 'rate_limit',
  RBAC = 'rbac',
}

export function redisKey(
  tenantId: string,
  domain: RedisDomain | string,
  entityId: string,
): string {
  return `${tenantId}:${domain}:${entityId}`;
}
