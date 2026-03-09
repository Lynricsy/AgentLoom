import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  organizations,
  organizationMembers,
} from '../../database/schema/organizations.schema';
import { RedisCacheService } from '../redis/redis-cache.service';
import { redisKey, RedisDomain } from '../redis/redis-key.util';
import { RedisPubSubService } from '../redis/redis-pubsub.service';
import { RBAC_CACHE_TTL } from '../redis/redis.constants';
import type { OrgRole } from '../types/org-role.type';

@Injectable()
export class RbacCacheService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cacheService: RedisCacheService,
    private readonly pubsubService: RedisPubSubService,
  ) {}

  private getCacheKey(tenantId: string, userId: string): string {
    return redisKey(tenantId, RedisDomain.RBAC, userId);
  }

  async getUserRole(tenantId: string, userId: string): Promise<OrgRole | null> {
    const cacheKey = this.getCacheKey(tenantId, userId);

    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached as OrgRole;

    const result = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(organizations.tenantId, tenantId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .limit(1);

    const role = result[0]?.role ?? null;

    if (role) {
      await this.cacheService.set(cacheKey, role, RBAC_CACHE_TTL);
    }

    return role;
  }

  async invalidateUserRole(tenantId: string, userId: string): Promise<void> {
    const cacheKey = this.getCacheKey(tenantId, userId);
    await this.cacheService.del(cacheKey);
    await this.pubsubService.publish(cacheKey);
  }
}
