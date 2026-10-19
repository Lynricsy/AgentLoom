/**
 * 执行 / 步骤 errorMessage 的对外形态。
 *
 * 历史数据的 errorMessage 里可能存有服务器堆栈（含绝对路径与依赖路径）；新写入已不再落库堆栈，
 * 对外输出（REST 执行详情、Socket 状态快照）统一在这里剔除 `stack`。
 */
export function toPublicExecutionErrorMessage<T>(errorMessage: T): T {
  if (
    typeof errorMessage !== 'object' ||
    errorMessage === null ||
    Array.isArray(errorMessage) ||
    !('stack' in errorMessage)
  ) {
    return errorMessage;
  }

  const { stack: _stack, ...rest } = errorMessage;
  // 只删除一个可选字段，其余结构与入参一致
  return rest as T;
}
