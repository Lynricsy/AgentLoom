import { EventEmitter } from 'node:events';
import type * as NodeCrypto from 'node:crypto';
import type * as NodeOs from 'node:os';
import type * as NodeFsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  spawn: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  randomUUID: vi.fn(() => 'fixed-id'),
}));

vi.mock('node:child_process', () => ({ spawn: hoisted.spawn }));
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeCrypto>()),
  randomUUID: hoisted.randomUUID,
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFsPromises>()),
  writeFile: hoisted.writeFile,
  unlink: hoisted.unlink,
  mkdir: hoisted.mkdir,
  rm: hoisted.rm,
}));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeOs>()),
  tmpdir: () => '/tmp',
}));

import { CodeExecutionService } from '../code-execution.service';

type ProcessPlan = {
  stdout?: Array<string | Buffer>;
  stderr?: Array<string | Buffer>;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error;
};

type MockChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function queueProcess(plan: ProcessPlan): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  hoisted.spawn.mockImplementationOnce(() => {
    queueMicrotask(() => {
      if (plan.error) {
        child.emit('error', plan.error);
        return;
      }
      for (const chunk of plan.stdout ?? []) {
        child.stdout.emit(
          'data',
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        );
      }
      for (const chunk of plan.stderr ?? []) {
        child.stderr.emit(
          'data',
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        );
      }
      child.emit('close', plan.code ?? 0, plan.signal ?? null);
    });
    return child;
  });
  return child;
}

const marked = (payload: unknown, prefix = '') =>
  `${prefix}__RESULT_START__${JSON.stringify(payload)}__RESULT_END__`;

