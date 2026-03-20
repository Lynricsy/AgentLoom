import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
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
const TEST_CREATED_BY_USER_ID =
  process.env.ACP_TEST_CREATED_BY_USER_ID ??
  '33333333-3333-4333-8333-333333333333';
const TEST_SUPABASE_USER_ID =
  process.env.ACP_TEST_SUPABASE_USER_ID ??
  '44444444-4444-4444-8444-444444444444';
const TEST_WORKFLOW_DEFINITION_ID =
  process.env.ACP_TEST_WORKFLOW_DEFINITION_ID ??
  '55555555-5555-4555-8555-555555555555';
const TEST_WORKFLOW_VERSION_ID =
  process.env.ACP_TEST_WORKFLOW_VERSION_ID ??
  '66666666-6666-4666-8666-666666666666';
const TEST_EXECUTION_ID =
  process.env.ACP_TEST_SANDBOX_EXECUTION_ID ??
  '019391d4-e000-7000-0000-000000000005';
const TEST_SANDBOX_SESSION_ID =
  process.env.ACP_TEST_SANDBOX_SESSION_ID ??
  '77777777-7777-4777-8777-777777777777';
const SANDBOX_SESSION_CWD = '/workspace/demo';
const MCP_STDIO_FIXTURE_PATH = path.join(
  SERVER_DIR,
  'scripts',
  'acp-test-mcp-stdio-server.mjs',
);
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
    ACP_TEST_TERMINAL_TIMEOUT_MS: '200',
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

