import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { users } from '../../database/schema';
import { RedisCacheService } from '../redis/redis-cache.service';

/**
 * Supabase auth ID → public.users.id 解析器
 *
 * JWT sub 是 Supabase auth.users.id，但业务表 FK 指向 public.users.id。
 * AuthGuard 认证后调用此服务完成映射，使下游统一使用应用层 user ID。
 */

const IDENTITY_CACHE_PREFIX = 'user_identity:';
const IDENTITY_CACHE_TTL = 300;

@Injectable()
export class UserIdentityResolverService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly cacheService: RedisCacheService,
  ) {}

  async resolveAppUserId(supabaseUserId: string): Promise<string | null> {
    const cacheKey = `${IDENTITY_CACHE_PREFIX}${supabaseUserId}`;

    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const result = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.supabaseUserId, supabaseUserId))
      .limit(1);

    const appUserId = result[0]?.id ?? null;

    if (appUserId) {
      await this.cacheService.set(cacheKey, appUserId, IDENTITY_CACHE_TTL);
    }

    return appUserId;
  }

  async invalidateCache(supabaseUserId: string): Promise<void> {
    const cacheKey = `${IDENTITY_CACHE_PREFIX}${supabaseUserId}`;
    await this.cacheService.del(cacheKey);
  }
}
