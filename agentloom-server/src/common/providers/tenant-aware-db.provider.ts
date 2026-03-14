import { transactionStorage } from '../interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';

/**
 * 获取当前租户上下文的数据库实例。
 * 若当前请求在 TenantTransactionInterceptor 管理的事务中，
 * 返回已设置 app.current_tenant 的事务对象（RLS 生效）；
 * 否则返回原始 db 连接（公开路由、无租户上下文场景）。
 */
export function getTenantDb(db: DrizzleDB): DrizzleDB {
  return transactionStorage.getStore()?.db ?? db;
}
