import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { revokedTokens } from '../../database/schema';

/**
 * DB ベースのトークンブラックリスト
 *
 * トークンは SHA-256 ハッシュとして保存し、原文は保持しない。
 * revoked_tokens テーブルで永続化し、複数インスタンス間で共有可能。
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

  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const result = await this.db.query.revokedTokens.findFirst({
      where: eq(revokedTokens.tokenHash, tokenHash),
    });
    return !!result;
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
}
