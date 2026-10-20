import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../../database/database.module';

type AfterCommitHook = () => Promise<void>;

export interface TenantTransactionContext {
  db: DrizzleDB;
  afterCommitHooks: AfterCommitHook[];
}

export const transactionStorage =
  new AsyncLocalStorage<TenantTransactionContext>();

/**
 * 已认证但没有租户上下文的 HTTP 请求作用域，由 TenantTransactionInterceptor 建立。
 * 作用域内 getTenantDb() fail-closed，不把绕过 RLS 的基础连接交给业务查询；
 * 需要无租户访问的调用方（创建组织、接受邀请）显式使用注入的基础连接，
 * 或用 runInTenantTransaction 显式进入某个租户。见 ADR 0010。
 */
export const tenantlessRequestStorage = new AsyncLocalStorage<true>();

export function hasActiveTenantTransaction(): boolean {
  return transactionStorage.getStore() !== undefined;
}

export function registerAfterCommitHook(hook: AfterCommitHook): void {
  const context = transactionStorage.getStore();

  if (!context) {
    throw new Error(
      'registerAfterCommitHook must be used inside a tenant transaction',
    );
  }

  context.afterCommitHooks.push(hook);
}

export async function runInTenantTransaction<T>(
  db: DrizzleDB,
  tenantId: string,
  operation: (dbClient: DrizzleDB) => Promise<T>,
): Promise<T> {
  const currentTransaction = transactionStorage.getStore();

  if (currentTransaction) {
    return operation(currentTransaction.db);
  }

  const afterCommitHooks: AfterCommitHook[] = [];

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
    );

    const tenantDb = tx as unknown as DrizzleDB;
    const context: TenantTransactionContext = {
      db: tenantDb,
      afterCommitHooks,
    };

    return transactionStorage.run(context, () => operation(tenantDb));
  });

  for (const hook of afterCommitHooks) {
    await hook();
  }

  return result;
}
