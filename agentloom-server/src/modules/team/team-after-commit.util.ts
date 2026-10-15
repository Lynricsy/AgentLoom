import {
  hasActiveTenantTransaction,
  registerAfterCommitHook,
} from '../../common/interceptors/tenant-transaction.context';

/**
 * 在当前租户事务提交后执行副作用（派发、广播、入队）；不在事务内时立即执行。
 * 团队运行时的写入可能嵌套在调用方事务里（例如调度器内启动团队），副作用必须等外层提交。
 */
export async function runAfterTenantCommit(
  operation: () => Promise<void>,
): Promise<void> {
  if (hasActiveTenantTransaction()) {
    registerAfterCommitHook(operation);
    return;
  }
  await operation();
}
