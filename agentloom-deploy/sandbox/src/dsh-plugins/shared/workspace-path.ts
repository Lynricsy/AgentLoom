/**
 * 把模型给出的路径（相对 workdir 或绝对）解析为绝对路径，并要求位于 workdir
 * 之内（workdir 即 profile 中 sandbox-policy 的 workspaceRoot，生产为 /workspace），
 * 越界即抛错（fail-closed）。
 *
 * 除字面前缀检查外，还对目标（不存在时取最近存在的祖先）做 realpath 校验，
 * 防止工作区内的符号链接把读写引到工作区外；悬空符号链接一律拒绝。
 */
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export function resolveWorkspacePath(workdir: string, input: string): string {
  const root = path.resolve(workdir);
  const resolved = path.resolve(root, input);
  if (!isInside(root, resolved)) {
    throw new Error(`path must be under ${root}/ — got: ${resolved}`);
  }

  // 找到最近一个实际存在的路径（lstat：悬空链接本身也算存在，交给 realpath 拒绝）
  let probe = resolved;
  for (;;) {
    try {
      lstatSync(probe);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || probe === root) throw error;
      probe = path.dirname(probe);
    }
  }

  let realProbe: string;
  try {
    realProbe = realpathSync(probe);
  } catch {
    throw new Error(`path must be under ${root}/ — got dangling symlink: ${probe}`);
  }
  if (!isInside(realpathSync(root), realProbe)) {
    throw new Error(`path must be under ${root}/ — got: ${resolved} (resolves to ${realProbe})`);
  }
  return resolved;
}
