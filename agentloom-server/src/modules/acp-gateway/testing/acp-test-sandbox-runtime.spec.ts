import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SANDBOX_RUNTIME_DRIVER } from '../../sandbox/sandbox-runtime-driver.port';
import {
  ACP_TEST_SANDBOX_RUNTIME_PROVIDER,
  AcpTestSandboxRuntime,
} from './acp-test-sandbox-runtime';

const roots: string[] = [];
const originalRoot = process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT;
const originalFakeRuntime = process.env.ACP_TEST_FAKE_RUNTIME;

async function createRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'acp-test-runtime-'));
  roots.push(root);
  process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT = root;
  return { root, runtime: new AcpTestSandboxRuntime() };
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalRoot === undefined)
    delete process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT;
  else process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT = originalRoot;
  if (originalFakeRuntime === undefined)
    delete process.env.ACP_TEST_FAKE_RUNTIME;
  else process.env.ACP_TEST_FAKE_RUNTIME = originalFakeRuntime;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('AcpTestSandboxRuntime', () => {
  it('实现稳定的 sandbox 生命周期、检查、guest fallback 和统计协议', async () => {
    const { runtime } = await createRuntime();
    await expect(
      runtime.createRuntime('session-1', {} as never),
    ).resolves.toEqual({ runtimeHandle: 'session-1' });
    await expect(runtime.startRuntime('session-1')).resolves.toBeUndefined();
    await expect(runtime.stopRuntime('session-1')).resolves.toBeUndefined();
    await expect(runtime.deleteRuntime('session-1')).resolves.toBeUndefined();
    await expect(runtime.healthCheck('session-1')).resolves.toBe(true);
    await expect(runtime.inspectRuntime('session-1')).resolves.toEqual({
      state: 'running',
    });
    const response = await runtime.requestGuest('session-1', '/v1/prompt');
    expect(response.status).toBe(501);
    await expect(
      runtime.attachLogs('session-1', vi.fn()),
    ).resolves.toBeUndefined();
    await expect(runtime.getRuntimeStats('session-1')).resolves.toEqual({
      cpuPercent: 0,
      memoryUsageMb: 0,
      memoryLimitMb: 0,
    });
    await expect(runtime.listRuntimeProcesses('session-1')).resolves.toEqual(
      [],
    );
    await expect(runtime.getArchive('session-1', '/workspace')).rejects.toThrow(
      'does not provide archives',
    );
    await expect(
      runtime.putArchive('session-1', Readable.from('x'), '/workspace'),
    ).rejects.toThrow('does not provide archives');
  });

  it('读写 workspace 文本并执行字节上限、文件类型和目标校验', async () => {
    const { root, runtime } = await createRuntime();
    await mkdir(join(root, 'notes'));
    await writeFile(join(root, 'notes', 'small.txt'), '你好', 'utf8');

    await expect(
      runtime.readTextFile('runtime', '/workspace/notes/small.txt', 6),
    ).resolves.toEqual(Buffer.from('你好'));
    await expect(
      runtime.readTextFile('runtime', '/workspace/notes/small.txt', 5),
    ).rejects.toThrow('413 file too large');
    await expect(
      runtime.readTextFile('runtime', '/workspace/notes', 100),
    ).rejects.toThrow('404 file not found');
    await expect(
      runtime.readTextFile('runtime', '/workspace/notes/missing.txt', 100),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(
      runtime.validateTextFileWrite('runtime', '/workspace/notes/new.txt', 10),
    ).resolves.toBeUndefined();
    await runtime.writeTextFile(
      'runtime',
      '/workspace/notes/new.txt',
      'written',
      7,
    );
    expect(await readFile(join(root, 'notes', 'new.txt'), 'utf8')).toBe(
      'written',
    );
    await expect(
      runtime.writeTextFile('runtime', '/workspace/notes/large.txt', 'éé', 3),
    ).rejects.toThrow('413 content too large');
  });

  it.each([
    ['relative path', 'notes/file.txt', 'guest path must be absolute'],
    [
      'parent traversal',
      '/workspace/../secret.txt',
      'guest path escapes workspace',
    ],
    [
      'different absolute root',
      '/tmp/secret.txt',
      'guest path escapes workspace',
    ],
  ])('拒绝越界 guest path: %s', async (_label, path, message) => {
    const { runtime } = await createRuntime();
    await expect(runtime.readTextFile('runtime', path, 100)).rejects.toThrow(
      message,
    );
    await expect(
      runtime.validateTextFileWrite('runtime', path, 100),
    ).rejects.toThrow(message);
  });

  it('未配置 host workspace 时 fail closed', async () => {
    delete process.env.ACP_TEST_SANDBOX_WORKSPACE_ROOT;
    const runtime = new AcpTestSandboxRuntime();
    await expect(
      runtime.readTextFile('runtime', '/workspace/file.txt', 10),
    ).rejects.toThrow('ACP_TEST_SANDBOX_WORKSPACE_ROOT is required');
  });

  it('拒绝通过目录 symlink 逃逸和向 symlink leaf 写入', async () => {
    const { root, runtime } = await createRuntime();
    const outside = await mkdtemp(join(tmpdir(), 'acp-test-outside-'));
    roots.push(outside);
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(outside, join(root, 'escape'));
    await symlink(join(outside, 'secret.txt'), join(root, 'linked.txt'));

    await expect(
      runtime.readTextFile('runtime', '/workspace/escape/secret.txt', 100),
    ).rejects.toThrow('guest path escapes workspace through symlink');
    await expect(
      runtime.validateTextFileWrite(
        'runtime',
        '/workspace/escape/new.txt',
        100,
      ),
    ).rejects.toThrow('guest path escapes workspace through symlink');
    await expect(
      runtime.writeTextFile(
        'runtime',
        '/workspace/linked.txt',
        'overwrite',
        100,
      ),
    ).rejects.toThrow('symlink write target is forbidden');
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('执行 node 命令，解析有效 env、忽略非法 env，并向已订阅及后订阅观察者重放 stdout/stderr', async () => {
    const { root, runtime } = await createRuntime();
    const { execId } = await runtime.createExec('runtime', {
      command: 'node',
      args: [
        '-e',
        "process.stdout.write(process.env.ACP_VISIBLE ?? ''); process.stderr.write(process.env.ACP_IGNORED ?? 'missing')",
      ],
      cwd: '/workspace',
      env: ['ACP_VISIBLE=left=right', '=ACP_IGNORED=bad', 'NO_SEPARATOR'],
    });
    const live: Array<[string, string]> = [];
    await runtime.attachExecOutput(execId, (level, text) =>
      live.push([level, text]),
    );
    const exit = await runtime.waitForExecExit(execId);

    expect(exit).toMatchObject({ running: false, exitCode: 0 });
    expect(exit.pid).toEqual(expect.any(Number));
    expect(live).toEqual(
      expect.arrayContaining([
        ['stdout', 'left=right'],
        ['stderr', 'missing'],
      ]),
    );
    const replayed: Array<[string, string]> = [];
    await runtime.attachExecOutput(execId, (level, text) =>
      replayed.push([level, text]),
    );
    expect(replayed).toEqual(live);
    await expect(runtime.waitForExecExit(execId)).resolves.toMatchObject({
      running: false,
      exitCode: 0,
    });
    expect(root).toEqual(expect.any(String));
  });

  it('使用默认 cwd，拒绝非目录 cwd，并将 spawn error 映射为 stderr 与 127', async () => {
    const { root, runtime } = await createRuntime();
    await writeFile(join(root, 'file.txt'), 'x');
    await expect(
      runtime.createExec('runtime', {
        command: 'node',
        args: ['-e', '0'],
        cwd: '/workspace/file.txt',
      }),
    ).rejects.toThrow('terminal cwd is not a directory');

    const missing = await runtime.createExec('runtime', {
      command: `acp-command-that-does-not-exist-${Date.now()}`,
    });
    const output: Array<[string, string]> = [];
    await runtime.attachExecOutput(missing.execId, (level, text) =>
      output.push([level, text]),
    );
    await expect(
      runtime.waitForExecExit(missing.execId),
    ).resolves.toMatchObject({ running: false, exitCode: 127 });
    expect(
      output.some(([level, text]) => level === 'stderr' && text.length > 0),
    ).toBe(true);
  });

  it.each([
    ['KILL', 'SIGKILL'],
    ['sigkill', 'SIGKILL'],
    ['INT', 'SIGINT'],
    ['sigint', 'SIGINT'],
    ['TERM', 'SIGTERM'],
    ['unexpected', 'SIGTERM'],
  ])(
    'killExec 将 %s 规范化为 %s，退出后不重复 kill',
    async (input, expected) => {
      const { runtime } = await createRuntime();
      const { execId } = await runtime.createExec('runtime', {
        command: 'node',
        args: ['-e', 'setInterval(() => {}, 1000)'],
      });
      const record = (
        runtime as unknown as {
          execs: Map<
            string,
            { child: { kill: (signal: string) => boolean }; running: boolean }
          >;
        }
      ).execs.get(execId)!;
      const kill = vi.spyOn(record.child, 'kill');
      await runtime.killExec(execId, input);
      expect(kill).toHaveBeenCalledWith(expected);
      await runtime.waitForExecExit(execId);
      kill.mockClear();
      await runtime.killExec(execId, input);
      expect(kill).not.toHaveBeenCalled();
    },
  );

  it('未知 exec id 的 output/wait/kill 均返回一致错误', async () => {
    const { runtime } = await createRuntime();
    await expect(runtime.attachExecOutput('missing', vi.fn())).rejects.toThrow(
      'ACP test exec not found: missing',
    );
    await expect(runtime.waitForExecExit('missing')).rejects.toThrow(
      'ACP test exec not found: missing',
    );
    await expect(runtime.killExec('missing')).rejects.toThrow(
      'ACP test exec not found: missing',
    );
  });

  it('runtime provider 只在显式 fake 标志下替换真实 driver', () => {
    const realRuntime = { real: true } as never;
    expect(ACP_TEST_SANDBOX_RUNTIME_PROVIDER.provide).toBe(
      SANDBOX_RUNTIME_DRIVER,
    );
    delete process.env.ACP_TEST_FAKE_RUNTIME;
    expect(ACP_TEST_SANDBOX_RUNTIME_PROVIDER.useFactory(realRuntime)).toBe(
      realRuntime,
    );
    process.env.ACP_TEST_FAKE_RUNTIME = '0';
    expect(ACP_TEST_SANDBOX_RUNTIME_PROVIDER.useFactory(realRuntime)).toBe(
      realRuntime,
    );
    process.env.ACP_TEST_FAKE_RUNTIME = '1';
    expect(
      ACP_TEST_SANDBOX_RUNTIME_PROVIDER.useFactory(realRuntime),
    ).toBeInstanceOf(AcpTestSandboxRuntime);
  });
});
