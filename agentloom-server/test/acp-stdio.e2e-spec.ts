import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_DIR = path.resolve(__dirname, '..');
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const TEST_JWT_SECRET = 'test-e2e-jwt-secret';
const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TEST_MASTER_ENCRYPTION_KEY =
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const SANDBOX_SESSION_CWD = '/workspace/demo';
const ACP_HELPER_ENV_KEYS = [
  'HOME',
  'PATH',
  'PWD',
  'SHELL',
  'TERM',
  'TMP',
  'TMPDIR',
  'TEMP',
  'TZ',
  'LANG',
  'LC_ALL',
  'SystemRoot',
  'ComSpec',
] as const;

type JsonRpcId = string | number | null;

type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type AcpStdioScenarioResult = {
  ok: boolean;
  protocolLines: string[];
  stderr: string;
  childExitCode: number | null;
  initializedNotificationSilent?: boolean;
  unsupportedInitializeResponse?: JsonRpcResponse;
  initializeResponse?: JsonRpcResponse;
  validAuthResponse?: JsonRpcResponse;
  sessionNewResponse?: JsonRpcResponse;
  terminalCreateResponse?: JsonRpcResponse;
  terminalBoundedOutputResponse?: JsonRpcResponse;
  terminalTailOutputResponse?: JsonRpcResponse;
  terminalWaitForExitResponse?: JsonRpcResponse;
  terminalRejectResponse?: JsonRpcResponse;
  terminalExitedOutputResponse?: JsonRpcResponse;
  terminalTimeoutCreateResponse?: JsonRpcResponse;
  terminalTimeoutWaitForExitResponse?: JsonRpcResponse;
  terminalKillCreateResponse?: JsonRpcResponse;
  terminalKillResponse?: JsonRpcResponse;
  terminalKilledOutputResponse?: JsonRpcResponse;
  terminalReleaseCreateResponse?: JsonRpcResponse;
  terminalReleaseResponse?: JsonRpcResponse;
  terminalReleaseOutputResponse?: JsonRpcResponse;
  terminalCancelSessionNewResponse?: JsonRpcResponse;
  terminalCancelCreateResponse?: JsonRpcResponse;
  terminalCancelOutputResponse?: JsonRpcResponse;
  terminalKilledAuditRows?: Array<{
    event_type: string;
    metadata: Record<string, unknown>;
  }>;
  terminalLoadSessionNewResponse?: JsonRpcResponse;
  terminalLoadCreateResponse?: JsonRpcResponse;
  longTerminalCreateResponse?: JsonRpcResponse;
  longTerminalCreateElapsedMs?: number;
  longTerminalRunningOutputResponse?: JsonRpcResponse;
  longTerminalWaitTimeoutResponse?: JsonRpcResponse;
  longTerminalExtraCreateResponses?: JsonRpcResponse[];
  longTerminalLimitResponse?: JsonRpcResponse;
  longTerminalKillResponse?: JsonRpcResponse;
  longTerminalKilledWaitResponse?: JsonRpcResponse;
  longTerminalCancelResponse?: JsonRpcResponse;
  viewerAuthResponse?: JsonRpcResponse;
  viewerSessionNewResponse?: JsonRpcResponse;
  viewerTerminalCreateResponse?: JsonRpcResponse;
  viewerSandboxReadResponse?: JsonRpcResponse;
  viewerPromptResponse?: JsonRpcResponse;
  ownerReauthResponse?: JsonRpcResponse;
  otherAgentBindingResponse?: JsonRpcResponse;
  missingConversationBindingResponse?: JsonRpcResponse;
  missingExecutionBindingResponse?: JsonRpcResponse;
  disconnectTerminalCreateResponse?: JsonRpcResponse;
  disconnectExitCode?: number | null;
  disconnectKilledAuditRows?: Array<{
    event_type: string;
    metadata: Record<string, unknown>;
  }>;
  loadTerminalReleasedResponse?: JsonRpcResponse;
  loadReleasedTerminalOutputResponse?: JsonRpcResponse;
  continuityDroppedAuditRows?: Array<{
    event_type: string;
    metadata: Record<string, unknown>;
  }>;
  loadAfterDisconnectResponse?: JsonRpcResponse;
  loadAfterDisconnectTerminalCreateResponse?: JsonRpcResponse;
  sandboxReadResponse?: JsonRpcResponse;
  fsReadServerRequests?: JsonRpcRequest[];
  fsReadNotifications?: JsonRpcNotification[];
  fsReadResponse?: JsonRpcResponse;
  fsWriteServerRequests?: JsonRpcRequest[];
  fsWriteNotifications?: JsonRpcNotification[];
  fsWriteResponse?: JsonRpcResponse;
  fsWriteDeniedServerRequests?: JsonRpcRequest[];
  fsWriteDeniedNotifications?: JsonRpcNotification[];
  fsWriteDeniedResponse?: JsonRpcResponse;
  fsWriteCancelledServerRequests?: JsonRpcRequest[];
  fsWriteCancelledNotifications?: JsonRpcNotification[];
  fsWriteCancelledResponse?: JsonRpcResponse;
  sandboxWriteServerRequests?: JsonRpcRequest[];
  sandboxWriteNotifications?: JsonRpcNotification[];
  sandboxWriteResponse?: JsonRpcResponse;
  sandboxTraversalResponse?: JsonRpcResponse;
  sandboxOversizeResponse?: JsonRpcResponse;
  sandboxBinaryResponse?: JsonRpcResponse;
  fsCancelSessionNewResponse?: JsonRpcResponse;
  fsCancelServerRequest?: JsonRpcRequest;
  fsCancelNotifications?: JsonRpcNotification[];
  fsCancelResponse?: JsonRpcResponse;
  promptServerRequests?: JsonRpcRequest[];
  promptNotifications?: JsonRpcNotification[];
  promptResponse?: JsonRpcResponse;
  mcpSessionNewResponse?: JsonRpcResponse;
  mcpPromptServerRequests?: JsonRpcRequest[];
  mcpPromptNotifications?: JsonRpcNotification[];
  mcpPromptResponse?: JsonRpcResponse;
  mcpCancelSessionNewResponse?: JsonRpcResponse;
  mcpCancelPromptNotifications?: JsonRpcNotification[];
  mcpCancelPromptResponse?: JsonRpcResponse;
  cancelSessionNewResponse?: JsonRpcResponse;
  cancelPromptPermissionRequest?: JsonRpcRequest;
  cancelPromptNotifications?: JsonRpcNotification[];
  cancelPromptResponse?: JsonRpcResponse;
  parseErrorResponse?: JsonRpcResponse;
  invalidIdResponse?: JsonRpcResponse;
  secondValidAuthResponse?: JsonRpcResponse;
  revokedResponse?: JsonRpcResponse;
  loadInitializeResponse?: JsonRpcResponse;
  loadInitializedNotificationSilent?: boolean;
  loadAuthResponse?: JsonRpcResponse;
  loadNotifications?: JsonRpcNotification[];
  loadResponse?: JsonRpcResponse;
  loadFsReadServerRequests?: JsonRpcRequest[];
  loadFsReadNotifications?: JsonRpcNotification[];
  loadFsReadResponse?: JsonRpcResponse;
  loadSandboxReadResponse?: JsonRpcResponse;
  loadPromptServerRequests?: JsonRpcRequest[];
  loadPromptNotifications?: JsonRpcNotification[];
  loadPromptResponse?: JsonRpcResponse;
  mcpLoadNotifications?: JsonRpcNotification[];
  mcpLoadResponse?: JsonRpcResponse;
  mcpLoadPromptServerRequests?: JsonRpcRequest[];
  mcpLoadPromptNotifications?: JsonRpcNotification[];
  mcpLoadPromptResponse?: JsonRpcResponse;
  error?: {
    message: string;
    stack?: string;
  };
};

