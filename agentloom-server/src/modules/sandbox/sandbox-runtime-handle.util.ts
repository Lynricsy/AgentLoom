import { SandboxRuntimeNotFoundException } from './sandbox.exceptions';

/**
 * 复合 runtime handle 的编解码。
 *
 * 格式 `<nodeId>/<managerHandle>`：节点身份编码进 handle，使所有按 handle
 * 定位的 driver 方法（start/stop/guest 代理/exec…）无需改动接口即可路由回
 * 原节点。
 *
 * 分隔符必须是 `/` 而非 `:`：exec handle 形如 `<runtimeHandle>:<guestExecId>`
 * 且按**第一个** `:` 切分，handle 内含 `:` 会破坏 exec 路由。`/` 在拼进
 * manager URL 路径时已由 encodeURIComponent 编码为 %2F。
 */
export function composeRuntimeHandle(
  nodeId: string,
  managerHandle: string,
): string {
  return `${nodeId}/${managerHandle}`;
}

export interface ParsedRuntimeHandle {
  nodeId: string;
  managerHandle: string;
}

/**
 * 按第一个 `/` 切分复合 handle。
 *
 * fail-closed：迁移 0077 已为存量数据补齐 `default/` 前缀，运行期出现裸
 * handle 即数据异常，宁可 404 也不猜节点——猜错会把请求打到别的机器上。
 */
export function splitRuntimeHandle(handle: string): ParsedRuntimeHandle {
  const separator = handle.indexOf('/');
  if (separator <= 0 || separator === handle.length - 1) {
    throw new SandboxRuntimeNotFoundException();
  }
  return {
    nodeId: handle.slice(0, separator),
    managerHandle: handle.slice(separator + 1),
  };
}
