/// <reference path="./text-modules.d.ts" />
/**
 * 持久 Python 内核：每会话一个 runner.py 子进程（经 ctx.subprocess 启动），
 * stdin/stdout 走 NDJSON 协议（见 runner.py 文件头）。同一时间只执行一个 cell；
 * 超时先发 interrupt（runner 内对主线程 SIGINT），5 s 内无结果则终止进程，
 * 下次调用自动重启并在结果里注明。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import runnerSource from './runner.py';

/** runner 启动握手（ready）上限 */
export const KERNEL_READY_TIMEOUT_MS = 10_000;
/** interrupt 发出后等待 result 的宽限 */
export const KERNEL_INTERRUPT_GRACE_MS = 5_000;
/** 输出上限（字符） */
export const STDOUT_MAX_CHARS = 50_000;
export const STDERR_MAX_CHARS = 10_000;
const KERNEL_STDERR_MAX_BYTES = 65_536;
const KERNEL_EXIT_WAIT_MS = 2_000;

export const INTERRUPTED_MESSAGE = 'Execution interrupted (timeout)';

/** 内核需要的 subprocess 能力子集（ctx.subprocess 的结构子集，测试可替换） */
export interface KernelSubprocess {
  resolveExecutable(command: string): Promise<string>;
  spawn(spec: SubprocessSpawnSpec): SubprocessHandle;
}

export interface EvalKernelOptions {
  subprocess: () => KernelSubprocess;
  pythonPath: string;
  workdir: string;
  stateDir: string;
  /** 子进程额外环境变量（工具回环地址与令牌），每次启动内核时取 */
  env: () => Promise<Record<string, string>>;
}

/** 一个 cell 的执行结果 */
export interface CellOutcome {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** 末尾表达式非 None 时的 repr */
  value?: string;
  /** 失败时的 traceback / 中断说明 */
  error?: string;
  /** show() 写出的图片绝对路径 */
  images: string[];
  /** 上一个内核意外退出或被终止，本次在新内核中执行（之前的变量已丢失） */
  restarted: boolean;
}

/** 只保留前 maxChars 个字符并统计总长，截断提示与 capText 同形 */
class BoundedText {
  private head = '';
  private total = 0;

  constructor(
    private readonly maxChars: number,
    private readonly label: string,
  ) {}

  append(text: string): void {
    this.total += text.length;
    if (this.head.length < this.maxChars) {
      this.head += text.slice(0, this.maxChars - this.head.length);
    }
  }

  toString(): string {
    if (this.total <= this.maxChars) return this.head;
    return `${this.head}…[${this.label} truncated, ${this.total - this.maxChars} chars omitted]`;
  }
}

/** runner 回报的 cell 结果（输出由 PendingCell 累积） */
interface CellResult {
  ok: boolean;
  value?: string;
  error?: string;
  images: string[];
}

interface PendingCell {
  id: string;
  stdout: BoundedText;
  stderr: BoundedText;
  settle(result: CellResult): void;
}

interface RunningKernel {
  handle: SubprocessHandle;
  ready: Promise<void>;
  exited: boolean;
  pending?: PendingCell;
}

type RunnerMessage =
  | { type: 'ready' }
  | { type: 'stream'; id: string; name: 'stdout' | 'stderr'; text: string }
  | { type: 'result'; id: string; ok: boolean; value?: string | null; error?: string; images?: string[] };

