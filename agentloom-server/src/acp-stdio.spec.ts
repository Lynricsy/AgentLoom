import type * as NestCoreModule from '@nestjs/core';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

const { createApplicationContext, createInterfaceMock } = vi.hoisted(() => ({
  createApplicationContext: vi.fn(),
  createInterfaceMock: vi.fn(),
}));

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof NestCoreModule>();
  return {
    ...actual,
    NestFactory: {
      ...actual.NestFactory,
      createApplicationContext,
    },
  };
});
vi.mock('node:readline', () => ({
  createInterface: createInterfaceMock,
}));

const REQUIRED_ENV = {
  APP_DEPLOYMENT_MODE: 'private',
  APP_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/agentloom',
  APP_JWT_SECRET: 'test-jwt-secret',
  APP_REDIS_URL: 'redis://localhost:6379',
  APP_MASTER_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  APP_OAUTH_REDIRECT_URL: 'http://localhost:3000/auth/callback',
  APP_FRONTEND_URL: 'http://localhost:5173',
  APP_SUPABASE_URL: '',
  APP_SUPABASE_ANON_KEY: '',
  APP_SUPABASE_SERVICE_KEY: '',
} as const;

class FakeReadline extends EventEmitter {
  close = vi.fn(() => this.emit('close'));
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

function parseWrites(writes: string[]) {
  return writes.map(
    (line) => JSON.parse(line.trim()) as Record<string, unknown>,
  );
}

interface StdioState {
  initialized: boolean;
  sessions?: Map<string, unknown>;
  emitNotification: (value: unknown) => Promise<void>;
  requestClient: (
    method: string,
    params: unknown,
  ) => { requestId: string; response: Promise<unknown> };
  cancelClientRequest: (id: string, result: unknown) => boolean;
}

async function loadStdioEntrypoint() {
  // Dynamic loading is the behavior under test: each case needs a fresh bootstrap side effect.
  await import('./acp-stdio.js');
}

// 每个用例都会 resetModules 后重新 import 整个 Nest 入口模块图，
// 冷缓存下单次 bootstrap 的 transform 时间远超 vitest 默认 5s testTimeout。
describe('ACP stdio bootstrap', { timeout: 30_000 }, () => {
  let readline: FakeReadline;
  let writes: string[];
  let signalHandlers: Record<string, () => void>;
  let stdoutWrite: MockInstance;
  let stderrWrite: MockInstance;
  let stdinPause: MockInstance;
  let stdinResume: MockInstance;
  let stdinSetEncoding: MockInstance;

  beforeEach(() => {
    vi.resetModules();
    createApplicationContext.mockReset();
    createInterfaceMock.mockReset();
    Object.assign(process.env, REQUIRED_ENV);
    process.exitCode = undefined;
    readline = new FakeReadline();
    writes = [];
    signalHandlers = {};
    createInterfaceMock.mockReturnValue(readline);
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      writes.push(String(chunk));
      return true;
    }) as never);
    stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as never);
    stdinPause = vi
      .spyOn(process.stdin, 'pause')
      .mockImplementation(() => process.stdin);
    stdinResume = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin);
    stdinSetEncoding = vi
      .spyOn(process.stdin, 'setEncoding')
      .mockImplementation(() => process.stdin);
    vi.spyOn(process, 'once').mockImplementation(((
      event: string,
      listener: () => void,
    ) => {
      signalHandlers[event] = listener;
      return process;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('创建单连接上下文，并区分 gateway 消息、client response、通知和关闭清理', async () => {
    const app = { get: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    let state: StdioState | undefined;
    const clientResults: Array<Promise<unknown>> = [];
    const gateway = {
      handleMessage: vi.fn(async (raw: string, connectionState: StdioState) => {
        state = connectionState;
        if (raw === 'gateway-success') {
          return { jsonrpc: '2.0', id: 1, result: { ok: true } };
        }
        if (raw === 'gateway-notification') {
          await connectionState.emitNotification({
            jsonrpc: '2.0',
            method: 'session/update',
            params: { text: 'chunk' },
          });
          return null;
        }
        if (raw === 'open-client-success') {
          const pending = connectionState.requestClient(
            'session/request_permission',
            { toolCallId: 'tool-1' },
          );
          clientResults.push(pending.response);
          return null;
        }
        if (raw === 'open-client-error') {
          const pending = connectionState.requestClient('fs/read_text_file', {
            path: '/workspace/a',
          });
          clientResults.push(pending.response);
          return null;
        }
        if (raw === 'open-client-cancel') {
          const pending = connectionState.requestClient('fs/write_text_file', {
            path: '/workspace/b',
          });
          clientResults.push(pending.response);
          expect(
            connectionState.cancelClientRequest('unknown', { cancelled: true }),
          ).toBe(false);
          expect(
            connectionState.cancelClientRequest(pending.requestId, {
              cancelled: true,
            }),
          ).toBe(true);
          return null;
        }
        if (raw === 'throw') throw new Error('gateway failed');
        return { jsonrpc: '2.0', id: 99, result: { routed: raw } };
      }),
    };
    app.get.mockReturnValue(gateway);
    createApplicationContext.mockResolvedValue(app);

    await loadStdioEntrypoint();
    await flush();
    expect(createApplicationContext).toHaveBeenCalledWith(
      expect.any(Function),
      { abortOnError: false, logger: false },
    );
    expect(createInterfaceMock).toHaveBeenCalledWith({
      input: process.stdin,
      crlfDelay: Infinity,
      terminal: false,
    });
    expect(stdinSetEncoding).toHaveBeenCalledWith('utf8');
    expect(stdinResume).toHaveBeenCalled();
    expect(signalHandlers).toEqual(
      expect.objectContaining({
        SIGINT: expect.any(Function),
        SIGTERM: expect.any(Function),
      }),
    );

    readline.emit('line', '   ');
    readline.emit('line', 'gateway-success');
    readline.emit('line', 'gateway-notification');
    readline.emit('line', 'open-client-success');
    await flush();
    let protocol = parseWrites(writes);
    expect(protocol).toEqual(
      expect.arrayContaining([
        { jsonrpc: '2.0', id: 1, result: { ok: true } },
        { jsonrpc: '2.0', method: 'session/update', params: { text: 'chunk' } },
        {
          jsonrpc: '2.0',
          id: 'acp-server-1',
          method: 'session/request_permission',
          params: { toolCallId: 'tool-1' },
        },
      ]),
    );
    expect(gateway.handleMessage).not.toHaveBeenCalledWith(
      '   ',
      expect.anything(),
    );

    readline.emit(
      'line',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'acp-server-1',
        result: { outcome: 'selected' },
      }),
    );
    await expect(clientResults[0]).resolves.toEqual({ outcome: 'selected' });
    expect(gateway.handleMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('selected'),
      expect.anything(),
    );

    readline.emit('line', 'open-client-error');
    await flush();
    protocol = parseWrites(writes);
    expect(protocol).toContainEqual({
      jsonrpc: '2.0',
      id: 'acp-server-2',
      method: 'fs/read_text_file',
      params: { path: '/workspace/a' },
    });
    readline.emit(
      'line',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'acp-server-2',
        error: { code: -32010, message: 'denied', data: { reason: 'policy' } },
      }),
    );
    await expect(clientResults[1]).rejects.toMatchObject({
      code: -32010,
      message: 'denied',
      data: { reason: 'policy' },
    });

    readline.emit('line', 'open-client-cancel');
    await flush();
    await expect(clientResults[2]).resolves.toEqual({ cancelled: true });
    readline.emit(
      'line',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'acp-server-3',
        result: { late: true },
      }),
    );
    await flush();
    for (const validUnknownResponse of [
      { jsonrpc: '2.0', id: null, result: null },
      { jsonrpc: '2.0', id: 42, result: false },
      { jsonrpc: '2.0', id: 'unknown', error: { code: -1, message: 'late' } },
    ]) {
      readline.emit('line', JSON.stringify(validUnknownResponse));
    }
    await flush();
    expect(gateway.handleMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('"id":42'),
      expect.anything(),
    );

    expect(gateway.handleMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('late'),
      expect.anything(),
    );

    for (const invalidResponse of [
      'not-json',
      '[]',
      '{"jsonrpc":"2.0","id":4,"method":"client/method","result":{}}',
      '{"jsonrpc":"1.0","id":4,"result":{}}',
      '{"jsonrpc":"2.0","id":{},"result":{}}',
      '{"jsonrpc":"2.0","id":4}',
      '{"jsonrpc":"2.0","id":4,"result":{},"error":{"code":1,"message":"x"}}',
      '{"jsonrpc":"2.0","id":4,"error":{"code":"bad","message":"x"}}',
      '{"jsonrpc":"2.0","id":4,"error":{"code":1,"message":9}}',
    ])
      readline.emit('line', invalidResponse);
    await flush();
    for (const invalidResponse of [
      'not-json',
      '[]',
      '{"jsonrpc":"2.0","id":4}',
    ]) {
      expect(gateway.handleMessage).toHaveBeenCalledWith(
        invalidResponse,
        state!,
      );
    }

    readline.emit('line', 'throw');
    await flush();
    expect(parseWrites(writes)).toContainEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Internal error' },
    });

    state!.sessions = new Map([
      ['session-1', {}],
      ['session-2', {}],
    ]);
    const dangling = state!.requestClient('fs/read_text_file', {
      path: '/workspace/dangling',
    }).response;
    const danglingAssertion = expect(dangling).rejects.toThrow(
      'ACP stdio connection closed while waiting for client response: acp-server-4',
    );
    readline.emit('close');
    await flush();
    await danglingAssertion;
    expect(stdinPause).toHaveBeenCalled();
    expect(readline.close).toHaveBeenCalled();
    expect(gateway.handleMessage).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: { sessionId: 'session-1' },
      }),
      state!,
    );
    expect(gateway.handleMessage).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: { sessionId: 'session-2' },
      }),
      state!,
    );
    expect(app.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
    signalHandlers.SIGINT();
    signalHandlers.SIGTERM();
    await flush();
    expect(app.close).toHaveBeenCalledOnce();
  });

  it('stdout backpressure 时等待 drain 后才完成串行协议写入', async () => {
    const app = { get: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    const gateway = {
      handleMessage: vi
        .fn()
        .mockResolvedValue({ jsonrpc: '2.0', id: 1, result: 'ok' }),
    };
    app.get.mockReturnValue(gateway);
    createApplicationContext.mockResolvedValue(app);
    stdoutWrite.mockImplementationOnce(((chunk: string) => {
      writes.push(chunk);
      setImmediate(() => process.stdout.emit('drain'));
      return false;
    }) as never);

    await loadStdioEntrypoint();
    readline.emit('line', 'request');
    await flush();
    expect(parseWrites(writes)).toEqual([
      { jsonrpc: '2.0', id: 1, result: 'ok' },
    ]);
    readline.emit('close');
    await flush();
  });

  it('server 发起的 client request 写失败时拒绝对应 response 且不遗留 pending', async () => {
    const app = { get: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    let requestOutcome:
      | Promise<{ resolved: true } | { resolved: false; error: unknown }>
      | undefined;
    const gateway = {
      handleMessage: vi.fn(async (_raw: string, state: StdioState) => {
        const pendingResponse = state.requestClient('fs/read_text_file', {
          path: '/workspace/fail',
        }).response;
        requestOutcome = pendingResponse.then(
          () => ({ resolved: true as const }),
          (error: unknown) => ({ resolved: false as const, error }),
        );
        return null;
      }),
    };
    app.get.mockReturnValue(gateway);
    createApplicationContext.mockResolvedValue(app);
    stdoutWrite.mockImplementationOnce((() => {
      throw new Error('stdout unavailable');
    }) as never);

    await loadStdioEntrypoint();
    await flush();
    readline.emit('line', 'open');
    await flush();
    await expect(requestOutcome).resolves.toEqual({
      resolved: false,
      error: expect.objectContaining({ message: 'stdout unavailable' }),
    });
  });

  it.each([
    [new Error('bootstrap exploded'), 'bootstrap exploded', true],
    [new Error('bootstrap immediate'), 'bootstrap immediate', false],
    ['non-error rejection', 'ACP stdio bootstrap failed', true],
    [{ rejected: true }, 'ACP stdio bootstrap failed', false],
  ] as const)(
    'bootstrap 失败写 stderr 并设置 exit 1: %s',
    async (failure, expected, backpressured) => {
      createApplicationContext.mockRejectedValue(failure);
      stderrWrite.mockImplementationOnce(((chunk: string) => {
        expect(chunk).toContain(expected);
        if (backpressured) {
          setImmediate(() => process.stderr.emit('drain'));
          return false;
        }
        return true;
      }) as never);

      await loadStdioEntrypoint();
      await flush();
      expect(stderrWrite).toHaveBeenCalledOnce();
      expect(process.exitCode).toBe(1);
    },
  );
});
