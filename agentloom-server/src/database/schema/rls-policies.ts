import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';
import { getTenantId } from './rls-helpers';

/**
 * 创建直接租户匹配的 RLS 策略
 * 适用于包含 tenant_id 列的表（如 organizations）
 *
 * 生成 4 个策略: SELECT / INSERT / UPDATE / DELETE
 * 条件: tenant_id = get_tenant_id()
 */
export function createDirectTenantPolicies(tableName: string) {
  const tenantCheck = sql`tenant_id = ${getTenantId}`;

  return [
    pgPolicy(`${tableName}_select_policy`, {
      for: 'select',
      to: authenticatedRole,
      using: tenantCheck,
    }),
    pgPolicy(`${tableName}_insert_policy`, {
      for: 'insert',
      to: authenticatedRole,
      withCheck: tenantCheck,
    }),
    pgPolicy(`${tableName}_update_policy`, {
      for: 'update',
      to: authenticatedRole,
      using: tenantCheck,
      withCheck: tenantCheck,
    }),
    pgPolicy(`${tableName}_delete_policy`, {
      for: 'delete',
      to: authenticatedRole,
      using: tenantCheck,
    }),
  ];
}

/**
 * 创建通过 JOIN 父表实现的 RLS 策略
 * 适用于没有 tenant_id 列的子表（如 organization_members, organization_invitations）
 * 通过外键关联到父表，用 EXISTS 子查询验证租户归属
 *
 * @param tableName - 当前表名（SQL 标识符）
 * @param fkColumn - 指向父表的外键列名
 * @param parentTable - 父表名
 * @param parentPk - 父表主键列名，默认 'id'
 */
export function createJoinTenantPolicies(
  tableName: string,
  fkColumn: string,
  parentTable: string,
  parentPk: string = 'id',
) {
  const existsCheck = sql`EXISTS (
    SELECT 1 FROM ${sql.identifier(parentTable)}
    WHERE ${sql.identifier(parentTable)}.${sql.identifier(parentPk)} = ${sql.identifier(tableName)}.${sql.identifier(fkColumn)}
    AND ${sql.identifier(parentTable)}.tenant_id = ${getTenantId}
  )`;

  return [
    pgPolicy(`${tableName}_select_policy`, {
      for: 'select',
      to: authenticatedRole,
      using: existsCheck,
    }),
    pgPolicy(`${tableName}_insert_policy`, {
      for: 'insert',
      to: authenticatedRole,
      withCheck: existsCheck,
    }),
    pgPolicy(`${tableName}_update_policy`, {
      for: 'update',
      to: authenticatedRole,
      using: existsCheck,
      withCheck: existsCheck,
    }),
    pgPolicy(`${tableName}_delete_policy`, {
      for: 'delete',
      to: authenticatedRole,
      using: existsCheck,
    }),
  ];
}