export class EvalKernel {
  private kernel: RunningKernel | undefined;
  /** 内核曾意外退出 / 被终止，下一次启动需在结果里注明 */
  private lostState = false;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: EvalKernelOptions) {}

  /** 排队执行一个 cell（单飞） */
  execute(code: string, timeoutSeconds: number, signal: AbortSignal): Promise<CellOutcome> {
    const run = this.queue.then(() => this.runCell(code, timeoutSeconds, signal));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** 丢弃当前内核状态，下次调用启动全新内核 */
  reset(): Promise<void> {
    const run = this.queue.then(() => {
      this.stopKernel();
      this.lostState = false;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const kernel = this.kernel;
    if (!kernel || kernel.exited) return;
    this.kernel = undefined;
    kernel.handle.stdin?.end(`${JSON.stringify({ type: 'exit' })}\n`);
    const exited = await kernel.handle.waitForExit(AbortSignal.timeout(KERNEL_EXIT_WAIT_MS)).catch(() => false);
    if (!exited) kernel.handle.terminate();
  }

  private async runCell(code: string, timeoutSeconds: number, signal: AbortSignal): Promise<CellOutcome> {
    if (this.disposed) throw new Error('eval kernel is disposed');
    signal.throwIfAborted();
    const restarted = !this.kernel && this.lostState;
    const kernel = await this.ensureKernel();
    this.lostState = false;

    const id = randomUUID();
    const stdout = new BoundedText(STDOUT_MAX_CHARS, 'stdout');
    const stderr = new BoundedText(STDERR_MAX_CHARS, 'stderr');
    const { promise, resolve } = Promise.withResolvers<CellResult>();
    let interruptTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;
    const finish = (value: CellResult) => {
      clearTimeout(interruptTimer);
      clearTimeout(graceTimer);
      signal.removeEventListener('abort', interrupt);
      if (kernel.pending?.id === id) kernel.pending = undefined;
      resolve(value);
    };
    const interrupt = () => {
      if (graceTimer) return;
      clearTimeout(interruptTimer);
      this.send(kernel, { type: 'interrupt', id });
      graceTimer = setTimeout(() => {
        // 用户代码吞掉了 KeyboardInterrupt 或卡在不可中断的调用里：终止内核
        this.stopKernel();
        this.lostState = true;
        finish({
          ok: false,
          error: `${INTERRUPTED_MESSAGE}; the kernel did not stop within ${KERNEL_INTERRUPT_GRACE_MS / 1000}s and was terminated (state lost, it restarts on the next call)`,
          images: [],
        });
      }, KERNEL_INTERRUPT_GRACE_MS);
    };
    kernel.pending = { id, stdout, stderr, settle: finish };
    interruptTimer = setTimeout(interrupt, timeoutSeconds * 1000);
    signal.addEventListener('abort', interrupt, { once: true });
    this.send(kernel, { type: 'exec', id, code, cwd: this.options.workdir });
    const result = await promise;
    return {
      ok: result.ok,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      ...(result.value === undefined ? {} : { value: result.value }),
      ...(result.error === undefined ? {} : { error: result.error }),
      images: result.images,
      restarted,
    };
  }

  private async ensureKernel(): Promise<RunningKernel> {
    if (this.kernel && !this.kernel.exited) {
      await this.kernel.ready;
      return this.kernel;
    }
    const { subprocess, pythonPath, workdir, stateDir } = this.options;
    const runtime = subprocess();
    let python: string;
    try {
      python = await runtime.resolveExecutable(pythonPath);
    } catch (error) {
      throw new Error(`Python interpreter not found: ${pythonPath} (${errorMessage(error)})`);
    }
    await mkdir(stateDir, { recursive: true });
    const runnerPath = path.join(stateDir, 'runner.py');
    await writeFile(runnerPath, runnerSource, { mode: 0o600 });

    const extraEnv = await this.options.env();
    const handle = runtime.spawn({
      argv: [python, '-u', runnerPath],
      cwd: workdir,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: KERNEL_STDERR_MAX_BYTES } },
      graceMs: 3000,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        // 无显示环境：matplotlib 用非交互后端，figure 经 show() 输出
        MPLBACKEND: 'Agg',
        HOME: process.env.HOME ?? '/root',
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        ...extraEnv,
      },
    });
    const { promise: ready, resolve: markReady, reject: failReady } = Promise.withResolvers<void>();
    const kernel: RunningKernel = { handle, ready, exited: false };
    this.kernel = kernel;
    // stdin 在进程退出后写入会 EPIPE；退出由 done 处理
    handle.stdin?.on('error', () => undefined);

    const onExit = (detail: string) => {
      if (kernel.exited) return;
      kernel.exited = true;
      if (this.kernel === kernel) this.kernel = undefined;
      const stderrTail = handle.collected.stderr?.readFrom(0).text.trim() ?? '';
      const message = `Python kernel exited unexpectedly (${detail})${stderrTail ? `:\n${stderrTail.slice(-4000)}` : ''}`;
      failReady(new Error(message));
      const pending = kernel.pending;
      if (pending) {
        this.lostState = true;
        pending.settle({ ok: false, error: `${message}\n(state lost, the kernel restarts on the next call)`, images: [] });
      } else if (!this.disposed) {
        this.lostState = true;
      }
    };
    handle.done.then(
      (outcome) => onExit(outcome.signal ? `signal ${outcome.signal}` : `exit code ${outcome.exitCode}`),
      (error: unknown) => onExit(errorMessage(error)),
    );

    if (handle.stdout) {
      const lines = createInterface({ input: handle.stdout, crlfDelay: Infinity });
      lines.on('line', (line) => {
        const message = parseRunnerMessage(line);
        if (!message) return;
        if (message.type === 'ready') {
          markReady();
          return;
        }
        const pending = kernel.pending;
        if (!pending || pending.id !== message.id) return;
        if (message.type === 'stream') {
          (message.name === 'stderr' ? pending.stderr : pending.stdout).append(message.text);
          return;
        }
        pending.settle({
          ok: message.ok,
          ...(typeof message.value === 'string' ? { value: message.value } : {}),
          ...(typeof message.error === 'string' ? { error: message.error } : {}),
          images: Array.isArray(message.images) ? message.images.filter((p) => typeof p === 'string') : [],
        });
      });
    }

    const readyTimer = setTimeout(() => {
      failReady(new Error(`Python kernel did not become ready within ${KERNEL_READY_TIMEOUT_MS / 1000}s`));
    }, KERNEL_READY_TIMEOUT_MS);
    try {
      await ready;
    } catch (error) {
      if (this.kernel === kernel) this.stopKernel();
      throw error;
    } finally {
      clearTimeout(readyTimer);
    }
    return kernel;
  }

  /** 终止当前内核（不改 lostState，由调用方决定是否提示重启） */
  private stopKernel(): void {
    const kernel = this.kernel;
    this.kernel = undefined;
    if (!kernel || kernel.exited) return;
    kernel.exited = true;
    kernel.handle.terminate();
  }

  private send(kernel: RunningKernel, message: Record<string, unknown>): void {
    if (kernel.exited) return;
    kernel.handle.stdin?.write(`${JSON.stringify(message)}\n`);
  }
}

function parseRunnerMessage(line: string): RunnerMessage | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null || !('type' in value)) return undefined;
    // runner.py 是本插件自带的协议对端，按 type 分派即可
    return value.type === 'ready' || value.type === 'stream' || value.type === 'result'
      ? (value as RunnerMessage)
      : undefined;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
