import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../../database/database.module';

export const transactionStorage = new AsyncLocalStorage<DrizzleDB>();

export async function runInTenantTransaction<T>(
  db: DrizzleDB,
  tenantId: string,
  operation: (dbClient: DrizzleDB) => Promise<T>,
): Promise<T> {
  const currentTransaction = transactionStorage.getStore();

  if (currentTransaction) {
    return operation(currentTransaction);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
    );

    const tenantDb = tx as unknown as DrizzleDB;
    return transactionStorage.run(tenantDb, () => operation(tenantDb));
  });
}