async function buildAcpStdioEntry() {
  const child = spawn(
    PNPM_BIN,
    ['exec', 'nest', 'build', '--path', 'tsconfig.build.json'],
    {
      cwd: SERVER_DIR,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: string | Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: string | Buffer) => {
    stderr += chunk.toString();
  });

  const [exitCode] = await once(child, 'exit');
  if (exitCode === 0) {
    return;
  }

  const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  throw new Error(
    output || `ACP stdio build failed with exit code ${String(exitCode)}`,
  );
}

function createAcpHelperEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ACP_TEST_SERVER_DIR: SERVER_DIR,
    ACP_TEST_DATABASE_URL: databaseUrl,
    // setup-e2e.ts 已按 E2E_REDIS_URL 设置 APP_REDIS_URL；helper 只继承白名单变量，需显式传入
    ACP_TEST_REDIS_URL: process.env.APP_REDIS_URL,
    ACP_TEST_JWT_SECRET: TEST_JWT_SECRET,
    ACP_TEST_TENANT_ID: TEST_TENANT_ID,
    ACP_TEST_ORG_ID: TEST_ORG_ID,
    ACP_TEST_MASTER_ENCRYPTION_KEY: TEST_MASTER_ENCRYPTION_KEY,
  };

  for (const key of ACP_HELPER_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

async function runAcpStdioScenario(
  databaseUrl: string,
  // 两次子进程冷启动各留 60s（见 helper 的 ACP_PROCESS_STARTUP_TIMEOUT_MS），协议步骤本身单独运行约十余秒
  timeoutMs = 180_000,
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  result: AcpStdioScenarioResult;
}> {
  const child = spawn(
    process.execPath,
    ['./scripts/run-acp-stdio-e2e-helper.mjs'],
    {
      cwd: SERVER_DIR,
      env: createAcpHelperEnv(databaseUrl),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const exitResult = await Promise.race([
    once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>,
    new Promise<[null, null]>((_, reject) => {
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
        reject(
          new Error(
            `ACP stdio helper timed out after ${timeoutMs}ms. stdout: ${stdout}. stderr: ${stderr}`,
          ),
        );
      }, timeoutMs);
    }),
  ]);

  const [exitCode] = exitResult;
  const trimmedStdout = stdout.trim();
  if (trimmedStdout.length === 0) {
    throw new Error(
      `ACP stdio helper produced no stdout. exitCode=${String(exitCode)} stderr: ${stderr}`,
    );
  }

  let result: AcpStdioScenarioResult;
  try {
    result = JSON.parse(trimmedStdout) as AcpStdioScenarioResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `ACP stdio helper returned invalid JSON (${message}). stdout: ${stdout}. stderr: ${stderr}`,
      { cause: error },
    );
  }

  return {
    exitCode,
    stdout,
    stderr,
    result,
  };
}