describe('CodeExecutionService', () => {
  let service: CodeExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mkdir.mockResolvedValue(undefined);
    hoisted.writeFile.mockResolvedValue(undefined);
    hoisted.unlink.mockResolvedValue(undefined);
    hoisted.rm.mockResolvedValue(undefined);
    service = new CodeExecutionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['javascript', 'node', ['-e']],
    ['python', 'python3', ['/tmp/agentloom-code-fixed-id/script.py']],
    ['typescript', 'npx', ['tsx', '/tmp/agentloom-code-fixed-id/script.ts']],
  ] as const)(
    'executes %s and extracts wrapper output',
    async (language, command, leadingArgs) => {
      queueProcess({
        stdout: [
          marked({ output: { answer: 42 }, stdout: 'captured' }, 'printed\n'),
        ],
      });

      const result = await service.execute({
        language,
        code:
          language === 'python'
            ? 'output = input["value"]'
            : 'output = input.value;',
        input: { value: 42 },
        timeout: 7,
      });

      expect(result).toMatchObject({
        success: true,
        output: { answer: 42 },
        stdout: 'printed\ncaptured',
        stderr: '',
      });
      const [spawnCommand, args, options] = hoisted.spawn.mock.calls[0] as [
        string,
        string[],
        { timeout: number; cwd: string; env: Record<string, string> },
      ];
      expect(spawnCommand).toBe(command);
      expect(args.slice(0, leadingArgs.length)).toEqual(leadingArgs);
      expect(options).toMatchObject({
        timeout: 7_000,
        cwd: expect.any(String),
      });
      expect(options.env).not.toHaveProperty('APP_MINIO_SECRET_KEY');
    },
  );

  it('uses the default timeout and embeds null input in JavaScript wrapper', async () => {
    queueProcess({ stdout: [marked({ output: null, stdout: '' })] });

    await expect(
      service.execute({
        language: 'javascript',
        code: 'output = input;',
        input: undefined,
      }),
    ).resolves.toMatchObject({ success: true, output: null });

    expect(hoisted.spawn).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining([expect.stringContaining('const input = null;')]),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('writes TypeScript wrapper and cleans both temporary artifacts even when cleanup rejects', async () => {
    queueProcess({ stdout: [marked({ output: 'ok', stdout: '' })] });
    hoisted.unlink.mockRejectedValueOnce(new Error('already removed'));
    hoisted.rm.mockRejectedValueOnce(new Error('busy'));

    await expect(
      service.execute({
        language: 'typescript',
        code: 'output = "ok";',
        input: null,
      }),
    ).resolves.toMatchObject({ success: true, output: 'ok' });

    expect(hoisted.mkdir).toHaveBeenCalledWith('/tmp/agentloom-code-fixed-id', {
      recursive: true,
    });
    expect(hoisted.writeFile).toHaveBeenCalledWith(
      '/tmp/agentloom-code-fixed-id/script.ts',
      expect.stringContaining('output = "ok";'),
      'utf-8',
    );
    expect(hoisted.unlink).toHaveBeenCalled();
    expect(hoisted.rm).toHaveBeenCalledWith('/tmp/agentloom-code-fixed-id', {
      recursive: true,
      force: true,
    });
  });

  it('builds an indented Python wrapper with null input', async () => {
    queueProcess({ stdout: [marked({ output: null, stdout: '' })] });

    await service.execute({
      language: 'python',
      code: 'if True:\n    output = input',
      input: undefined,
    });

    expect(hoisted.writeFile).toHaveBeenCalledWith(
      '/tmp/agentloom-code-fixed-id/script.py',
      expect.stringMatching(
        /input = json\.loads\("null"\)[\s\S]* {4}if True:\n {8}output = input/,
      ),
      'utf-8',
    );
  });

  it('exports shell-escaped input and treats a final JSON line as Bash output', async () => {
    queueProcess({ stdout: ['diagnostic\n{"ok":true}\n'] });

    const result = await service.execute({
      language: 'bash',
      code: 'printf test',
      input: { value: "owner's" },
      timeout: 2,
    });

    expect(result).toMatchObject({
      success: true,
      output: { ok: true },
      stdout: 'diagnostic',
    });
    expect(hoisted.spawn).toHaveBeenCalledWith(
      'bash',
      ['-c', expect.stringContaining("owner'\\''s")],
      expect.objectContaining({ timeout: 2_000 }),
    );
  });

  it.each([
    ['plain text', 'plain text', null, 'plain text'],
    ['single JSON', '123', 123, ''],
    ['multiline JSON', 'before\n[1,2]', [1, 2], 'before'],
  ] as const)(
    'handles Bash output form %s',
    async (_case, stdout, output, visibleStdout) => {
      queueProcess({ stdout: [stdout] });
      await expect(
        service.execute({ language: 'bash', code: 'echo', input: null }),
      ).resolves.toMatchObject({
        success: true,
        output,
        stdout: visibleStdout,
      });
    },
  );

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'reports %s timeout with captured streams',
    async (signal) => {
      queueProcess({ stdout: ['partial'], stderr: ['stalled'], signal });
      await expect(
        service.execute({
          language: 'javascript',
          code: 'while(true){}',
          input: null,
          timeout: 3,
        }),
      ).resolves.toMatchObject({
        success: false,
        output: null,
        stdout: 'partial',
        stderr: 'stalled',
        error: '代码执行超时 (3s)',
      });
    },
  );

  it.each(['javascript', 'bash'] as const)(
    'reports non-zero %s exits using stderr',
    async (language) => {
      queueProcess({ stderr: ['syntax error'], code: 2 });
      await expect(
        service.execute({ language, code: 'bad', input: null }),
      ).resolves.toMatchObject({
        success: false,
        error: 'syntax error',
        stderr: 'syntax error',
      });
    },
  );

  it.each(['javascript', 'bash'] as const)(
    'falls back to exit code for silent %s failures',
    async (language) => {
      queueProcess({ code: 9 });
      await expect(
        service.execute({ language, code: 'bad', input: null }),
      ).resolves.toMatchObject({ success: false, error: '进程退出码: 9' });
    },
  );

  it.each(['javascript', 'bash'] as const)(
    'reports %s spawn errors',
    async (language) => {
      queueProcess({ error: new Error('ENOENT') });
      await expect(
        service.execute({ language, code: 'noop', input: null }),
      ).resolves.toMatchObject({
        success: false,
        output: null,
        stdout: '',
        stderr: '',
        error: '子进程启动失败: ENOENT',
      });
    },
  );

  it('drops stream chunks after the output cap', async () => {
    queueProcess({
      stdout: [Buffer.alloc(10 * 1024 * 1024 + 1, 97)],
      stderr: [Buffer.alloc(10 * 1024 * 1024 + 1, 98)],
      code: 1,
    });

    await expect(
      service.execute({ language: 'javascript', code: 'noop', input: null }),
    ).resolves.toMatchObject({
      success: false,
      stdout: '',
      stderr: '',
      error: '进程退出码: 1',
    });
  });

  it.each([
    ['', null, ''],
    ['prefix only __RESULT_START__', null, 'prefix only __RESULT_START__'],
    [
      '__RESULT_END____RESULT_START__{}',
      null,
      '__RESULT_END____RESULT_START__{}',
    ],
    [
      '__RESULT_START__not-json__RESULT_END__',
      null,
      '__RESULT_START__not-json__RESULT_END__',
    ],
  ] as const)(
    'preserves malformed structured output %j',
    async (stdout, output, visibleStdout) => {
      queueProcess({ stdout: [stdout] });
      await expect(
        service.execute({ language: 'javascript', code: 'noop', input: null }),
      ).resolves.toMatchObject({
        success: true,
        output,
        stdout: visibleStdout,
      });
    },
  );

  it.each([
    [marked(17), 17, ''],
    [marked({ value: true }, 'prefix'), { value: true }, 'prefix'],
    [marked({ output: 'value', stdout: null }), 'value', ''],
    [marked({ output: 'value', stdout: 'captured' }), 'value', 'captured'],
  ] as const)(
    'extracts structured payload variant %#',
    async (stdout, output, visibleStdout) => {
      queueProcess({ stdout: [stdout] });
      await expect(
        service.execute({ language: 'javascript', code: 'noop', input: null }),
      ).resolves.toMatchObject({
        success: true,
        output,
        stdout: visibleStdout,
      });
    },
  );

  it('returns an observable error for an unsupported language', async () => {
    await expect(
      service.execute({
        language: 'ruby' as never,
        code: 'puts 1',
        input: null,
      }),
    ).resolves.toMatchObject({
      success: false,
      output: null,
      stdout: '',
      stderr: '',
      error: '不支持的语言: ruby',
    });
    expect(hoisted.spawn).not.toHaveBeenCalled();
  });

  it('forwards only defined safe environment variables', async () => {
    const keys = ['PATH', 'HOME', 'LANG', 'TERM', 'PYTHONPATH'] as const;
    const original = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    for (const key of keys) delete process.env[key];
    queueProcess({ stdout: [marked({ output: null, stdout: '' })] });

    try {
      await service.execute({
        language: 'javascript',
        code: 'noop',
        input: null,
      });
      const options = hoisted.spawn.mock.calls[0]?.[2] as {
        env: Record<string, string>;
      };
      expect(options.env).toEqual({});
    } finally {
      for (const key of keys) {
        const value = original[key];
        if (value !== undefined) process.env[key] = value;
      }
    }
  });
});
