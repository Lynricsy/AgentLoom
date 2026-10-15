/**
 * 团队运行时单测用的 Drizzle 替身：每条被 await 的查询链按调用顺序从 `results` 取一个返回值，
 * 并记录操作与链式调用，便于断言写入内容。`transaction` 直接用自身作为 tx，
 * 因而真实的 runInTenantTransaction / registerAfterCommitHook 照常工作。
 */
export interface FakeQueryCall {
  op: 'select' | 'selectDistinct' | 'insert' | 'update' | 'delete';
  args: unknown[];
  chain: Array<[string, unknown[]]>;
}

export function createFakeDb(results: unknown[] = []) {
  const calls: FakeQueryCall[] = [];

  const startChain = (op: FakeQueryCall['op'], args: unknown[]) => {
    const record: FakeQueryCall = { op, args, chain: [] };
    calls.push(record);
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const value = results.shift();
            return (
              resolve: (value: unknown) => void,
              reject: (error: unknown) => void,
            ) => (value instanceof Error ? reject(value) : resolve(value));
          }
          return (...chainArgs: unknown[]) => {
            record.chain.push([String(prop), chainArgs]);
            return chain;
          };
        },
      },
    );
    return chain;
  };

  const db = {
    select: (...args: unknown[]) => startChain('select', args),
    selectDistinct: (...args: unknown[]) => startChain('selectDistinct', args),
    insert: (...args: unknown[]) => startChain('insert', args),
    update: (...args: unknown[]) => startChain('update', args),
    delete: (...args: unknown[]) => startChain('delete', args),
    execute: async () => undefined,
    transaction: async <T>(operation: (tx: unknown) => Promise<T>) =>
      operation(db),
  };

  /** 某次调用的链式方法参数（如 values / set） */
  const argsOf = (call: FakeQueryCall, method: string): unknown[] | undefined =>
    call.chain.find(([name]) => name === method)?.[1];

  return { db, calls, results, argsOf };
}
