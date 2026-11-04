/**
 * 语言服务器静态表、可执行文件解析，以及按 (id, root) 缓存的 server 实例池。
 *
 * 二进制查找顺序：<root>/node_modules/.bin/<command> → ctx.subprocess.resolveExecutable。
 * rootfs 预装 typescript-language-server 与 pyright（pyright-langserver）；
 * gopls / rust-analyzer 只在 PATH 上存在时启用。
 */
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { LspClient } from './client.js';

export interface LspServerSpec {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  /** 扩展名 → LSP languageId */
  readonly languageIds: Readonly<Record<string, string>>;
  readonly rootMarkers: readonly string[];
}

export const LSP_SERVERS: readonly LspServerSpec[] = [
  {
    id: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageIds: {
      '.ts': 'typescript',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascriptreact',
    },
    rootMarkers: ['package.json', 'tsconfig.json', 'jsconfig.json'],
  },
  {
    id: 'pyright',
    command: 'pyright-langserver',
    args: ['--stdio'],
    languageIds: { '.py': 'python', '.pyi': 'python' },
    rootMarkers: ['pyproject.toml', 'pyrightconfig.json', 'setup.py', 'requirements.txt'],
  },
  {
    id: 'gopls',
    command: 'gopls',
    args: [],
    languageIds: { '.go': 'go' },
    rootMarkers: ['go.mod', 'go.work'],
  },
  {
    id: 'rust-analyzer',
    command: 'rust-analyzer',
    args: [],
    languageIds: { '.rs': 'rust' },
    rootMarkers: ['Cargo.toml'],
  },
];

/** 空闲多久关闭一个 server 实例 */
const IDLE_SHUTDOWN_MS = 10 * 60 * 1000;

/** 按扩展名选择 server 条目 */
export function serverForFile(file: string): LspServerSpec | undefined {
  const ext = path.extname(file).toLowerCase();
  return LSP_SERVERS.find((spec) => ext in spec.languageIds);
}

export function languageIdFor(spec: LspServerSpec, file: string): string {
  return spec.languageIds[path.extname(file).toLowerCase()] ?? spec.id;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(target: string): Promise<boolean> {
  try {
    await fs.access(target, fsConstants.X_OK);
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
}

/** 从文件所在目录向上（不越过 workdir）找第一个含任一 marker 的目录，否则 workdir */
export async function findProjectRoot(
  file: string,
  workdir: string,
  markers: readonly string[],
): Promise<string> {
  const root = path.resolve(workdir);
  let dir = path.dirname(file);
  while (dir === root || dir.startsWith(`${root}${path.sep}`)) {
    for (const marker of markers) {
      if (await exists(path.join(dir, marker))) return dir;
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return root;
}

interface PoolEntry {
  readonly spec: LspServerSpec;
  readonly root: string;
  readonly startedAt: number;
  client: Promise<LspClient>;
  lastUsed: number;
  idleTimer?: NodeJS.Timeout;
}

export interface RunningServerInfo {
  id: string;
  root: string;
  startedAt: number;
  lastUsed: number;
  state: 'starting' | 'running';
}

export interface ResolvedServer {
  spec: LspServerSpec;
  root: string;
  bin: string;
}

/** server 实例池：首次使用时启动，空闲 10 分钟关闭，dispose 时全部关闭 */
export class LspServerPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly ready = new Set<string>();
  private disposed = false;

  constructor(
    private readonly subprocess: SubprocessRuntime,
    private readonly workdir: string,
    private readonly warn: (message: string) => void,
  ) {}

  /** 解析二进制路径；找不到返回 undefined */
  async resolveBinary(spec: LspServerSpec, root: string): Promise<string | undefined> {
    const local = path.join(root, 'node_modules', '.bin', spec.command);
    if (await isExecutable(local)) return local;
    try {
      return await this.subprocess.resolveExecutable(spec.command);
    } catch {
      return undefined;
    }
  }

  /** 文件对应的 server 条目、项目根与二进制；任何一项缺失返回 undefined */
  async resolveForFile(file: string): Promise<ResolvedServer | undefined> {
    const spec = serverForFile(file);
    if (!spec) return undefined;
    const root = await findProjectRoot(file, this.workdir, spec.rootMarkers);
    const bin = await this.resolveBinary(spec, root);
    return bin ? { spec, root, bin } : undefined;
  }

  /** 「No language server available」文案里的可用性清单 */
  async availabilitySummary(): Promise<string> {
    const parts = await Promise.all(
      LSP_SERVERS.map(async (spec) => {
        const bin = await this.resolveBinary(spec, this.workdir);
        return `${spec.id}(${bin ?? 'missing'})`;
      }),
    );
    return parts.join(', ');
  }

  /** 该文件对应的 server 实例是否已启动就绪（冷启动时需要更长的首轮诊断等待） */
  isReady(resolved: ResolvedServer): boolean {
    return this.ready.has(`${resolved.spec.id}\u0000${resolved.root}`);
  }

  /** 取（必要时启动）server 实例 */
  async acquire(resolved: ResolvedServer): Promise<LspClient> {
    if (this.disposed) throw new Error('lsp plugin is disposed');
    const key = `${resolved.spec.id}\u0000${resolved.root}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const created: PoolEntry = {
        spec: resolved.spec,
        root: resolved.root,
        startedAt: Date.now(),
        lastUsed: Date.now(),
        client: LspClient.start({
          subprocess: this.subprocess,
          serverId: resolved.spec.id,
          bin: resolved.bin,
          args: resolved.spec.args,
          root: resolved.root,
          onExit: (reason) => {
            // 进程退出即清缓存，下次使用重新启动
            if (this.entries.get(key) === created) this.forget(key);
            if (reason) this.warn(`${resolved.spec.id} (${resolved.root}) exited: ${reason}`);
          },
        }),
      };
      entry = created;
      this.entries.set(key, created);
      created.client.then(
        () => {
          if (this.entries.get(key) === created) this.ready.add(key);
        },
        () => {
          if (this.entries.get(key) === created) this.forget(key);
        },
      );
    }
    this.touch(key, entry);
    return entry.client;
  }

  /** 已启动且可用的实例（workspace/symbol 无 file 时用） */
  async runningClients(): Promise<LspClient[]> {
    const clients: LspClient[] = [];
    for (const [key, entry] of this.entries) {
      if (!this.ready.has(key)) continue;
      this.touch(key, entry);
      clients.push(await entry.client);
    }
    return clients;
  }

  running(): RunningServerInfo[] {
    return [...this.entries.entries()].map(([key, entry]) => ({
      id: entry.spec.id,
      root: entry.root,
      startedAt: entry.startedAt,
      lastUsed: entry.lastUsed,
      state: this.ready.has(key) ? 'running' : 'starting',
    }));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const entries = [...this.entries.keys()];
    await Promise.allSettled(entries.map((key) => this.shutdown(key)));
  }

  private touch(key: string, entry: PoolEntry): void {
    entry.lastUsed = Date.now();
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      void this.shutdown(key);
    }, IDLE_SHUTDOWN_MS);
    entry.idleTimer.unref();
  }

  private forget(key: string): PoolEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    clearTimeout(entry.idleTimer);
    this.entries.delete(key);
    this.ready.delete(key);
    return entry;
  }

  private async shutdown(key: string): Promise<void> {
    const entry = this.forget(key);
    if (!entry) return;
    try {
      const client = await entry.client;
      await client.dispose();
    } catch {
      // 启动失败的实例无需关闭
    }
  }
}
