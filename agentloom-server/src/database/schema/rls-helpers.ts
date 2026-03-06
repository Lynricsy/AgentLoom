import { sql } from 'drizzle-orm';

/**
 * 引用 PostgreSQL 函数 get_tenant_id()
 * 实际函数通过自定义迁移创建（参见 migrations/0005_*）
 *
 * 函数签名:
 *   get_tenant_id() RETURNS uuid LANGUAGE sql STABLE
 *   AS $$ SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid $$
 *
 * - STABLE: 标记为稳定函数，允许查询优化器缓存结果
 * - NULLIF: 空字符串安全，避免 '' 转 uuid 报错
 * - current_setting(..., true): missing_ok=true，未设置时返回 NULL 而非抛异常
 */
export const getTenantId = sql`get_tenant_id()`;