function createMcpServersConfig() {
  return {
    docs: {
      transportType: 'stdio',
      command: process.execPath,
      args: [MCP_STDIO_FIXTURE_PATH],
    },
  };
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
          readTextFile: true,
          writeTextFile: true,
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
  let sandboxWorkspaceRoot;

  try {
    sandboxWorkspaceRoot = await mkdtemp(
      path.join(tmpdir(), 'agentloom-acp-sandbox-'),
    );
    await mkdir(path.join(sandboxWorkspaceRoot, 'demo', 'notes'), {
      recursive: true,
    });
    await writeFile(
      path.join(sandboxWorkspaceRoot, 'demo', 'notes', 'sandbox.txt'),
      '来自沙箱的文件内容',
      'utf8',
    );
    await writeFile(
      path.join(sandboxWorkspaceRoot, 'demo', 'notes', 'oversized.txt'),
      Buffer.alloc(10 * 1024 * 1024 + 1, 'a'),
    );
    await writeFile(
      path.join(sandboxWorkspaceRoot, 'demo', 'notes', 'binary.bin'),
      Buffer.from([0x00, 0x61, 0x62, 0x63]),
    );

    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS auth`);
    await sql.unsafe(`
      DO $$
      BEGIN
        CREATE ROLE authenticated;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
    await sql.unsafe(`
      DO $$
      BEGIN
        CREATE TYPE audit_actor_type AS ENUM ('user', 'system', 'service');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
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
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        actor_id uuid,
        actor_type audit_actor_type NOT NULL,
        event_type text NOT NULL,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        execution_id uuid,
        summary text NOT NULL,
        before jsonb,
        after jsonb,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        supabase_user_id uuid NOT NULL,
        email varchar(255) NOT NULL,
        display_name varchar(100),
        avatar_url varchar(500),
        is_active boolean NOT NULL DEFAULT true,
        current_organization_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        name varchar(255) NOT NULL,
        slug varchar(255) NOT NULL,
        description text,
        nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
        edges jsonb NOT NULL DEFAULT '[]'::jsonb,
        viewport jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        input_schema jsonb,
        version integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'draft',
        published_version_id uuid,
        created_by uuid NOT NULL,
        updated_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS workflow_versions (
        id uuid PRIMARY KEY,
        workflow_definition_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        version_number integer NOT NULL,
        label varchar(255),
        snapshot jsonb NOT NULL,
        published_at timestamptz,
        archived_at timestamptz,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS workflow_executions (
        id uuid PRIMARY KEY,
        workflow_definition_id uuid NOT NULL,
        workflow_version_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        trigger_type text NOT NULL DEFAULT 'manual',
        input_params jsonb NOT NULL DEFAULT '{}'::jsonb,
        definition_snapshot jsonb NOT NULL,
        started_at timestamptz,
        completed_at timestamptz,
        failed_at timestamptz,
        cancelled_at timestamptz,
        error_message jsonb,
        total_steps integer NOT NULL DEFAULT 0,
        completed_steps integer NOT NULL DEFAULT 0,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS sandbox_sessions (
        id uuid PRIMARY KEY,
        execution_id uuid NOT NULL,
        sandbox_node_id varchar(64) NOT NULL,
        tenant_id uuid NOT NULL,
        container_id varchar(128),
        status text NOT NULL DEFAULT 'creating',
        config jsonb NOT NULL,
        workspace_path varchar(256),
        started_at timestamptz,
        stopped_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON revoked_tokens TO authenticated`);
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON acp_conversation_sessions TO authenticated`,
    );
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO authenticated`);
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON sandbox_sessions TO authenticated`);
    await sql`DELETE FROM revoked_tokens`;
    await sql`DELETE FROM acp_conversation_sessions`;
    await sql`DELETE FROM audit_logs`;
    await sql`DELETE FROM sandbox_sessions WHERE execution_id = ${TEST_EXECUTION_ID}`;
    await sql`DELETE FROM workflow_executions WHERE id = ${TEST_EXECUTION_ID}`;
    await sql`DELETE FROM workflow_versions WHERE id = ${TEST_WORKFLOW_VERSION_ID}`;
    await sql`DELETE FROM workflow_definitions WHERE id = ${TEST_WORKFLOW_DEFINITION_ID}`;

    await sql`
      INSERT INTO auth.users (id)
      VALUES (${TEST_SUPABASE_USER_ID})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO users (id, supabase_user_id, email, display_name)
      VALUES (
        ${TEST_CREATED_BY_USER_ID},
        ${TEST_SUPABASE_USER_ID},
        ${'sandbox-owner@example.com'},
        ${'Sandbox Owner'}
      )
      ON CONFLICT (id) DO NOTHING
    `;

    const workflowSnapshot = {
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        nodeCount: 0,
        edgeCount: 0,
        createdFromVersion: 1,
      },
    };

    await sql`
      INSERT INTO workflow_definitions (
        id,
        tenant_id,
        name,
        slug,
        nodes,
        edges,
        viewport,
        metadata,
        input_schema,
        version,
        status,
        created_by,
        updated_by
      )
      VALUES (
        ${TEST_WORKFLOW_DEFINITION_ID},
        ${TEST_TENANT_ID},
        ${'ACP Sandbox E2E'},
        ${'acp-sandbox-e2e'},
        ${[]},
        ${[]},
        ${null},
        ${{}},
        ${null},
        ${1},
        ${'draft'},
        ${TEST_CREATED_BY_USER_ID},
        ${TEST_CREATED_BY_USER_ID}
      )
    `;
    await sql`
      INSERT INTO workflow_versions (
        id,
        workflow_definition_id,
        tenant_id,
        version_number,
        snapshot,
        created_by
      )
      VALUES (
        ${TEST_WORKFLOW_VERSION_ID},
        ${TEST_WORKFLOW_DEFINITION_ID},
        ${TEST_TENANT_ID},
        ${1},
        ${workflowSnapshot},
        ${TEST_CREATED_BY_USER_ID}
      )
    `;
    await sql`
      INSERT INTO workflow_executions (
        id,
        workflow_definition_id,
        workflow_version_id,
        tenant_id,
        status,
        trigger_type,
        input_params,
        definition_snapshot,
        created_by
      )
      VALUES (
        ${TEST_EXECUTION_ID},
        ${TEST_WORKFLOW_DEFINITION_ID},
        ${TEST_WORKFLOW_VERSION_ID},
        ${TEST_TENANT_ID},
        ${'running'},
        ${'manual'},
        ${{}},
        ${workflowSnapshot},
        ${TEST_CREATED_BY_USER_ID}
      )
    `;
    await sql`
      INSERT INTO sandbox_sessions (
        id,
        execution_id,
        sandbox_node_id,
        tenant_id,
        container_id,
        status,
        config,
        workspace_path
      )
      VALUES (
        ${TEST_SANDBOX_SESSION_ID},
        ${TEST_EXECUTION_ID},
        ${'sandbox-node-1'},
        ${TEST_TENANT_ID},
        ${'sandbox-container-1'},
        ${'ready'},
        ${{ cpu: 1, memory: 256, disk: 1, timeout: 1 }},
        ${sandboxWorkspaceRoot}
      )
    `;

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
          cwd: SANDBOX_SESSION_CWD,
          serverSandbox: {
            executionId: TEST_EXECUTION_ID,
          },
        }),
      );
      const sessionNewResponse = await stdout.nextJson(10_000);
      const sessionId = sessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(74, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
          serverSandbox: {
            executionId: TEST_EXECUTION_ID,
          },
        }),
      );
      const terminalSessionNewResponse = await stdout.nextJson(10_000);
      const terminalSessionId = terminalSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(75, 'terminal/create', {
          sessionId: terminalSessionId,
          command: 'node',
          args: [
            '-e',
            "process.stdout.write('terminal-output'),setTimeout(() => process.exit(0), 150)",
          ],
          mode: 'server_sandbox',
        }),
      );
      const terminalCreateResponse = await stdout.nextJson(10_000);
      if (typeof terminalCreateResponse?.result?.terminalId !== 'string') {
        throw new Error(
          `Unexpected terminal/create response: ${JSON.stringify(terminalCreateResponse)}`,
        );
      }
      const terminalId = terminalCreateResponse.result.terminalId;
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(76, 'terminal/output', {
          sessionId: terminalSessionId,
          terminalId,
          outputByteLimit: 8,
        }),
      );
      const terminalBoundedOutputResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(77, 'terminal/output', {
          sessionId: terminalSessionId,
          terminalId,
          offset: 8,
        }),
      );
      const terminalTailOutputResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(78, 'terminal/wait_for_exit', {
          sessionId: terminalSessionId,
          terminalId,
        }),
      );
      const terminalWaitForExitResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(79, 'terminal/create', {
          sessionId: terminalSessionId,
          command: 'rm',
          args: ['-rf', '/'],
          mode: 'server_sandbox',
        }),
      );
      const terminalRejectResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(80, 'terminal/output', {
          sessionId: terminalSessionId,
          terminalId,
        }),
      );
      const terminalExitedOutputResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(81, 'terminal/create', {
          sessionId: terminalSessionId,
          command: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
          mode: 'server_sandbox',
        }),
      );
      const terminalTimeoutCreateResponse = await stdout.nextJson(10_000);
      const terminalTimeoutId = terminalTimeoutCreateResponse.result.terminalId;
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
      await writeJsonRpc(
        child,
        createJsonRpcRequest(82, 'terminal/wait_for_exit', {
          sessionId: terminalSessionId,
          terminalId: terminalTimeoutId,
        }),
      );
      const terminalTimeoutWaitForExitResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(83, 'terminal/create', {
          sessionId: terminalSessionId,
          command: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
          mode: 'server_sandbox',
        }),
      );
      const terminalKillCreateResponse = await stdout.nextJson(10_000);
      const terminalKillId = terminalKillCreateResponse.result.terminalId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(84, 'terminal/kill', {
          sessionId: terminalSessionId,
          terminalId: terminalKillId,
        }),
      );
      const terminalKillResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(85, 'terminal/output', {
          sessionId: terminalSessionId,
          terminalId: terminalKillId,
        }),
      );
      const terminalKilledOutputResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(86, 'terminal/create', {
          sessionId: terminalSessionId,
          command: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
          mode: 'server_sandbox',
        }),
      );
      const terminalReleaseCreateResponse = await stdout.nextJson(10_000);
      const terminalReleaseId = terminalReleaseCreateResponse.result.terminalId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(87, 'terminal/release', {
          sessionId: terminalSessionId,
          terminalId: terminalReleaseId,
        }),
      );
      const terminalReleaseResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(88, 'terminal/output', {
          sessionId: terminalSessionId,
          terminalId: terminalReleaseId,
        }),
      );
      const terminalReleaseOutputResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(89, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
          serverSandbox: {
            executionId: TEST_EXECUTION_ID,
          },
        }),
      );
      const terminalCancelSessionNewResponse = await stdout.nextJson(10_000);
      const terminalCancelSessionId = terminalCancelSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(90, 'terminal/create', {
          sessionId: terminalCancelSessionId,
          command: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
          mode: 'server_sandbox',
        }),
      );
      const terminalCancelCreateResponse = await stdout.nextJson(10_000);
      const terminalCancelId = terminalCancelCreateResponse.result.terminalId;

      await writeJsonRpc(child, {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId: terminalCancelSessionId,
        },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      await writeJsonRpc(
        child,
        createJsonRpcRequest(91, 'terminal/output', {
          sessionId: terminalCancelSessionId,
          terminalId: terminalCancelId,
        }),
      );
      const terminalCancelOutputResponse = await stdout.nextJson(10_000);

      const terminalKilledAuditRows = await sql`
        SELECT event_type, metadata
        FROM audit_logs
        WHERE event_type = 'acp.terminal.server_sandbox.killed'
        ORDER BY created_at ASC
      `;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(92, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
          serverSandbox: {
            executionId: TEST_EXECUTION_ID,
          },
        }),
      );
      const terminalLoadSessionNewResponse = await stdout.nextJson(10_000);
      const terminalLoadSessionId = terminalLoadSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(93, 'terminal/create', {
          sessionId: terminalLoadSessionId,
          command: 'node',
          args: ['-e', 'setInterval(() => {}, 1000)'],
          mode: 'server_sandbox',
        }),
      );
      const terminalLoadCreateResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(60, 'fs/read_text_file', {
          sessionId,
          path: './notes/sandbox.txt',
          mode: 'server_sandbox',
        }),
      );
      const sandboxReadResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(61, 'fs/read_text_file', {
          sessionId,
          path: './notes/readme.txt',
          mode: 'client_proxy',
        }),
      );
      const fsReadConversation = await collectUntilResponse(child, stdout, 61, {
        timeoutMs: 10_000,
        onServerRequest: async (request) => {
          if (request.method !== 'fs/read_text_file') {
            return;
          }

          await writeJsonRpc(
            child,
            createJsonRpcResponse(request.id, {
              text: '来自客户端的文件内容',
            }),
          );
        },
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(62, 'fs/write_text_file', {
          sessionId,
          path: './notes/write.txt',
          content: 'updated from client proxy',
          mode: 'client_proxy',
        }),
      );
      const fsWriteConversation = await collectUntilResponse(child, stdout, 62, {
        timeoutMs: 10_000,
        onServerRequest: async (request) => {
          if (request.method === 'session/request_permission') {
            await writeJsonRpc(
              child,
              createJsonRpcResponse(request.id, {
                outcome: {
                  outcome: 'selected',
                  optionId: 'allow-once',
                },
              }),
            );
            return;
          }

          if (request.method !== 'fs/write_text_file') {
            return;
          }

          await writeJsonRpc(
            child,
            createJsonRpcResponse(request.id, {
              success: true,
            }),
          );
        },
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(66, 'fs/write_text_file', {
          sessionId,
          path: './notes/write-denied.txt',
          content: 'should be denied',
          mode: 'client_proxy',
        }),
      );
      const fsWriteDeniedConversation = await collectUntilResponse(child, stdout, 66, {
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
                optionId: 'reject-once',
              },
            }),
          );
        },
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(67, 'fs/write_text_file', {
          sessionId,
          path: './notes/write-cancelled.txt',
          content: 'should be cancelled',
          mode: 'client_proxy',
        }),
      );
      const fsWriteCancelledConversation = await collectUntilResponse(child, stdout, 67, {
        timeoutMs: 10_000,
        onServerRequest: async (request) => {
          if (request.method !== 'session/request_permission') {
            return;
          }

          await writeJsonRpc(
            child,
            createJsonRpcResponse(request.id, {
              outcome: {
                outcome: 'cancelled',
              },
            }),
          );
        },
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(68, 'fs/write_text_file', {
          sessionId,
          path: './notes/write-sandbox.txt',
          content: 'updated from sandbox',
          mode: 'server_sandbox',
        }),
      );
      const sandboxWriteConversation = await collectUntilResponse(child, stdout, 68, {
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
        createJsonRpcRequest(69, 'fs/read_text_file', {
          sessionId,
          path: '../../../etc/passwd',
          mode: 'server_sandbox',
        }),
      );
      const sandboxTraversalResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(70, 'fs/read_text_file', {
          sessionId,
          path: './notes/oversized.txt',
          mode: 'server_sandbox',
        }),
      );
      const sandboxOversizeResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(71, 'fs/read_text_file', {
          sessionId,
          path: './notes/binary.bin',
          mode: 'server_sandbox',
        }),
      );
      const sandboxBinaryResponse = await stdout.nextJson(10_000);

      await writeJsonRpc(
        child,
        createJsonRpcRequest(63, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
        }),
      );
      const fsCancelSessionNewResponse = await stdout.nextJson(10_000);
      const fsCancelSessionId = fsCancelSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(64, 'fs/read_text_file', {
          sessionId: fsCancelSessionId,
          path: './notes/cancelled.txt',
          mode: 'client_proxy',
        }),
      );
      const fsCancelServerRequest = await stdout.nextJson(10_000);

      await writeJsonRpc(child, {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId: fsCancelSessionId,
        },
      });
      const fsCancelConversation = await collectUntilResponse(child, stdout, 64, {
        timeoutMs: 10_000,
      });

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
        createJsonRpcRequest(16, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
          mcpServers: createMcpServersConfig(),
        }),
      );
      const mcpSessionNewResponse = await stdout.nextJson(10_000);
      const mcpSessionId = mcpSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(17, 'session/prompt', {
          sessionId: mcpSessionId,
          content: [
            {
              type: 'text',
              text: '请通过 MCP 查询 AgentLoom。',
            },
          ],
        }),
      );
      const mcpPromptConversation = await collectUntilResponse(child, stdout, 17, {
        timeoutMs: 10_000,
      });

      await writeJsonRpc(
        child,
        createJsonRpcRequest(18, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
          mcpServers: createMcpServersConfig(),
        }),
      );
      const mcpCancelSessionNewResponse = await stdout.nextJson(10_000);
      const mcpCancelSessionId = mcpCancelSessionNewResponse.result.sessionId;

      await writeJsonRpc(
        child,
        createJsonRpcRequest(19, 'session/prompt', {
          sessionId: mcpCancelSessionId,
          content: [
            {
              type: 'text',
              text: '请在取消前通过 MCP 查询即将取消的结果。',
            },
          ],
        }),
      );
      const mcpCancelPromptFirstFrame = await stdout.nextJson(10_000);

      await writeJsonRpc(child, {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {
          sessionId: mcpCancelSessionId,
        },
      });
      const mcpCancelPromptConversation = await collectUntilResponse(
        child,
        stdout,
        19,
        {
          timeoutMs: 10_000,
        },
      );

      await writeJsonRpc(
        child,
        createJsonRpcRequest(8, 'session/new', {
          agentId: 'agent-stdio-e2e',
          cwd: SANDBOX_SESSION_CWD,
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
        createJsonRpcRequest(94, 'session/load', {
          sessionId: terminalLoadSessionId,
        }),
      );
      const loadTerminalFailClosedResponse = await loadProcess.stdout.nextJson(10_000);

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(65, 'fs/read_text_file', {
          sessionId,
          path: './notes/loaded.txt',
          mode: 'client_proxy',
        }),
      );
      const loadFsReadConversation = await collectUntilResponse(
        loadProcess.child,
        loadProcess.stdout,
        65,
        {
          timeoutMs: 10_000,
          onServerRequest: async (request) => {
            if (request.method !== 'fs/read_text_file') {
              return;
            }

            await writeJsonRpc(
              loadProcess.child,
              createJsonRpcResponse(request.id, {
                text: '恢复后的客户端文件内容',
              }),
            );
          },
        },
      );

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(73, 'fs/read_text_file', {
          sessionId,
          path: './notes/sandbox.txt',
          mode: 'server_sandbox',
        }),
      );
      const loadSandboxReadResponse = await loadProcess.stdout.nextJson(10_000);

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

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(104, 'session/load', {
          sessionId: mcpSessionId,
        }),
      );
      const mcpLoadConversation = await collectUntilResponse(
        loadProcess.child,
        loadProcess.stdout,
        104,
        {
          timeoutMs: 10_000,
        },
      );

      await writeJsonRpc(
        loadProcess.child,
        createJsonRpcRequest(105, 'session/prompt', {
          sessionId: mcpSessionId,
          content: [
            {
              type: 'text',
              text: '请在恢复后再次通过 MCP 查询 AgentLoom。',
            },
          ],
        }),
      );
      const mcpLoadPromptConversation = await collectUntilResponse(
        loadProcess.child,
        loadProcess.stdout,
        105,
        {
          timeoutMs: 10_000,
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
        terminalCreateResponse,
        terminalBoundedOutputResponse,
        terminalTailOutputResponse,
        terminalWaitForExitResponse,
        terminalRejectResponse,
        terminalExitedOutputResponse,
        terminalTimeoutCreateResponse,
        terminalTimeoutWaitForExitResponse,
        terminalKillCreateResponse,
        terminalKillResponse,
        terminalKilledOutputResponse,
        terminalReleaseCreateResponse,
        terminalReleaseResponse,
        terminalReleaseOutputResponse,
        terminalCancelSessionNewResponse,
        terminalCancelCreateResponse,
        terminalCancelOutputResponse,
        terminalKilledAuditRows,
        terminalLoadSessionNewResponse,
        terminalLoadCreateResponse,
        sandboxReadResponse,
        fsReadServerRequests: fsReadConversation.serverRequests,
        fsReadNotifications: fsReadConversation.notifications,
        fsReadResponse: fsReadConversation.response,
        fsWriteServerRequests: fsWriteConversation.serverRequests,
        fsWriteNotifications: fsWriteConversation.notifications,
        fsWriteResponse: fsWriteConversation.response,
        fsWriteDeniedServerRequests: fsWriteDeniedConversation.serverRequests,
        fsWriteDeniedNotifications: fsWriteDeniedConversation.notifications,
        fsWriteDeniedResponse: fsWriteDeniedConversation.response,
        fsWriteCancelledServerRequests: fsWriteCancelledConversation.serverRequests,
        fsWriteCancelledNotifications: fsWriteCancelledConversation.notifications,
        fsWriteCancelledResponse: fsWriteCancelledConversation.response,
        sandboxWriteServerRequests: sandboxWriteConversation.serverRequests,
        sandboxWriteNotifications: sandboxWriteConversation.notifications,
        sandboxWriteResponse: sandboxWriteConversation.response,
        sandboxTraversalResponse,
        sandboxOversizeResponse,
        sandboxBinaryResponse,
        fsCancelSessionNewResponse,
        fsCancelServerRequest,
        fsCancelNotifications: fsCancelConversation.notifications,
        fsCancelResponse: fsCancelConversation.response,
        promptServerRequests: promptConversation.serverRequests,
        promptNotifications: promptConversation.notifications,
        promptResponse: promptConversation.response,
        mcpSessionNewResponse,
        mcpPromptServerRequests: mcpPromptConversation.serverRequests,
        mcpPromptNotifications: mcpPromptConversation.notifications,
        mcpPromptResponse: mcpPromptConversation.response,
        mcpCancelSessionNewResponse,
        mcpCancelPromptNotifications: [
          mcpCancelPromptFirstFrame,
          ...mcpCancelPromptConversation.notifications,
        ],
        mcpCancelPromptResponse: mcpCancelPromptConversation.response,
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
        loadTerminalFailClosedResponse,
        loadFsReadServerRequests: loadFsReadConversation.serverRequests,
        loadFsReadNotifications: loadFsReadConversation.notifications,
        loadFsReadResponse: loadFsReadConversation.response,
        loadSandboxReadResponse,
        loadPromptServerRequests: loadPromptConversation.serverRequests,
        loadPromptNotifications: loadPromptConversation.notifications,
        loadPromptResponse: loadPromptConversation.response,
        mcpLoadNotifications: mcpLoadConversation.notifications,
        mcpLoadResponse: mcpLoadConversation.response,
        mcpLoadPromptServerRequests: mcpLoadPromptConversation.serverRequests,
        mcpLoadPromptNotifications: mcpLoadPromptConversation.notifications,
        mcpLoadPromptResponse: mcpLoadPromptConversation.response,
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
    if (sandboxWorkspaceRoot) {
      await rm(sandboxWorkspaceRoot, { recursive: true, force: true });
    }
    await sql.end();
  }
}

await runScenario();
