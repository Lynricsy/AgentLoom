import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 代码执行结果 */
export interface CodeExecutionResult {
  success: boolean;
  /** 解析后的 output 变量值 */
  output: unknown;
  /** 捕获的标准输出 */
  stdout: string;
  /** 捕获的错误输出 */
  stderr: string;
  /** 执行耗时（毫秒） */
  executionTimeMs: number;
  /** 失败时的错误消息 */
  error?: string;
}

export interface CodeExecutionParams {
  language: 'typescript' | 'javascript' | 'python' | 'bash';
  code: string;
  input: unknown;
  /** 超时时间（秒），默认 30 */
  timeout?: number;
}

/** 结果标记，用于从 stdout 中提取结构化输出 */
const RESULT_START_MARKER = '__RESULT_START__';
const RESULT_END_MARKER = '__RESULT_END__';

/** 最大输出缓冲区大小（10MB） */
const MAX_BUFFER = 10 * 1024 * 1024;

/** 默认超时时间（秒） */
const DEFAULT_TIMEOUT_SEC = 30;

/** 安全的子进程环境变量：仅保留必要的路径变量 */
function buildCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.LANG) env.LANG = process.env.LANG;
  if (process.env.TERM) env.TERM = process.env.TERM;
  // Python 需要
  if (process.env.PYTHONPATH) env.PYTHONPATH = process.env.PYTHONPATH;
  return env;
}

@Injectable()
export class CodeExecutionService {
  private readonly logger = new Logger(CodeExecutionService.name);

  async execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
    const { language, code, input, timeout } = params;
    const timeoutSec = timeout ?? DEFAULT_TIMEOUT_SEC;
    const startTime = Date.now();

    this.logger.debug(`开始执行 ${language} 代码，超时时间: ${timeoutSec}s`);

