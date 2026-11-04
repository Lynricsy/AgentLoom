/**
 * 把模型给出的路径（相对 workdir 或绝对）解析为绝对路径，并要求位于 workdir
 * 之内（workdir 即 profile 中 sandbox-policy 的 workspaceRoot，生产为 /workspace），
 * 越界即抛错。
 */
import path from 'node:path';

export function resolveWorkspacePath(workdir: string, input: string): string {
  const root = path.resolve(workdir);
  const resolved = path.resolve(root, input);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`path must be under ${root}/ — got: ${resolved}`);
  }
  return resolved;
}
