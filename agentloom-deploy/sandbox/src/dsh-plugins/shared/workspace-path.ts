import path from 'node:path';

const WORKSPACE_ROOT = path.resolve('/workspace');

/**
 * 把模型给出的路径（相对 workdir 或绝对）解析为绝对路径，并要求位于
 * /workspace/ 下（与 bridge 的 PTY cwd 规则一致），越界即抛错。
 */
export function resolveWorkspacePath(workdir: string, input: string): string {
  const resolved = path.resolve(workdir, input);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error(`path must be under /workspace/ — got: ${resolved}`);
  }
  return resolved;
}
