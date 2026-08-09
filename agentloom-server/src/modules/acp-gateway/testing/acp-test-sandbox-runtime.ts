import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { RequestInit } from 'undici';
import { FirecrackerRuntimeService } from '../../sandbox/firecracker-runtime.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type DeleteRuntimeOptions,
  type RuntimeExecCreateOptions,
  type RuntimeExecExitInfo,
  type RuntimeProcess,
  type RuntimeStats,
  type SandboxRuntimeDriver,
} from '../../sandbox/sandbox-runtime-driver.port';
import type { SandboxConfig } from '../../../database/schema';
import type { CreateRuntimePiContext } from '../../sandbox/sandbox-runtime-driver.port';

const GUEST_WORKSPACE_ROOT = '/workspace';

interface TestExecRecord {
  readonly child: ChildProcess;
  readonly output: Array<{ level: 'stdout' | 'stderr'; text: string }>;
  readonly callbacks: Set<(level: string, message: string) => void>;
  readonly exit: Promise<RuntimeExecExitInfo>;
  running: boolean;
  exitCode: number | null;
}

export class AcpTestSandboxRuntime implements SandboxRuntimeDriver {
  private readonly execs = new Map<string, TestExecRecord>();
  private readonly workspaceRoot = process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT;

  async createRuntime(
    sessionId: string,
    _config: SandboxConfig,
    _piContext?: CreateRuntimePiContext,
  ): Promise<{ runtimeHandle: string }> {
    return { runtimeHandle: sessionId };
  }

  async startRuntime(_runtimeHandle: string): Promise<void> {}
  async stopRuntime(_runtimeHandle: string): Promise<void> {}
  async deleteRuntime(
    _runtimeHandle: string,
    _options?: DeleteRuntimeOptions,
  ): Promise<void> {}
  async healthCheck(_runtimeHandle: string): Promise<boolean> {
    return true;
  }
  async inspectRuntime(_runtimeHandle: string): Promise<{ state: string }> {
    return { state: 'running' };
  }
  async requestGuest(
    _runtimeHandle: string,
    _path: string,
    _init?: RequestInit,
  ): Promise<Response> {
    return new Response(null, { status: 501 });
  }
  async attachLogs(
    _runtimeHandle: string,
    _callback: (level: string, message: string) => void,
  ): Promise<void> {}
  async getArchive(_runtimeHandle: string, _path: string): Promise<Readable> {
    throw new Error('ACP test runtime does not provide archives');
  }
  async putArchive(
    _runtimeHandle: string,
    _stream: Readable,
    _path: string,
  ): Promise<void> {
    throw new Error('ACP test runtime does not provide archives');
  }

  async readTextFile(
    _runtimeHandle: string,
    path: string,
    maxBytes: number,
  ): Promise<Buffer> {
    const hostPath = await this.resolveHostPath(path, false);
    const fileStat = await stat(hostPath);
    if (!fileStat.isFile()) {
      throw new Error('404 file not found');
    }
    if (fileStat.size > maxBytes) {
      throw new Error('413 file too large');
    }
    return readFile(hostPath);
  }

  async validateTextFileWrite(
    _runtimeHandle: string,
    path: string,
    _maxBytes: number,
  ): Promise<void> {
    await this.resolveHostPath(path, true);
  }

