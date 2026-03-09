import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * 失効トークンテーブル
 *
 * JWT アクセストークンのブラックリストを永続化する。
 * トークン本体ではなく SHA-256 ハッシュを保存し、漏洩リスクを低減。
 * expires_at 以降のレコードは定期バッチで削除可能（自動 TTL は DB 側で管理しない）。
 */
export const revokedTokens = pgTable(
  'revoked_tokens',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index('idx_revoked_tokens_expires_at').on(table.expiresAt)],
);

export type RevokedToken = typeof revokedTokens.$inferSelect;
export type NewRevokedToken = typeof revokedTokens.$inferInsert;
