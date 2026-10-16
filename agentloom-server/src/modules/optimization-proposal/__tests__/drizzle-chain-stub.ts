import {
  transactionStorage,
  type TenantTransactionContext,
} from '../../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../../database/database.module';

export interface RecordedCall {
  /** 链首方法：select / insert / update / execute / selectDistinct … */
  root: string;
  method: string;
  args: unknown[];
}

/**
 * Drizzle 链式查询替身：任意方法都返回同一条链，`await` 时按顺序取 `results` 的下一项
 * （项为 Error 时 reject）。同一链上的调用都记入 `calls`（带链首方法名），便于断言 values / set 参数。
 * 未被 await 的链（如 notExists 子查询）不消耗结果。
 */
export function createQueryDb(results: unknown[]) {
  const queue = [...results];
  const calls: RecordedCall[] = [];

  const makeChain = (root: string): unknown => {
    const chain: unknown = new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === 'then') {
          const value = queue.length > 0 ? queue.shift() : [];
          return (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown,
          ) =>
            value instanceof Error
              ? Promise.reject(value).then(resolve, reject)
              : Promise.resolve(value).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push({ root, method: String(prop), args });
          return chain;
        };
      },
    });
    return chain;
  };

  // 新开事务时 runInTenantTransaction 会先执行 SET ROLE / set_config 两条语句，不消耗结果
  let pendingSessionStatements = 0;
  const db: DrizzleDB = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return undefined;
        }
        if (prop === 'transaction') {
          return async (operation: (tx: DrizzleDB) => Promise<unknown>) => {
            pendingSessionStatements += 2;
            return operation(db);
          };
        }
        return (...args: unknown[]) => {
          if (prop === 'execute' && pendingSessionStatements > 0) {
            pendingSessionStatements -= 1;
            return Promise.resolve(undefined);
          }
          calls.push({ root: String(prop), method: String(prop), args });
          return makeChain(String(prop));
        };
      },
    },
  ) as unknown as DrizzleDB;

  return {
    db,
    calls,
    remaining: () => queue.length,
    /** 某链首下某方法的全部首参（如 insert → values、update → set） */
    argsOf: (root: string, method: string) =>
      calls
        .filter((call) => call.root === root && call.method === method)
        .map((call) => call.args[0]),
  };
}

/** 在已存在的租户事务上下文中运行，使 runInTenantTransaction 直接复用替身 db */
export async function inTenantContext<T>(
  db: DrizzleDB,
  operation: () => Promise<T>,
): Promise<{ result: T; context: TenantTransactionContext }> {
  const context: TenantTransactionContext = { db, afterCommitHooks: [] };
  const result = await transactionStorage.run(context, operation);
  return { result, context };
}
