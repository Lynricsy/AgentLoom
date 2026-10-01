import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { revokedTokens } from '../../database/schema';
import { DomainException } from '../exceptions/domain.exception';

/**
 * DB ベースのトークンブラックリスト
 *
 * トークンは SHA-256 ハッシュとして保存し、原文は保持しない。
 * revoked_tokens テーブルで永続化し、複数インスタンス間で共有可能。
 *
 * access token 带 `session_id`（GoTrue 签发）时，同一次查询还校验
 * auth.sessions 中该会话仍存在且未过 not_after：会话被 DELETE /auth/sessions/:id、
 * revoke-all、GoTrue 登出或会话超时删除后，该会话已签发的 token 立即失效。
 * auth.sessions 不可读时 fail-closed（503 session-verification-unavailable）。
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async add(token: string, expiresAt: number, userId?: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.db
      .insert(revokedTokens)
      .values({
        tokenHash,
        userId: userId ?? null,
        expiresAt: new Date(expiresAt * 1000),
      })
      .onConflictDoNothing();
  }

  /**
   * token 已被显式吊销，或其所属会话已不存在/已过期时返回 true。
   * session_id 取自未验签的 payload：伪造值只会让结果偏向“拒绝”，
   * 签名本身仍由调用方的 jwt.verify 校验。
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const sessionId = this.readSessionId(token);

    if (sessionId === null) {
      return true;
    }

    if (sessionId === undefined) {
      const result = await this.db.query.revokedTokens.findFirst({
        where: eq(revokedTokens.tokenHash, tokenHash),
      });
      return !!result;
    }

    let rows: Array<{ revoked: boolean }>;
    try {
      rows = await this.db.execute<{ revoked: boolean }>(sql`
        SELECT (
          EXISTS (SELECT 1 FROM revoked_tokens WHERE token_hash = ${tokenHash})
          OR NOT EXISTS (
            SELECT 1 FROM auth.sessions
            WHERE id = ${sessionId}::uuid
              AND (not_after IS NULL OR not_after > now())
          )
        ) AS revoked
      `);
    } catch (error) {
      // fail-closed：无法确认会话仍存活时拒绝请求，而不是退化为只查哈希黑名单。
      this.logger.error(
        `Session liveness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new DomainException({
        type: 'https://agentloom.dev/errors/session-verification-unavailable',
        title: 'Service Unavailable',
        status: HttpStatus.SERVICE_UNAVAILABLE,
        detail: 'Unable to verify session state; request rejected',
      });
    }
    return rows[0]?.revoked !== false;
  }

  async cleanup(): Promise<number> {
    const deleted = await this.db
      .delete(revokedTokens)
      .where(lt(revokedTokens.expiresAt, new Date()))
      .returning();
    this.logger.debug(`Cleaned up ${deleted.length} expired revoked tokens`);
    return deleted.length;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** undefined = 无 session_id 声明；null = 声明存在但不是 UUID（按吊销处理）。 */
  private readSessionId(token: string): string | null | undefined {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object' || !('session_id' in decoded)) {
      return undefined;
    }
    const sessionId: unknown = decoded.session_id;
    return typeof sessionId === 'string' && isUuid(sessionId)
      ? sessionId
      : null;
  }
}
