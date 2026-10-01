import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  agentApiKeys,
  agentDefinitions,
  type AgentApiKey,
} from '../../database/schema';
import { AgentNotFoundException } from '../agent-definition/agent-definition.exceptions';
import {
  AgentApiKeyInvalidException,
  AgentApiKeyLimitExceededException,
  AgentApiKeyNotFoundException,
} from './agent-api.exceptions';
import {
  AGENT_API_KEY_PREFIX,
  type AgentApiKeyContext,
} from './agent-api.types';
import type {
  AgentApiKeyListResponse,
  AgentApiKeyResponse,
  AgentApiKeyWithSecret,
} from './dto/agent-api-key-response.dto';
import type { CreateAgentApiKeyDto } from './dto/create-agent-api-key.dto';
import type { QueryAgentApiKeyDto } from './dto/query-agent-api-key.dto';

export const MAX_ACTIVE_AGENT_API_KEYS_PER_AGENT = 20;

const KEY_SECRET_BYTES = 32;
/** `alak_` + 8 位 hex */
const KEY_PREFIX_LENGTH = AGENT_API_KEY_PREFIX.length + 8;
const RAW_KEY_PATTERN = /^alak_[0-9a-f]{64}$/;
/** last_used_at 只是展示用途，同一 Key 一分钟内最多写一次，避免每个请求都写库 */
const LAST_USED_AT_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class AgentApiKeyService {
  private readonly logger = new Logger(AgentApiKeyService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(
    tenantId: string,
    agentDefinitionId: string,
    userId: string,
    dto: CreateAgentApiKeyDto,
  ): Promise<AgentApiKeyWithSecret> {
    // 管理接口在请求租户事务内执行，受 RLS 约束
    const tenantDb = getTenantDb(this.db);

    // 锁住 Agent 行，使同一 Agent 的并发创建串行化，上限检查才不会被并发穿透；
    // NO KEY UPDATE 不阻塞外键插入（FOR KEY SHARE）。
    const [agent] = await tenantDb
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(
        and(
          eq(agentDefinitions.id, agentDefinitionId),
          eq(agentDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1)
      .for('no key update');

    if (!agent) {
      throw new AgentNotFoundException(agentDefinitionId);
    }

    const [activeKeys] = await tenantDb
      .select({ count: count() })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentDefinitionId, agentDefinitionId),
          isNull(agentApiKeys.revokedAt),
        ),
      );

    if ((activeKeys?.count ?? 0) >= MAX_ACTIVE_AGENT_API_KEYS_PER_AGENT) {
      throw new AgentApiKeyLimitExceededException(
        MAX_ACTIVE_AGENT_API_KEYS_PER_AGENT,
      );
    }

    const rawKey = `${AGENT_API_KEY_PREFIX}${randomBytes(KEY_SECRET_BYTES).toString('hex')}`;

    const [created] = await tenantDb
      .insert(agentApiKeys)
      .values({
        tenantId,
        agentDefinitionId,
        name: dto.name,
        keyHash: createHash('sha256').update(rawKey).digest('hex'),
        keyPrefix: rawKey.slice(0, KEY_PREFIX_LENGTH),
        rateLimitPerMinute: dto.rate_limit_per_minute ?? null,
        maxConcurrentRuns: dto.max_concurrent_runs,
        expiresAt: dto.expires_at ? new Date(dto.expires_at) : null,
        createdBy: userId,
      })
      .returning();

    return { ...toResponse(created), key: rawKey };
  }

  async list(
    agentDefinitionId: string,
    query: QueryAgentApiKeyDto,
  ): Promise<AgentApiKeyListResponse> {
    const tenantDb = getTenantDb(this.db);
    await this.ensureAgentExists(agentDefinitionId);

    const { page, page_size: pageSize, status } = query;
    const conditions = [eq(agentApiKeys.agentDefinitionId, agentDefinitionId)];

    if (status === 'active') {
      conditions.push(isNull(agentApiKeys.revokedAt));
    } else if (status === 'revoked') {
      conditions.push(isNotNull(agentApiKeys.revokedAt));
    }

    const whereClause = and(...conditions);
    const [rows, [total]] = await Promise.all([
      tenantDb
        .select()
        .from(agentApiKeys)
        .where(whereClause)
        .orderBy(desc(agentApiKeys.createdAt), desc(agentApiKeys.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      tenantDb.select({ count: count() }).from(agentApiKeys).where(whereClause),
    ]);

    return {
      data: rows.map(toResponse),
      meta: { page, pageSize, total: total?.count ?? 0 },
    };
  }

  /** 软吊销；重复吊销保持幂等，保留原吊销时间 */
  async revoke(agentDefinitionId: string, keyId: string): Promise<void> {
    const tenantDb = getTenantDb(this.db);
    const [existing] = await tenantDb
      .select({ id: agentApiKeys.id, revokedAt: agentApiKeys.revokedAt })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.id, keyId),
          eq(agentApiKeys.agentDefinitionId, agentDefinitionId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AgentApiKeyNotFoundException(keyId);
    }

    if (existing.revokedAt) {
      return;
    }

    const now = new Date();
    await tenantDb
      .update(agentApiKeys)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(agentApiKeys.id, keyId), isNull(agentApiKeys.revokedAt)));
  }

  /**
   * 校验明文 Key。此时还不知道租户，因此直接用原始 DRIZZLE 连接按 key_hash 查找（不经 RLS）。
   * 不做进程内缓存：吊销必须立即生效。
   */
  async validate(rawKey: string): Promise<AgentApiKeyContext> {
    if (!RAW_KEY_PATTERN.test(rawKey)) {
      throw new AgentApiKeyInvalidException();
    }

    const [record] = await this.db
      .select({
        id: agentApiKeys.id,
        tenantId: agentApiKeys.tenantId,
        agentDefinitionId: agentApiKeys.agentDefinitionId,
        keyPrefix: agentApiKeys.keyPrefix,
        maxConcurrentRuns: agentApiKeys.maxConcurrentRuns,
        rateLimitPerMinute: agentApiKeys.rateLimitPerMinute,
        expiresAt: agentApiKeys.expiresAt,
        revokedAt: agentApiKeys.revokedAt,
        lastUsedAt: agentApiKeys.lastUsedAt,
      })
      .from(agentApiKeys)
      .where(
        eq(
          agentApiKeys.keyHash,
          createHash('sha256').update(rawKey).digest('hex'),
        ),
      )
      .limit(1);

    const now = Date.now();

    if (
      !record ||
      record.revokedAt ||
      (record.expiresAt && record.expiresAt.getTime() <= now)
    ) {
      throw new AgentApiKeyInvalidException();
    }

    if (
      !record.lastUsedAt ||
      now - record.lastUsedAt.getTime() >= LAST_USED_AT_WRITE_INTERVAL_MS
    ) {
      this.touchLastUsedAt(record.id, new Date(now));
    }

    return {
      keyId: record.id,
      tenantId: record.tenantId,
      agentDefinitionId: record.agentDefinitionId,
      keyPrefix: record.keyPrefix,
      maxConcurrentRuns: record.maxConcurrentRuns,
      rateLimitPerMinute: record.rateLimitPerMinute,
    };
  }

  private async ensureAgentExists(agentDefinitionId: string): Promise<void> {
    const [agent] = await getTenantDb(this.db)
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, agentDefinitionId))
      .limit(1);

    if (!agent) {
      throw new AgentNotFoundException(agentDefinitionId);
    }
  }

  /** fire-and-forget：失败只记日志，不影响本次请求 */
  private touchLastUsedAt(keyId: string, usedAt: Date): void {
    this.db
      .update(agentApiKeys)
      .set({ lastUsedAt: usedAt })
      .where(eq(agentApiKeys.id, keyId))
      .then(
        () => undefined,
        (error: unknown) => {
          this.logger.warn(
            `更新 Agent API Key last_used_at 失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
  }
}

function toResponse(record: AgentApiKey): AgentApiKeyResponse {
  return {
    id: record.id,
    agentDefinitionId: record.agentDefinitionId,
    name: record.name,
    keyPrefix: record.keyPrefix,
    rateLimitPerMinute: record.rateLimitPerMinute,
    maxConcurrentRuns: record.maxConcurrentRuns,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}
