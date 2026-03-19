import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_DIR = '/root/Projects/Ling/AgentLoomAUTO/agentloom-server';
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const TEST_JWT_SECRET = 'test-e2e-jwt-secret';
const TEST_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TEST_MASTER_ENCRYPTION_KEY =
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
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
  promptServerRequests?: JsonRpcRequest[];
  promptNotifications?: JsonRpcNotification[];
  promptResponse?: JsonRpcResponse;
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
  loadPromptServerRequests?: JsonRpcRequest[];
  loadPromptNotifications?: JsonRpcNotification[];
  loadPromptResponse?: JsonRpcResponse;
  error?: {
    message: string;
    stack?: string;
  };
};

async function buildAcpStdioEntry() {
  const child = spawn(PNPM_BIN, ['exec', 'nest', 'build', '--path', 'tsconfig.build.json'], {
    cwd: SERVER_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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
  throw new Error(output || `ACP stdio build failed with exit code ${String(exitCode)}`);
}

function createAcpHelperEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ACP_TEST_SERVER_DIR: SERVER_DIR,
    ACP_TEST_DATABASE_URL: databaseUrl,
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
  timeoutMs = 20_000,
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  result: AcpStdioScenarioResult;
}> {
  const child = spawn(process.execPath, ['./scripts/run-acp-stdio-e2e-helper.mjs'], {
    cwd: SERVER_DIR,
    env: createAcpHelperEnv(databaseUrl),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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
    );
  }

  return {
    exitCode,
    stdout,
    stderr,
    result,
  };
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
  }, 60_000);

  afterAll(async () => {
    await container.stop();
  }, 30_000);

  it(
    '应通过 stdio 处理协议版本协商、initialize、authenticate、坏 JSON 与 revoked token，且 stdout 仅输出协议帧',
    async () => {
      const { exitCode, stderr, result } = await runAcpStdioScenario(
        container.getConnectionUri(),
      );

      expect(stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(result.ok, result.error?.stack ?? result.error?.message).toBe(true);
      expect(result.stderr).toBe('');
      expect(result.childExitCode).toBeNull();
      expect(result.initializedNotificationSilent).toBe(true);
      expect(result.loadInitializedNotificationSilent).toBe(true);
      expect(result.protocolLines.length).toBeGreaterThanOrEqual(25);

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
            },
          },
        },
      });

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

      for (const line of result.protocolLines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    },
    30_000,
  );
});
