import { TenantRequiredException } from '../exceptions/auth.exceptions';
import {
  tenantlessRequestStorage,
  transactionStorage,
} from '../interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';

/**
 * 获取当前租户上下文的数据库实例：
 * - 在租户事务中（TenantTransactionInterceptor 或 runInTenantTransaction 建立）：
 *   返回已设置 app.current_tenant 的事务对象，RLS 生效；
 * - 在已认证但没有租户的 HTTP 请求中：fail-closed，抛 400 tenant-required。
 *   基础连接不受 RLS 约束，回退过去会让无组织用户读到所有租户的数据（D-209）；
 * - 其余场景（公开路由、worker、定时任务、事件监听器）：返回基础连接，
 *   调用方必须自行 runInTenantTransaction 或在查询中显式带租户条件。
 * 决策见 ADR 0010。
 */
export function getTenantDb(db: DrizzleDB): DrizzleDB {
  const tenantTransaction = transactionStorage.getStore();

  if (tenantTransaction) {
    return tenantTransaction.db;
  }

  if (tenantlessRequestStorage.getStore()) {
    throw new TenantRequiredException();
  }

  return db;
}