    switch (language) {
      case 'javascript':
        return this.executeJavaScript(code, input, timeoutSec, startTime);
      case 'typescript':
        return this.executeTypeScript(code, input, timeoutSec, startTime);
      case 'python':
        return this.executePython(code, input, timeoutSec, startTime);
      case 'bash':
        return this.executeBash(code, input, timeoutSec, startTime);
      default:
        return {
          success: false,
          output: null,
          stdout: '',
          stderr: '',
          executionTimeMs: Date.now() - startTime,
          error: `不支持的语言: ${language as string}`,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // JavaScript
  // ---------------------------------------------------------------------------

  private async executeJavaScript(
    userCode: string,
    input: unknown,
    timeoutSec: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const wrapperCode = this.buildJsWrapper(userCode, input);
    return this.spawnProcess(
      'node',
      ['-e', wrapperCode],
      timeoutSec,
      startTime,
    );
  }

  // ---------------------------------------------------------------------------
  // TypeScript
  // ---------------------------------------------------------------------------

  private async executeTypeScript(
    userCode: string,
    input: unknown,
    timeoutSec: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const wrapperCode = this.buildJsWrapper(userCode, input);
    const tmpDir = join(tmpdir(), `agentloom-code-${randomUUID()}`);
    const tmpFile = join(tmpDir, 'script.ts');

    try {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(tmpFile, wrapperCode, 'utf-8');
      return await this.spawnProcess(
        'npx',
        ['tsx', tmpFile],
        timeoutSec,
        startTime,
        tmpDir,
      );
    } finally {
      await this.cleanupTempFile(tmpFile);
      await this.cleanupTempDir(tmpDir);
    }
  }

  // ---------------------------------------------------------------------------
  // Python
  // ---------------------------------------------------------------------------

  private async executePython(
    userCode: string,
    input: unknown,
    timeoutSec: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const inputJson = JSON.stringify(input ?? null);
    // 对用户代码进行缩进以放入 try 块中
    const indentedCode = userCode
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');

    const wrapperCode = [
      'import json, sys',
      `input = json.loads(${JSON.stringify(inputJson)})`,
      'output = None',
      '__stdout_parts = []',
      '__orig_print = print',
      'def print(*args, **kwargs):',
      '    __stdout_parts.append(" ".join(str(a) for a in args))',
      '    __orig_print(*args, **kwargs)',
      'try:',
      indentedCode,
      'except Exception as __e:',
      '    sys.stderr.write(str(__e))',
      '    sys.exit(1)',
      `sys.stdout.write('\\n${RESULT_START_MARKER}' + json.dumps({"output": output, "stdout": "\\n".join(__stdout_parts)}) + '${RESULT_END_MARKER}')`,
    ].join('\n');

    const tmpDir = join(tmpdir(), `agentloom-code-${randomUUID()}`);
    const tmpFile = join(tmpDir, 'script.py');

    try {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(tmpFile, wrapperCode, 'utf-8');
      return await this.spawnProcess(
        'python3',
        [tmpFile],
        timeoutSec,
        startTime,
        tmpDir,
      );
    } finally {
      await this.cleanupTempFile(tmpFile);
      await this.cleanupTempDir(tmpDir);
    }
  }

  // ---------------------------------------------------------------------------
  // Bash
  // ---------------------------------------------------------------------------

  private async executeBash(
    userCode: string,
    input: unknown,
    timeoutSec: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    const inputJson = JSON.stringify(input ?? null);
    const wrapperCode = [
      `export INPUT=${this.shellEscape(inputJson)}`,
      userCode,
    ].join('\n');

    return this.spawnBashProcess(wrapperCode, timeoutSec, startTime);
  }

  // ---------------------------------------------------------------------------
  // JS/TS 包装器
  // ---------------------------------------------------------------------------

  private buildJsWrapper(userCode: string, input: unknown): string {
    const inputJson = JSON.stringify(input ?? null);
    return [
      `const input = ${inputJson};`,
      'let output = undefined;',
      'const __stdout_parts = [];',
      'const __origLog = console.log;',
      'console.log = (...args) => { __stdout_parts.push(args.map(String).join(" ")); __origLog(...args); };',
      userCode,
      `process.stdout.write('\\n${RESULT_START_MARKER}' + JSON.stringify({ output, stdout: __stdout_parts.join('\\n') }) + '${RESULT_END_MARKER}');`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // 子进程执行（通用：JS/TS/Python）
  // ---------------------------------------------------------------------------

  private spawnProcess(
    command: string,
    args: string[],
    timeoutSec: number,
    startTime: number,
    cwd?: string,
  ): Promise<CodeExecutionResult> {
    const execCwd = cwd ?? tmpdir();

    return new Promise<CodeExecutionResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: execCwd,
        timeout: timeoutSec * 1000,
        env: buildCleanEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        // 不继承文件描述符
        detached: false,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalStdout = 0;
      let totalStderr = 0;

      child.stdout.on('data', (chunk: Buffer) => {
        totalStdout += chunk.length;
        if (totalStdout <= MAX_BUFFER) {
          stdoutChunks.push(chunk);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        totalStderr += chunk.length;
        if (totalStderr <= MAX_BUFFER) {
          stderrChunks.push(chunk);
        }
      });

      child.on('close', (code, signal) => {
        const executionTimeMs = Date.now() - startTime;
        const rawStdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const rawStderr = Buffer.concat(stderrChunks).toString('utf-8');

        // 超时检测
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          resolve({
            success: false,
            output: null,
            stdout: rawStdout,
            stderr: rawStderr,
            executionTimeMs,
            error: `代码执行超时 (${timeoutSec}s)`,
          });
          return;
        }

        // 非零退出码
        if (code !== 0 && code !== null) {
          resolve({
            success: false,
            output: null,
            stdout: rawStdout,
            stderr: rawStderr,
            executionTimeMs,
            error: rawStderr || `进程退出码: ${code}`,
          });
          return;
        }

        // 解析结构化输出
        const parsed = this.parseStructuredOutput(rawStdout);
        resolve({
          success: true,
          output: parsed.output,
          stdout: parsed.stdout,
          stderr: rawStderr,
          executionTimeMs,
        });
      });

      child.on('error', (err) => {
        const executionTimeMs = Date.now() - startTime;
        resolve({
          success: false,
          output: null,
          stdout: '',
          stderr: '',
          executionTimeMs,
          error: `子进程启动失败: ${err.message}`,
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Bash 子进程（特殊处理：stdout 即结果）
  // ---------------------------------------------------------------------------

  private spawnBashProcess(
    script: string,
    timeoutSec: number,
    startTime: number,
  ): Promise<CodeExecutionResult> {
    return new Promise<CodeExecutionResult>((resolve) => {
      const child = spawn('bash', ['-c', script], {
        cwd: tmpdir(),
        timeout: timeoutSec * 1000,
        env: buildCleanEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalStdout = 0;
      let totalStderr = 0;

      child.stdout.on('data', (chunk: Buffer) => {
        totalStdout += chunk.length;
        if (totalStdout <= MAX_BUFFER) {
          stdoutChunks.push(chunk);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        totalStderr += chunk.length;
        if (totalStderr <= MAX_BUFFER) {
          stderrChunks.push(chunk);
        }
      });

      child.on('close', (code, signal) => {
        const executionTimeMs = Date.now() - startTime;
        const rawStdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const rawStderr = Buffer.concat(stderrChunks).toString('utf-8');

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          resolve({
            success: false,
            output: null,
            stdout: rawStdout,
            stderr: rawStderr,
            executionTimeMs,
            error: `代码执行超时 (${timeoutSec}s)`,
          });
          return;
        }

        if (code !== 0 && code !== null) {
          resolve({
            success: false,
            output: null,
            stdout: rawStdout,
            stderr: rawStderr,
            executionTimeMs,
            error: rawStderr || `进程退出码: ${code}`,
          });
          return;
        }

        // Bash 特殊处理：最后一行如果是合法 JSON 则作为 output
        const trimmed = rawStdout.trimEnd();
        const lastNewline = trimmed.lastIndexOf('\n');
        const lastLine =
          lastNewline >= 0 ? trimmed.slice(lastNewline + 1) : trimmed;
        const stdoutContent =
          lastNewline >= 0 ? trimmed.slice(0, lastNewline) : '';

        let output: unknown = null;
        try {
          output = JSON.parse(lastLine);
        } catch {
          // 最后一行不是 JSON，整个 stdout 作为结果
          resolve({
            success: true,
            output: null,
            stdout: rawStdout.trimEnd(),
            stderr: rawStderr,
            executionTimeMs,
          });
          return;
        }

        resolve({
          success: true,
          output,
          stdout: stdoutContent,
          stderr: rawStderr,
          executionTimeMs,
        });
      });

      child.on('error', (err) => {
        const executionTimeMs = Date.now() - startTime;
        resolve({
          success: false,
          output: null,
          stdout: '',
          stderr: '',
          executionTimeMs,
          error: `子进程启动失败: ${err.message}`,
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 输出解析
  // ---------------------------------------------------------------------------

  /**
   * 从 stdout 中提取 __RESULT_START__...__RESULT_END__ 之间的结构化结果。
   * 标记之前的部分视为"真正的 stdout"。
   */
  private parseStructuredOutput(rawStdout: string): {
    output: unknown;
    stdout: string;
  } {
    const startIdx = rawStdout.lastIndexOf(RESULT_START_MARKER);
    const endIdx = rawStdout.lastIndexOf(RESULT_END_MARKER);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      // 未找到标记，将 stdout 原样返回
      return { output: null, stdout: rawStdout.trimEnd() };
    }

    const jsonStr = rawStdout.slice(
      startIdx + RESULT_START_MARKER.length,
      endIdx,
    );
    const realStdout = rawStdout.slice(0, startIdx).trimEnd();

    try {
      const parsed: unknown = JSON.parse(jsonStr);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'output' in parsed &&
        'stdout' in parsed
      ) {
        const result = parsed as { output: unknown; stdout: string };
        // 优先使用包装器捕获的 stdout（更准确），但如果标记之前有内容则合并
        const capturedStdout = result.stdout ?? '';
        const combinedStdout = realStdout
          ? `${realStdout}\n${capturedStdout}`
          : capturedStdout;
        return { output: result.output, stdout: combinedStdout };
      }
      return { output: parsed, stdout: realStdout };
    } catch {
      this.logger.warn('代码执行结果 JSON 解析失败，返回原始 stdout');
      return { output: null, stdout: rawStdout.trimEnd() };
    }
  }

  // ---------------------------------------------------------------------------
  // 工具方法
  // ---------------------------------------------------------------------------

  /** Shell 转义：用单引号包裹，内部单引号替换为 '\'' */
  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // 忽略清理失败
    }
  }

  private async cleanupTempDir(dirPath: string): Promise<void> {
    try {
      await rm(dirPath, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  }
}
