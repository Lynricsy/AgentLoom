import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { revokedTokens } from '../../database/schema';
import { DomainException } from '../exceptions/domain.exception';

/** access token 的服务端状态：可用 / 已吊销 / 用户已启用 MFA 但该 token 未完成第二因素。 */
export type TokenState = 'active' | 'revoked' | 'mfa_required';

/**
 * DB ベースのトークンブラックリスト
 *
 * トークンは SHA-256 ハッシュとして保存し、原文は保持しない。
 * revoked_tokens テーブルで永続化し、複数インスタンス間で共有可能。
 *
 * access token 带 `session_id`（GoTrue 签发）时，同一次查询还校验：
 * - auth.sessions 中该会话仍存在且未过 not_after：会话被 DELETE /auth/sessions/:id、
 *   revoke-all、GoTrue 登出或会话超时删除后，该会话已签发的 token 立即失效；
 * - 用户在 auth.mfa_factors 中有已验证因子时，token 的 `aal` 必须为 aal2。
 *   否则仅凭密码（直连 GoTrue 或 mfa_pending 中携带的 aal1 token）即可绕过 MFA。
 * 上述表不可读时 fail-closed（503 session-verification-unavailable）。
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
   * session_id / sub / aal 取自未验签的 payload：伪造值只会让结果偏向“拒绝”或
   * 无法通过调用方随后的 jwt.verify 签名校验。
   */
  async checkToken(token: string): Promise<TokenState> {
    const tokenHash = this.hashToken(token);
    const claims = this.readSessionClaims(token);

    if (claims === null) {
      return 'revoked';
    }

    if (claims === undefined) {
      const result = await this.db.query.revokedTokens.findFirst({
        where: eq(revokedTokens.tokenHash, tokenHash),
      });
      return result ? 'revoked' : 'active';
    }

    let rows: Array<{ revoked: boolean; mfa_required: boolean }>;
    try {
      rows = await this.db.execute<{ revoked: boolean; mfa_required: boolean }>(
        sql`
        SELECT (
          EXISTS (SELECT 1 FROM revoked_tokens WHERE token_hash = ${tokenHash})
          OR NOT EXISTS (
            SELECT 1 FROM auth.sessions
            WHERE id = ${claims.sessionId}::uuid
              AND (not_after IS NULL OR not_after > now())
          )
        ) AS revoked,
        (
          ${claims.aal}::text IS DISTINCT FROM 'aal2'
          AND EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE user_id::text = ${claims.sub}
              AND status = 'verified'
          )
        ) AS mfa_required
      `,
      );
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

    const row = rows[0];
    if (row?.revoked !== false) return 'revoked';
    return row.mfa_required === false ? 'active' : 'mfa_required';
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

  /**
   * undefined = 无 session_id 声明（非 GoTrue token）；
   * null = session_id 存在但不是 UUID，或缺少 sub（按吊销处理）。
   */
  private readSessionClaims(
    token: string,
  ): { sessionId: string; sub: string; aal: string | null } | null | undefined {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object' || !('session_id' in decoded)) {
      return undefined;
    }
    const sessionId: unknown = decoded.session_id;
    if (
      typeof sessionId !== 'string' ||
      !isUuid(sessionId) ||
      typeof decoded.sub !== 'string'
    ) {
      return null;
    }
    return {
      sessionId,
      sub: decoded.sub,
      aal: typeof decoded.aal === 'string' ? decoded.aal : null,
    };
  }
}