function readTerminalId(response: JsonRpcResponse | undefined): string {
  if (
    response &&
    'result' in response &&
    typeof response.result === 'object' &&
    response.result !== null &&
    'terminalId' in response.result &&
    typeof response.result.terminalId === 'string'
  ) {
    return response.result.terminalId;
  }

  throw new Error(
    `Expected a terminal/create result: ${JSON.stringify(response)}`,
  );
}

describe('ACP stdio E2E', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    await buildAcpStdioEntry();
  }, 120_000);

  afterAll(async () => {
    await container.stop();
  }, 30_000);

  it('应通过 stdio 处理 terminal 主链（含运行中长命令）、角色校验、mcpServers lifecycle、跨连接 session/load、协议协商与 stdout hygiene', async () => {
    const { exitCode, stderr, result } = await runAcpStdioScenario(
      container.getConnectionUri(),
    );

    expect(stderr).toBe('');
    expect(result.ok, result.error?.stack ?? result.error?.message).toBe(true);
    expect(exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.childExitCode).toBeNull();
    expect(result.initializedNotificationSilent).toBe(true);
    expect(result.loadInitializedNotificationSilent).toBe(true);
    expect(result.protocolLines.length).toBeGreaterThanOrEqual(35);

    expect(result.unsupportedInitializeResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: {
          requestedProtocolVersion: '2025-01-01',
          supportedProtocolVersions: ['2026-02-18'],
        },
      },
    });

    expect(result.initializeResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        protocolVersion: '2026-02-18',
        serverInfo: {
          name: 'agentloom',
          version: '0.0.1',
          capabilities: {
            loadSession: true,
            streaming: true,
            tools: true,
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
            terminal: {
              create: true,
            },
          },
        },
      },
    });
    const initializeCapabilities = (
      result.initializeResponse as JsonRpcSuccessResponse
    ).result as {
      serverInfo: {
        capabilities: Record<string, unknown>;
      };
    };
    expect(initializeCapabilities.serverInfo.capabilities).not.toHaveProperty(
      'mcpServers',
    );
    expect(initializeCapabilities.serverInfo.capabilities).not.toHaveProperty(
      'mcpCapabilities',
    );

    expect(result.validAuthResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: { authenticated: true },
    });

    expect(result.sessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 6,
      result: {
        sessionId: expect.any(String),
      },
    });

    expect(result.terminalCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 75,
      result: {
        terminalId: expect.any(String),
      },
    });
    expect(result.terminalBoundedOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 76,
      result: {
        output: 'terminal',
        nextOffset: 8,
        truncated: false,
      },
    });
    expect(result.terminalTailOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 77,
      result: {
        output: '-output',
        nextOffset: 15,
        truncated: false,
      },
    });
    expect(result.terminalWaitForExitResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 78,
      result: {
        terminalId: expect.any(String),
        status: 'exited',
        exitCode: 0,
        signal: null,
      },
    });
    expect(result.terminalRejectResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 79,
      error: {
        code: -32004,
        message: 'ACP terminal command is not allowed by sandbox policy',
        data: {
          reason: 'terminal_command_pattern_not_allowed',
        },
      },
    });
    expect(result.terminalExitedOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 80,
      error: {
        code: -32004,
        message:
          'ACP terminal output is unavailable because terminal is not running',
        data: {
          reason: 'terminal_output_unavailable',
          status: 'exited',
        },
      },
    });
    expect(result.terminalTimeoutCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 81,
      result: {
        terminalId: expect.any(String),
      },
    });
    expect(result.terminalTimeoutWaitForExitResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 82,
      error: {
        code: -32004,
        message: 'ACP terminal execution timed out',
        data: {
          reason: 'terminal_timeout',
          signal: 'TERM',
        },
      },
    });
    expect(result.terminalKillCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 83,
      result: {
        terminalId: expect.any(String),
      },
    });
    expect(result.terminalKillResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 84,
      result: {
        success: true,
      },
    });
    expect(result.terminalKilledOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 85,
      error: {
        code: -32004,
        message:
          'ACP terminal output is unavailable because terminal is not running',
        data: {
          reason: 'terminal_output_unavailable',
          status: 'killed',
        },
      },
    });
    expect(result.terminalReleaseCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 86,
      result: {
        terminalId: expect.any(String),
      },
    });
    expect(result.terminalReleaseResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 87,
      result: {
        success: true,
      },
    });
    expect(result.terminalReleaseOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 88,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: {
          reason: 'terminal_not_found',
        },
      },
    });
    expect(result.terminalCancelSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 89,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.terminalCancelCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 90,
      result: {
        terminalId: expect.any(String),
      },
    });
    expect(result.terminalCancelOutputResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 91,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: {
          reason: 'Session not found',
        },
      },
    });
    expect(result.terminalKilledAuditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'acp.terminal.server_sandbox.killed',
          metadata: expect.objectContaining({
            reason: 'manual_kill',
            terminalId: expect.any(String),
            execId: expect.any(String),
          }),
        }),
        expect.objectContaining({
          event_type: 'acp.terminal.server_sandbox.killed',
          metadata: expect.objectContaining({
            reason: 'session_cleanup',
            terminalId: expect.any(String),
            execId: expect.any(String),
          }),
        }),
      ]),
    );

    expect(result.sandboxReadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 60,
      result: {
        content: [
          {
            type: 'text',
            text: '来自沙箱的文件内容',
          },
        ],
      },
    });

    expect(result.fsReadNotifications).toEqual([]);
    expect(result.fsReadServerRequests).toHaveLength(1);
    expect(result.fsReadServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'fs/read_text_file',
      params: {
        sessionId: expect.any(String),
        path: `${SANDBOX_SESSION_CWD}/notes/readme.txt`,
      },
    });
    expect(result.fsReadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 61,
      result: {
        content: [
          {
            type: 'text',
            text: '来自客户端的文件内容',
          },
        ],
      },
    });

    expect(result.fsWriteNotifications).toEqual([]);
    expect(result.fsWriteServerRequests).toHaveLength(2);
    expect(result.fsWriteServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: expect.any(String),
        toolCall: {
          title: 'filesystem.write',
          kind: 'tool_call',
          status: 'awaiting_permission',
          content: [
            {
              type: 'text',
              text: `写入文件需要主人确认：${SANDBOX_SESSION_CWD}/notes/write.txt`,
            },
          ],
          permissionRequest: {
            description: `写入文件需要主人确认：${SANDBOX_SESSION_CWD}/notes/write.txt`,
            resourcePaths: [`${SANDBOX_SESSION_CWD}/notes/write.txt`],
          },
        },
      },
    });
    expect(result.fsWriteServerRequests?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'fs/write_text_file',
      params: {
        sessionId: expect.any(String),
        path: `${SANDBOX_SESSION_CWD}/notes/write.txt`,
        content: 'updated from client proxy',
      },
    });
    expect(result.fsWriteResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 62,
      result: {
        success: true,
      },
    });

    expect(result.fsWriteDeniedNotifications).toEqual([]);
    expect(result.fsWriteDeniedServerRequests).toHaveLength(1);
    expect(result.fsWriteDeniedServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        toolCall: {
          title: 'filesystem.write',
          permissionRequest: {
            resourcePaths: [`${SANDBOX_SESSION_CWD}/notes/write-denied.txt`],
          },
        },
      },
    });
    expect(result.fsWriteDeniedResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 66,
      error: {
        code: -32004,
        message: 'ACP file operation was rejected by permission policy',
      },
    });

    expect(result.fsWriteCancelledNotifications).toEqual([]);
    expect(result.fsWriteCancelledServerRequests).toHaveLength(1);
    expect(result.fsWriteCancelledServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        toolCall: {
          title: 'filesystem.write',
          permissionRequest: {
            resourcePaths: [`${SANDBOX_SESSION_CWD}/notes/write-cancelled.txt`],
          },
        },
      },
    });

    expect(result.sandboxWriteNotifications).toEqual([]);
    expect(result.sandboxWriteServerRequests).toHaveLength(1);
    expect(result.sandboxWriteServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: expect.any(String),
        toolCall: {
          title: 'filesystem.write',
          permissionRequest: {
            resourcePaths: [`${SANDBOX_SESSION_CWD}/notes/write-sandbox.txt`],
          },
        },
      },
    });
    expect(result.sandboxWriteResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 68,
      result: {
        success: true,
      },
    });
    expect(result.sandboxTraversalResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 69,
      error: {
        code: -32004,
        message: 'ACP server sandbox path escapes workspace',
      },
    });
    expect(result.sandboxOversizeResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 70,
      error: {
        code: -32004,
        message: 'ACP server sandbox file exceeds size limit',
      },
    });
    expect(result.sandboxBinaryResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 71,
      error: {
        code: -32004,
        message: 'ACP server sandbox file is binary and cannot be read as text',
      },
    });
    expect(result.fsWriteCancelledResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 67,
      error: {
        code: -32005,
        message: 'ACP file permission request was cancelled',
      },
    });

    expect(result.fsCancelSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 63,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.fsCancelServerRequest).toMatchObject({
      jsonrpc: '2.0',
      method: 'fs/read_text_file',
      params: {
        sessionId: expect.any(String),
        path: `${SANDBOX_SESSION_CWD}/notes/cancelled.txt`,
      },
    });
    expect(result.fsCancelNotifications).toEqual([]);
    expect(result.fsCancelResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 64,
      error: {
        code: -32005,
        message: 'ACP client fs request was cancelled',
      },
    });

    expect(result.promptServerRequests).toBeDefined();
    expect(result.promptServerRequests).toHaveLength(1);
    expect(result.promptServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: expect.any(String),
        toolCall: {
          toolCallId: expect.any(String),
          title: 'filesystem.read',
          kind: 'tool_call',
          status: 'awaiting_permission',
          content: [
            {
              type: 'text',
              text: '读取 ACP 测试文件需要主人确认。',
            },
          ],
        },
        options: [
          {
            optionId: 'allow-once',
            kind: 'allow_once',
          },
          {
            optionId: 'allow-always',
            kind: 'allow_always',
          },
          {
            optionId: 'reject-once',
            kind: 'reject_once',
          },
          {
            optionId: 'reject-always',
            kind: 'reject_always',
          },
        ],
      },
    });

    expect(result.promptNotifications).toBeDefined();
    expect(result.promptNotifications).toHaveLength(6);
    expect(result.promptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'plan',
          title: '测试计划',
          content: '先发出计划，再请求工具权限，最后生成回复。',
        },
      },
    });
    expect(result.promptNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            status: 'awaiting_permission',
            permissionRequest: {
              description: '读取 ACP 测试文件需要主人确认。',
              resourcePaths: ['/tmp/acp-test.txt'],
            },
          },
        },
      },
    });
    expect(result.promptNotifications?.[2]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.promptNotifications?.[3]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            status: 'completed',
            result: {
              content: '示例文件内容',
            },
          },
        },
      },
    });
    expect(result.promptNotifications?.[4]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'agent_message_chunk',
          content: '你好',
        },
      },
    });
    expect(result.promptNotifications?.[5]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'agent_message_chunk',
          content: '，主人',
        },
      },
    });
    expect(result.promptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      result: {
        stopReason: 'end_turn',
      },
    });

    expect(result.mcpSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 16,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.mcpPromptServerRequests).toEqual([]);
    expect(result.mcpPromptNotifications).toHaveLength(3);
    expect(result.mcpPromptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            tool: 'docs/search',
            args: {
              query: '请通过 MCP 查询 AgentLoom。',
            },
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.mcpPromptNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            tool: 'docs/search',
            status: 'completed',
            result: {
              content: [
                {
                  type: 'text',
                  text: 'fixture-search:请通过 MCP 查询 AgentLoom。',
                },
              ],
            },
          },
        },
      },
    });
    expect(result.mcpPromptNotifications?.[2]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'agent_message_chunk',
          content:
            '已通过 docs/search 获取：fixture-search:请通过 MCP 查询 AgentLoom。',
        },
      },
    });
    expect(result.mcpPromptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 17,
      result: {
        stopReason: 'end_turn',
      },
    });

    expect(result.mcpCancelSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 18,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.mcpCancelPromptNotifications).toHaveLength(1);
    expect(result.mcpCancelPromptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            tool: 'docs/search',
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.mcpCancelPromptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 19,
      result: {
        stopReason: 'cancelled',
      },
    });

    expect(result.cancelSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 8,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.cancelPromptNotifications).toBeDefined();
    expect(result.cancelPromptNotifications).toHaveLength(2);
    expect(result.cancelPromptPermissionRequest).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: expect.any(String),
        toolCall: {
          status: 'awaiting_permission',
        },
      },
    });
    expect(result.cancelPromptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'plan',
        },
      },
    });
    expect(result.cancelPromptNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'tool_call',
          call: {
            status: 'awaiting_permission',
          },
        },
      },
    });
    expect(result.cancelPromptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 9,
      result: {
        stopReason: 'cancelled',
      },
    });

    expect(result.parseErrorResponse).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });

    expect(result.invalidIdResponse).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });

    expect(result.secondValidAuthResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 4,
      result: { authenticated: true },
    });

    expect(result.revokedResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: {
          status: 401,
          type: 'https://agentloom.dev/errors/token-revoked',
          detail: 'Token has been revoked',
        },
      },
    });

    // D-198：create 不等命令结束；运行中读到输出，wait 超时、并发上限与 kill 作用于运行中的进程
    expect(result.longTerminalCreateResponse).toMatchObject({
      id: 121,
      result: { terminalId: expect.any(String) },
    });
    expect(result.longTerminalCreateElapsedMs).toBeLessThan(1_000);
    expect(result.longTerminalRunningOutputResponse).toMatchObject({
      id: 122,
      result: { output: 'tick', nextOffset: 4, truncated: false },
    });
    expect(result.longTerminalWaitTimeoutResponse).toMatchObject({
      id: 123,
      error: {
        code: -32004,
        message: 'ACP terminal wait timed out',
        data: { reason: 'terminal_wait_timeout', timeoutMs: 100 },
      },
    });
    expect(
      result.longTerminalExtraCreateResponses?.map((response) =>
        'result' in response ? 'created' : response.error.code,
      ),
    ).toEqual(['created', 'created', 'created', 'created']);
    expect(result.longTerminalLimitResponse).toMatchObject({
      id: 128,
      error: {
        code: -32004,
        data: { reason: 'terminal_session_limit_exceeded' },
      },
    });
    expect(result.longTerminalKillResponse).toMatchObject({
      id: 129,
      result: { success: true },
    });
    expect(result.longTerminalKilledWaitResponse).toMatchObject({
      id: 130,
      result: { status: 'killed', signal: 'TERM' },
    });
    expect(result.longTerminalCancelResponse).toMatchObject({
      id: 131,
      result: null,
    });

    // D-199：与 HTTP 同一角色判定（agent:run 仅 operator 及以上），JWT 里的 tenant_role 不作数
    expect(result.viewerAuthResponse).toMatchObject({
      id: 140,
      result: { authenticated: true },
    });
    const insufficientPermissions = {
      code: -32000,
      data: {
        status: 403,
        type: 'https://agentloom.dev/errors/insufficient-permissions',
      },
    };
    expect(result.viewerSessionNewResponse).toMatchObject({
      id: 141,
      error: insufficientPermissions,
    });
    expect(result.viewerTerminalCreateResponse).toMatchObject({
      id: 142,
      error: insufficientPermissions,
    });
    expect(result.viewerSandboxReadResponse).toMatchObject({
      id: 143,
      error: insufficientPermissions,
    });
    expect(result.viewerPromptResponse).toMatchObject({
      id: 144,
      error: insufficientPermissions,
    });
    expect(result.ownerReauthResponse).toMatchObject({
      id: 145,
      result: { authenticated: true },
    });
    // 绑定别的 Agent 的对话：只校验同租户存在（ACP 只接受 no_sandbox Agent，它自己的对话没有沙箱）
    expect(result.otherAgentBindingResponse).toMatchObject({
      id: 146,
      result: { sessionId: expect.any(String) },
    });
    expect(result.missingConversationBindingResponse).toMatchObject({
      id: 148,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: { reason: 'server_sandbox_binding_not_found' },
      },
    });
    expect(result.missingExecutionBindingResponse).toMatchObject({
      id: 147,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: { reason: 'server_sandbox_binding_not_found' },
      },
    });

    // D-200：连接留着运行中的终端断开，断开清理终止终端后进程正常退出
    expect(result.disconnectTerminalCreateResponse).toMatchObject({
      id: 153,
      result: { terminalId: expect.any(String) },
    });
    expect(result.disconnectExitCode).toBe(0);
    expect(result.disconnectKilledAuditRows).toEqual([
      {
        event_type: 'acp.terminal.server_sandbox.killed',
        metadata: expect.objectContaining({
          terminalId: readTerminalId(result.disconnectTerminalCreateResponse),
          reason: 'session_cleanup',
        }),
      },
    ]);

    expect(result.loadInitializeResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 12,
      result: {
        protocolVersion: '2026-02-18',
        serverInfo: {
          name: 'agentloom',
          version: '0.0.1',
          capabilities: {
            loadSession: true,
            streaming: true,
            tools: true,
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
            terminal: {
              create: true,
            },
          },
        },
      },
    });

    expect(result.loadAuthResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 13,
      result: { authenticated: true },
    });

    expect(result.loadNotifications).toHaveLength(7);
    expect(result.loadNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'user_message',
          replayed: true,
          content: [
            {
              type: 'text',
              text: '请正常完成一次回复。',
            },
          ],
        },
      },
    });
    expect(result.loadNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'plan',
          replayed: true,
        },
      },
    });
    expect(result.loadNotifications?.[2]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          replayed: true,
          call: {
            status: 'awaiting_permission',
          },
        },
      },
    });
    expect(result.loadNotifications?.[3]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          replayed: true,
          call: {
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.loadNotifications?.[4]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          replayed: true,
          call: {
            status: 'completed',
          },
        },
      },
    });
    expect(result.loadNotifications?.[5]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'agent_message_chunk',
          replayed: true,
          content: '你好',
        },
      },
    });
    expect(result.loadNotifications?.[6]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'agent_message_chunk',
          replayed: true,
          content: '，主人',
        },
      },
    });
    expect(result.loadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 14,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.terminalLoadSessionNewResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 92,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.terminalLoadCreateResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 93,
      result: {
        terminalId: expect.any(String),
      },
    });
    // D-200：终端还在另一个网关进程里，本进程加载时视为已释放并在响应中告知
    const terminalLoadTerminalId = readTerminalId(
      result.terminalLoadCreateResponse,
    );
    expect(result.loadTerminalReleasedResponse).toEqual({
      jsonrpc: '2.0',
      id: 94,
      result: {
        sessionId: expect.any(String),
        releasedTerminalIds: [terminalLoadTerminalId],
      },
    });
    expect(result.loadReleasedTerminalOutputResponse).toMatchObject({
      id: 95,
      error: {
        code: -32602,
        data: {
          reason: 'terminal_not_found',
          terminalId: terminalLoadTerminalId,
        },
      },
    });
    expect(result.continuityDroppedAuditRows).toEqual([
      {
        event_type: 'acp.terminal.server_sandbox.continuity_dropped',
        metadata: expect.objectContaining({
          terminalId: terminalLoadTerminalId,
        }),
      },
    ]);
    // 断开时清理已持久化空 continuity，新连接加载后会话与沙箱终端照常可用
    expect(result.loadAfterDisconnectResponse).toEqual({
      jsonrpc: '2.0',
      id: 154,
      result: { sessionId: expect.any(String) },
    });
    expect(result.loadAfterDisconnectTerminalCreateResponse).toMatchObject({
      id: 155,
      result: { terminalId: expect.any(String) },
    });

    expect(result.loadFsReadNotifications).toEqual([]);
    expect(result.loadFsReadServerRequests).toHaveLength(1);
    expect(result.loadFsReadServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'fs/read_text_file',
      params: {
        sessionId: expect.any(String),
        path: `${SANDBOX_SESSION_CWD}/notes/loaded.txt`,
      },
    });
    expect(result.loadFsReadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 65,
      result: {
        content: [
          {
            type: 'text',
            text: '恢复后的客户端文件内容',
          },
        ],
      },
    });
    expect(result.loadSandboxReadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 73,
      result: {
        content: [
          {
            type: 'text',
            text: '来自沙箱的文件内容',
          },
        ],
      },
    });

    expect(result.loadPromptServerRequests).toHaveLength(1);
    expect(result.loadPromptServerRequests?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: {
        sessionId: expect.any(String),
      },
    });
    expect(result.loadPromptNotifications).toHaveLength(6);
    expect(result.loadPromptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'plan',
        },
      },
    });
    expect(result.loadPromptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 15,
      result: {
        stopReason: 'end_turn',
      },
    });

    expect(result.mcpLoadNotifications).toHaveLength(4);
    expect(result.mcpLoadNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: expect.any(String),
        update: {
          type: 'user_message',
          replayed: true,
          content: [
            {
              type: 'text',
              text: '请通过 MCP 查询 AgentLoom。',
            },
          ],
        },
      },
    });
    expect(result.mcpLoadNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          replayed: true,
          call: {
            tool: 'docs/search',
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.mcpLoadNotifications?.[2]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          replayed: true,
          call: {
            tool: 'docs/search',
            status: 'completed',
          },
        },
      },
    });
    expect(result.mcpLoadNotifications?.[3]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'agent_message_chunk',
          replayed: true,
          content:
            '已通过 docs/search 获取：fixture-search:请通过 MCP 查询 AgentLoom。',
        },
      },
    });
    expect(result.mcpLoadResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 104,
      result: {
        sessionId: expect.any(String),
      },
    });
    expect(result.mcpLoadPromptServerRequests).toEqual([]);
    expect(result.mcpLoadPromptNotifications).toHaveLength(3);
    expect(result.mcpLoadPromptNotifications?.[0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          call: {
            tool: 'docs/search',
            args: {
              query: '请在恢复后再次通过 MCP 查询 AgentLoom。',
            },
            status: 'in_progress',
          },
        },
      },
    });
    expect(result.mcpLoadPromptNotifications?.[1]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'tool_call',
          call: {
            tool: 'docs/search',
            status: 'completed',
            result: {
              content: [
                {
                  type: 'text',
                  text: 'fixture-search:请在恢复后再次通过 MCP 查询 AgentLoom。',
                },
              ],
            },
          },
        },
      },
    });
    expect(result.mcpLoadPromptNotifications?.[2]).toMatchObject({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          type: 'agent_message_chunk',
          content:
            '已通过 docs/search 获取：fixture-search:请在恢复后再次通过 MCP 查询 AgentLoom。',
        },
      },
    });
    expect(result.mcpLoadPromptResponse).toMatchObject({
      jsonrpc: '2.0',
      id: 105,
      result: {
        stopReason: 'end_turn',
      },
    });

    for (const line of result.protocolLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }, 200_000);
});