  async writeTextFile(
    _runtimeHandle: string,
    path: string,
    content: string,
    maxBytes: number,
  ): Promise<void> {
    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      throw new Error('413 content too large');
    }
    const hostPath = await this.resolveHostPath(path, true);
    await writeFile(hostPath, content, 'utf8');
  }

  async createExec(
    _runtimeHandle: string,
    options: RuntimeExecCreateOptions,
  ): Promise<{ execId: string }> {
    const cwd = await this.resolveHostPath(
      options.cwd ?? GUEST_WORKSPACE_ROOT,
      false,
    );
    if (!(await stat(cwd)).isDirectory()) {
      throw new Error('terminal cwd is not a directory');
    }

    const command =
      options.command === 'node' ? process.execPath : options.command;
    const env = { ...process.env };
    for (const entry of options.env ?? []) {
      const separator = entry.indexOf('=');
      if (separator > 0) {
        env[entry.slice(0, separator)] = entry.slice(separator + 1);
      }
    }
    const child = spawn(command, options.args ?? [], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const execId = randomUUID();
    let resolveExit!: (value: RuntimeExecExitInfo) => void;
    const exit = new Promise<RuntimeExecExitInfo>((resolveExitPromise) => {
      resolveExit = resolveExitPromise;
    });
    const record: TestExecRecord = {
      child,
      output: [],
      callbacks: new Set(),
      exit,
      running: true,
      exitCode: null,
    };
    const append = (level: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const text = chunk.toString();
      record.output.push({ level, text });
      for (const callback of record.callbacks) {
        callback(level, text);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.once('error', (error) => {
      append('stderr', error.message);
      record.running = false;
      record.exitCode = 127;
      resolveExit({ running: false, exitCode: 127, pid: child.pid ?? null });
    });
    child.once('exit', (code) => {
      if (!record.running) {
        return;
      }
      record.running = false;
      record.exitCode = code;
      resolveExit({ running: false, exitCode: code, pid: child.pid ?? null });
    });
    this.execs.set(execId, record);
    return { execId };
  }

  async attachExecOutput(
    execId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void> {
    const record = this.requireExec(execId);
    for (const chunk of record.output) {
      callback(chunk.level, chunk.text);
    }
    record.callbacks.add(callback);
  }

  async waitForExecExit(execId: string): Promise<RuntimeExecExitInfo> {
    const record = this.requireExec(execId);
    if (!record.running) {
      return {
        running: false,
        exitCode: record.exitCode,
        pid: record.child.pid ?? null,
      };
    }
    return record.exit;
  }

  async killExec(execId: string, signal = 'TERM'): Promise<void> {
    const record = this.requireExec(execId);
    if (record.running) {
      record.child.kill(this.toNodeSignal(signal));
    }
  }

  async getRuntimeStats(_runtimeHandle: string): Promise<RuntimeStats> {
    return { cpuPercent: 0, memoryUsageMb: 0, memoryLimitMb: 0 };
  }
  async listRuntimeProcesses(
    _runtimeHandle: string,
  ): Promise<RuntimeProcess[]> {
    return [];
  }

  private requireExec(execId: string): TestExecRecord {
    const record = this.execs.get(execId);
    if (!record) {
      throw new Error(`ACP test exec not found: ${execId}`);
    }
    return record;
  }

  private async resolveHostPath(
    guestPath: string,
    allowMissingLeaf: boolean,
  ): Promise<string> {
    if (!this.workspaceRoot) {
      throw new Error('ACP_TEST_SANDBOX_WORKSPACE_ROOT is required');
    }
    if (!isAbsolute(guestPath)) {
      throw new Error('guest path must be absolute');
    }
    const relativePath = relative(GUEST_WORKSPACE_ROOT, resolve(guestPath));
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error('guest path escapes workspace');
    }

    const root = await realpath(this.workspaceRoot);
    const candidate = resolve(root, relativePath);
    const targetToResolve = allowMissingLeaf ? dirname(candidate) : candidate;
    const resolvedTarget = await realpath(targetToResolve);
    const relativeTarget = relative(root, resolvedTarget);
    if (
      relativeTarget === '..' ||
      relativeTarget.startsWith(`..${sep}`) ||
      isAbsolute(relativeTarget)
    ) {
      throw new Error('guest path escapes workspace through symlink');
    }
    if (allowMissingLeaf) {
      try {
        const existing = await lstat(candidate);
        if (existing.isSymbolicLink()) {
          throw new Error('symlink write target is forbidden');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        await mkdir(dirname(candidate), { recursive: true });
      }
    }
    return candidate;
  }

  private toNodeSignal(signal: string): NodeJS.Signals {
    const normalized = signal.toUpperCase();
    if (normalized === 'KILL' || normalized === 'SIGKILL') {
      return 'SIGKILL';
    }
    if (normalized === 'INT' || normalized === 'SIGINT') {
      return 'SIGINT';
    }
    return 'SIGTERM';
  }
}

export const ACP_TEST_SANDBOX_RUNTIME_PROVIDER = {
  provide: SANDBOX_RUNTIME_DRIVER,
  inject: [FirecrackerRuntimeService],
  useFactory: (runtime: FirecrackerRuntimeService): SandboxRuntimeDriver =>
    process.env.ACP_TEST_FAKE_RUNTIME === '1'
      ? new AcpTestSandboxRuntime()
      : runtime,
};
