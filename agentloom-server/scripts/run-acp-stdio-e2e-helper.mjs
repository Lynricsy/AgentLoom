import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import postgres from 'postgres';

const SERVER_DIR = process.env.ACP_TEST_SERVER_DIR ?? process.cwd();
const DATABASE_URL = process.env.ACP_TEST_DATABASE_URL;
const TEST_JWT_SECRET = process.env.ACP_TEST_JWT_SECRET ?? 'test-e2e-jwt-secret';
const TEST_TENANT_ID =
  process.env.ACP_TEST_TENANT_ID ?? '11111111-1111-4111-8111-111111111111';
const TEST_ORG_ID =
  process.env.ACP_TEST_ORG_ID ?? '22222222-2222-4222-8222-222222222222';
const TEST_MASTER_ENCRYPTION_KEY =
  process.env.ACP_TEST_MASTER_ENCRYPTION_KEY ??
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const ACP_CHILD_ENV_KEYS = [
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
];

if (!DATABASE_URL) {
  throw new Error('ACP_TEST_DATABASE_URL is required');
}

function createAccessToken(payload) {
  return jwt.sign(
    {
      aud: 'authenticated',
      email: 'user@example.com',
      sub: 'user-1',
      ...payload,
    },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createJsonRpcRequest(id, method, params) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

function createJsonRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function createAcpChildEnv(databaseUrl) {
  const env = {
    NODE_ENV: 'test',
    ACP_TEST_FAKE_RUNTIME: '1',
    APP_DEPLOYMENT_MODE: 'private',
    APP_DATABASE_URL: databaseUrl,
    APP_JWT_SECRET: TEST_JWT_SECRET,
    APP_REDIS_URL: 'redis://localhost:6379',
    APP_MASTER_ENCRYPTION_KEY: TEST_MASTER_ENCRYPTION_KEY,
    APP_OAUTH_REDIRECT_URL: 'http://localhost:3000/auth/callback',
    APP_FRONTEND_URL: 'http://localhost:5173',
    APP_SUPABASE_URL: '',
    APP_SUPABASE_ANON_KEY: '',
    APP_SUPABASE_SERVICE_KEY: '',
  };

  for (const key of ACP_CHILD_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

class StdoutLineReader {
  lines = [];
  protocolLines = [];
  bufferedOutput = '';
  waiters = [];

  constructor(child, getStderr) {
    this.child = child;
    this.getStderr = getStderr;
    this.onData = (chunk) => {
      this.bufferedOutput += chunk.toString();

      while (true) {
        const newlineIndex = this.bufferedOutput.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const line = this.bufferedOutput.slice(0, newlineIndex).replace(/\r$/, '');
        this.bufferedOutput = this.bufferedOutput.slice(newlineIndex + 1);
        this.protocolLines.push(line);

        if (this.waiters.length > 0) {
          const waiter = this.waiters.shift();
          clearTimeout(waiter.timeout);
          this.child.off('exit', waiter.onExit);
          waiter.resolve(line);
          continue;
        }

        this.lines.push(line);
      }
    };

    this.child.stdout.on('data', this.onData);
  }

  async nextLine(timeoutMs = 5_000) {
    if (this.lines.length > 0) {
      return this.lines.shift();
    }

    return await new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeout: undefined,
        onExit: undefined,
      };

      const cleanup = () => {
        if (waiter.timeout !== undefined) {
          clearTimeout(waiter.timeout);
        }

        if (waiter.onExit !== undefined) {
          this.child.off('exit', waiter.onExit);
        }

        const waiterIndex = this.waiters.indexOf(waiter);
        if (waiterIndex !== -1) {
          this.waiters.splice(waiterIndex, 1);
        }
      };

      waiter.onExit = (code, signal) => {
        cleanup();
        reject(
          new Error(
            `ACP stdio child exited before emitting a line (code=${code}, signal=${signal}). stderr: ${this.getStderr()}. buffered stdout: ${this.bufferedOutput}`,
          ),
        );
      };

      waiter.timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timed out waiting for ACP stdio output. stderr: ${this.getStderr()}. buffered stdout: ${this.bufferedOutput}`,
          ),
        );
      }, timeoutMs);

      this.waiters.push(waiter);
      this.child.once('exit', waiter.onExit);
    });
  }

  async nextJson(timeoutMs = 5_000) {
    const line = await this.nextLine(timeoutMs);
    return JSON.parse(line);
  }

  close() {
    this.child.stdout.off('data', this.onData);
  }
}

function spawnAcpProcess(databaseUrl) {
  const distEntry = path.join(SERVER_DIR, 'dist', 'src', 'acp-stdio.js');
  const child = spawn(process.execPath, [distEntry], {
    cwd: SERVER_DIR,
    env: createAcpChildEnv(databaseUrl),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdin.setDefaultEncoding('utf8');
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    stdout: new StdoutLineReader(child, () => stderr),
    getStderr: () => stderr,
  };
}

async function initializeAndAuthenticate(child, stdout, token, initializeId, authId) {
  await writeJsonRpc(
    child,
    createJsonRpcRequest(initializeId, 'initialize', {
      protocolVersion: '2026-02-18',
      clientCapabilities: {
        sampling: false,
        fs: {
          read: true,
          write: false,
        },
        terminal: {
          create: true,
          output: true,
        },
        mcpServers: true,
      },
    }),
  );
  const initializeResponse = await stdout.nextJson(10_000);

  await writeJsonRpc(child, {
    jsonrpc: '2.0',
    method: 'initialized',
  });
  const initializedNotificationSilent = await expectNoStdoutLine(stdout);

  await writeJsonRpc(
    child,
    createJsonRpcRequest(authId, 'authenticate', {
      token,
    }),
  );
  const authResponse = await stdout.nextJson(10_000);

  return {
    initializeResponse,
    initializedNotificationSilent,
    authResponse,
  };
}

async function writeRawLine(child, line) {
  if (child.stdin.write(`${line}\n`)) {
    return;
  }

  await once(child.stdin, 'drain');
}

async function writeJsonRpc(child, message) {
  await writeRawLine(child, JSON.stringify(message));
}

async function collectUntilResponse(
  child,
  stdout,
  requestId,
  {
    timeoutMs = 10_000,
    onServerRequest,
  } = {},
) {
  const notifications = [];
  const serverRequests = [];

  while (true) {
    const message = await stdout.nextJson(timeoutMs);

    if (
      message !== null &&
      typeof message === 'object' &&
      'method' in message &&
      typeof message.method === 'string' &&
      'id' in message
    ) {
      serverRequests.push(message);
      if (onServerRequest) {
        await onServerRequest(message);
      }
      continue;
    }

    if (
      message !== null &&
      typeof message === 'object' &&
      'id' in message &&
      message.id === requestId
    ) {
      return {
        notifications,
        serverRequests,
        response: message,
      };
    }

    notifications.push(message);
  }
}

async function expectNoStdoutLine(stdout, timeoutMs = 300) {
  try {
    await stdout.nextLine(timeoutMs);
    throw new Error('Expected ACP stdio notification to remain silent');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Timed out waiting for ACP stdio output')
    ) {
      return true;
    }

    throw error;
  }
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
        resolve();
      }, 2_000);
    }),
  ]);
}

async function writeResult(result) {
  await new Promise((resolve, reject) => {
    const payload = JSON.stringify(result);
    if (process.stdout.write(payload)) {
      resolve();
      return;
    }

    process.stdout.once('drain', resolve);
    process.stdout.once('error', reject);
  });
}

async function runScenario() {
  const sql = postgres(DATABASE_URL);

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash varchar(64) PRIMARY KEY,
        user_id varchar(36),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz DEFAULT now() NOT NULL
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS acp_conversation_sessions (
        session_id text PRIMARY KEY,
        tenant_id text NOT NULL,
        agent_id text NOT NULL,
        session_snapshot jsonb NOT NULL,
        replay_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql`DELETE FROM revoked_tokens`;
    await sql`DELETE FROM acp_conversation_sessions`;

    const { child, stdout, getStderr } = spawnAcpProcess(DATABASE_URL);
    let loadProcess;

    try {
      await writeJsonRpc(
        child,
        createJsonRpcRequest(1, 'initialize', {
          protocolVersion: '2025-01-01',
          clientCapabilities: {},
        }),
      );

      const unsupportedInitializeResponse = await stdout.nextJson(10_000);

      const validToken = createAccessToken({
        org_id: TEST_ORG_ID,
        tenant_id: TEST_TENANT_ID,
        tenant_role: 'owner',
      });
      const {
        initializeResponse,
        initializedNotificationSilent,
        authResponse: validAuthResponse,
      } = await initializeAndAuthenticate(child, stdout, validToken, 2, 3);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(6, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SERVER_DIR,
        }),
      );
      const sessionNewResponse = await stdout.nextJson(10_000);
      const sessionId = sessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(7, 'session/prompt', {
          sessionId,
          content: [
            {
              type: 'text',
              text: '请正常完成一次回复。',
            },
          ],
        }),
      );
      const promptConversation = await collectUntilResponse(child, stdout, 7, {
        timeoutMs: 10_000,
        onServerRequest: async (request) => {
          if (request.method !== 'session/request_permission') {
            return;
          }

          await writeJsonRpc(
            child,
            createJsonRpcResponse(request.id, {
              outcome: {
                outcome: 'selected',
                optionId: 'allow-once',
              },
            }),
          );
        },
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(8, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SERVER_DIR,
        }),
      );
      const cancelSessionNewResponse = await stdout.nextJson(10_000);
      const cancelSessionId = cancelSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(9, 'session/prompt', {
          sessionId: cancelSessionId,
          content: [
            {
              type: 'text',
              text: '请在取消前先输出一些更新。',
            },
          ],
        }),
      );
      const cancelPromptFirstFrame = await stdout.nextJson(10_000);
      const cancelPromptSecondFrame = await stdout.nextJson(10_000);
      const cancelPromptPermissionRequest = await stdout.nextJson(10_000);

      await writeJsonRpc(child, {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId: cancelSessionId,
        },
      });
      const cancelPromptConversation = await collectUntilResponse(
        child,
        stdout,
        9,
        {
          timeoutMs: 10_000,
        },
      );

      await writeRawLine(child, '{"jsonrpc":"2.0"');
      const parseErrorResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(child, {
        jsonrpc: '2.0',
        id: {
          invalid: true,
        },
        method: 'authenticate',
        params: {
          token: validToken,
        },
      });
      const invalidIdResponse = await stdout.nextJson(10_000);

      const secondValidToken = createAccessToken({
        org_id: TEST_ORG_ID,
        tenant_id: TEST_TENANT_ID,
        tenant_role: 'owner',
        jti: crypto.randomUUID(),
      });
      await writeJsonRpc(
        child,
        createJsonRpcRequest(4, 'authenticate', {
          token: secondValidToken,
        }),
      );
      const secondValidAuthResponse = await stdout.nextJson(10_000);

      const revokedToken = createAccessToken({
        org_id: TEST_ORG_ID,
        tenant_id: TEST_TENANT_ID,
        tenant_role: 'owner',
        jti: crypto.randomUUID(),
      });
      await sql`
        INSERT INTO revoked_tokens (token_hash, user_id, expires_at)
        VALUES (${hashToken(revokedToken)}, ${'user-1'}, ${new Date(Date.now() + 3_600_000)})
      `;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(5, 'authenticate', {
          token: revokedToken,
        }),
      );
      const revokedResponse = await stdout.nextJson(10_000);

      loadProcess = spawnAcpProcess(DATABASE_URL);
      const {
        initializeResponse: loadInitializeResponse,
        initializedNotificationSilent: loadInitializedNotificationSilent,
        authResponse: loadAuthResponse,
      } = await initializeAndAuthenticate(
        loadProcess.child,
        loadProcess.stdout,
        validToken,
        12,
        13,
      );

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(14, 'session/load', {
          sessionId,
        }),
      );
      const loadConversation = await collectUntilResponse(
        loadProcess.child,
        loadProcess.stdout,
        14,
        {
          timeoutMs: 10_000,
        },
      );

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(15, 'session/prompt', {
          sessionId,
          content: [
            {
              type: 'text',
              text: '请在恢复后继续一次回复。',
            },
          ],
        }),
      );
      const loadPromptConversation = await collectUntilResponse(
        loadProcess.child,
        loadProcess.stdout,
        15,
        {
          timeoutMs: 10_000,
          onServerRequest: async (request) => {
            if (request.method !== 'session/request_permission') {
              return;
            }

            await writeJsonRpc(
              loadProcess.child,
              createJsonRpcResponse(request.id, {
                outcome: {
                  outcome: 'selected',
                  optionId: 'allow-once',
                },
              }),
            );
          },
        },
      );

      const result = {
        ok: true,
        protocolLines: [...stdout.protocolLines, ...loadProcess.stdout.protocolLines],
        stderr: getStderr(),
        childExitCode: child.exitCode,
        initializedNotificationSilent,
        unsupportedInitializeResponse,
        initializeResponse,
        validAuthResponse,
        sessionNewResponse,
        promptServerRequests: promptConversation.serverRequests,
        promptNotifications: promptConversation.notifications,
        promptResponse: promptConversation.response,
        cancelSessionNewResponse,
        cancelPromptPermissionRequest,
        cancelPromptNotifications: [
          cancelPromptFirstFrame,
          cancelPromptSecondFrame,
          ...cancelPromptConversation.notifications,
        ],
        cancelPromptResponse: cancelPromptConversation.response,
        parseErrorResponse,
        invalidIdResponse,
        secondValidAuthResponse,
        revokedResponse,
        loadInitializeResponse,
        loadInitializedNotificationSilent,
        loadAuthResponse,
        loadNotifications: loadConversation.notifications,
        loadResponse: loadConversation.response,
        loadPromptServerRequests: loadPromptConversation.serverRequests,
        loadPromptNotifications: loadPromptConversation.notifications,
        loadPromptResponse: loadPromptConversation.response,
      };

      await writeResult(result);
      process.exitCode = 0;
    } catch (error) {
      await writeResult({
        ok: false,
        protocolLines: stdout.protocolLines,
        stderr: getStderr(),
        childExitCode: child.exitCode,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      process.exitCode = 1;
    } finally {
      if (loadProcess) {
        loadProcess.stdout.close();
        await stopChild(loadProcess.child);
      }
      stdout.close();
      await stopChild(child);
    }
  } finally {
    await sql.end();
  }
}

await runScenario();
