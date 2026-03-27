import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import { TenantRequiredException } from '../../common/exceptions/auth.exceptions';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { platformApiTokens } from '../../database/schema';
import type { PlatformApiToken } from '../../database/schema';
import { RbacCacheService } from '../../common/services/rbac-cache.service';
import type { CreatePlatformApiTokenDto } from './dto/create-platform-api-token.dto';
import { CreatePlatformApiTokenSchema } from './dto/create-platform-api-token.dto';
import type { QueryPlatformApiTokenDto } from './dto/query-platform-api-token.dto';
import { QueryPlatformApiTokenSchema } from './dto/query-platform-api-token.dto';
import type {
  PlatformApiTokenCreateResponse,
  PlatformApiTokenResponse,
} from './dto/platform-api-token-response.dto';
import {
  PlatformApiTokenAlreadyRevokedException,
  PlatformApiTokenExpiredException,
  PlatformApiTokenInvalidException,
  PlatformApiTokenLimitExceededException,
  PlatformApiTokenNotFoundException,
} from './platform-api-token.exceptions';

const TOKEN_PREFIX = 'al_';
const MAX_TOKENS_PER_USER_TENANT = 20;
const TOKEN_BYTE_LENGTH = 32;

@Injectable()
export class PlatformApiTokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly rbacCacheService: RbacCacheService,
  ) {}

  async generateToken(
    tenantId: string,
    userId: string,
    dto: CreatePlatformApiTokenDto,
  ): Promise<PlatformApiTokenCreateResponse> {
    this.ensureTenantId(tenantId);
    const parsedDto = CreatePlatformApiTokenSchema.parse(dto);

    await this.checkTokenLimit(tenantId, userId);

    const rawToken = `${TOKEN_PREFIX}${crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenPrefix = rawToken.slice(0, TOKEN_PREFIX.length + 8);

    const [created] = await this.db
      .insert(platformApiTokens)
      .values({
        userId,
        tenantId,
        name: parsedDto.name,
        tokenHash,
        tokenPrefix,
        scopes: parsedDto.scopes ?? null,
        expiresAt: parsedDto.expires_at ? new Date(parsedDto.expires_at) : null,
      })
      .returning();

    return {
      ...this.toResponse(created),
      token: rawToken,
    };
  }

  async findAll(
    tenantId: string,
    userId: string,
    dto: QueryPlatformApiTokenDto,
  ): Promise<{
    data: PlatformApiTokenResponse[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    this.ensureTenantId(tenantId);
    const parsedDto = QueryPlatformApiTokenSchema.parse(dto);
    const { page, page_size, status } = parsedDto;
    const offset = (page - 1) * page_size;

    const conditions = [
      eq(platformApiTokens.tenantId, tenantId),
      eq(platformApiTokens.userId, userId),
    ];

    if (status === 'active') {
      conditions.push(eq(platformApiTokens.isRevoked, false));
    } else if (status === 'revoked') {
      conditions.push(eq(platformApiTokens.isRevoked, true));
    }

    const whereClause = and(...conditions);

    const [tokens, countResult] = await Promise.all([
      this.db
        .select()
        .from(platformApiTokens)
        .where(whereClause)
        .orderBy(desc(platformApiTokens.createdAt))
        .limit(page_size)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(platformApiTokens)
        .where(whereClause),
    ]);

    return {
      data: tokens.map((t) => this.toResponse(t)),
      meta: {
        page,
        pageSize: page_size,
        total: countResult[0]?.count ?? 0,
      },
    };
  }

  async revoke(
    tenantId: string,
    userId: string,
    tokenId: string,
  ): Promise<void> {
    this.ensureTenantId(tenantId);

    const [existing] = await this.db
      .select({
        id: platformApiTokens.id,
        isRevoked: platformApiTokens.isRevoked,
      })
      .from(platformApiTokens)
      .where(
        and(
          eq(platformApiTokens.id, tokenId),
          eq(platformApiTokens.tenantId, tenantId),
          eq(platformApiTokens.userId, userId),
        ),
      );

    if (!existing) {
      throw new PlatformApiTokenNotFoundException(tokenId);
    }

    if (existing.isRevoked) {
      throw new PlatformApiTokenAlreadyRevokedException(tokenId);
    }

    await this.db
      .update(platformApiTokens)
      .set({
        isRevoked: true,
        updatedAt: new Date(),
      })
      .where(eq(platformApiTokens.id, tokenId));
  }

  async validateToken(rawToken: string): Promise<{
    userId: string;
    tenantId: string;
    scopes: string | null;
    tokenId: string;
    tokenPrefix: string;
    tenantRole?: string;
  }> {
    if (!rawToken.startsWith(TOKEN_PREFIX)) {
      throw new PlatformApiTokenInvalidException();
    }

    const tokenHash = this.hashToken(rawToken);

    const [record] = await this.db
      .select({
        id: platformApiTokens.id,
        userId: platformApiTokens.userId,
        tenantId: platformApiTokens.tenantId,
        scopes: platformApiTokens.scopes,
        tokenPrefix: platformApiTokens.tokenPrefix,
        isRevoked: platformApiTokens.isRevoked,
        expiresAt: platformApiTokens.expiresAt,
      })
      .from(platformApiTokens)
      .where(eq(platformApiTokens.tokenHash, tokenHash));

    if (!record) {
      throw new PlatformApiTokenInvalidException();
    }

    if (record.isRevoked) {
      throw new PlatformApiTokenInvalidException();
    }

    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      throw new PlatformApiTokenExpiredException();
    }

    const tenantRole =
      (await this.rbacCacheService.getUserRole(
        record.tenantId,
        record.userId,
      )) ?? undefined;

    return {
      userId: record.userId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      tokenId: record.id,
      tokenPrefix: record.tokenPrefix,
      tenantRole,
    };
  }

  async updateLastUsedAt(tokenId: string): Promise<void> {
    await this.db
      .update(platformApiTokens)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(platformApiTokens.id, tokenId));
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async checkTokenLimit(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const [result] = await this.db
      .select({ count: count() })
      .from(platformApiTokens)
      .where(
        and(
          eq(platformApiTokens.tenantId, tenantId),
          eq(platformApiTokens.userId, userId),
          eq(platformApiTokens.isRevoked, false),
        ),
      );

    if ((result?.count ?? 0) >= MAX_TOKENS_PER_USER_TENANT) {
      throw new PlatformApiTokenLimitExceededException(
        MAX_TOKENS_PER_USER_TENANT,
      );
    }
  }

  private toResponse(record: PlatformApiToken): PlatformApiTokenResponse {
    return {
      id: record.id,
      name: record.name,
      tokenPrefix: record.tokenPrefix,
      scopes: record.scopes,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      isRevoked: record.isRevoked,
      createdAt: record.createdAt,
    };
  }

  private ensureTenantId(tenantId?: string): asserts tenantId is string {
    if (!tenantId) {
      throw new TenantRequiredException();
    }
  }
}
