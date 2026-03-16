import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { startDevServer, type StartedDevServer } from './dev';

const tempDirs: string[] = [];
const runningServers: StartedDevServer[] = [];

function createTempRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agentloom-plugin-cli-dev-'));
  tempDirs.push(directory);
  return directory;
}

function createDevFixture(root: string): void {
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });

  writeFileSync(
    join(root, 'manifest.json'),
    `${JSON.stringify(
      {
        id: 'com.agentloom.dev-fixture',
        name: 'Dev Fixture',
        version: '1.0.0',
        author: 'AgentLoom Team',
        description: 'Fixture used in dev command tests',
        license: 'MIT',
        permissions: [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dev-fixture',
        version: '1.0.0',
        type: 'module',
        main: './dist/index.js',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(join(root, 'src', 'index.ts'), '// watched source placeholder\n', 'utf8');
  writeFileSync(
    join(root, 'dist', 'index.js'),
    `const plugin = {
  nodes: [
    {
      type: 'text-to-uppercase',
      label: 'Text to Uppercase',
      inputPorts: [{ id: 'text-in', label: 'Text Input', dataType: 'text', required: true }],
      outputPorts: [{ id: 'text-out', label: 'Text Output', dataType: 'text' }],
      async execute(context) {
        const input = String(context.inputs?.['text-in'] ?? '');
        const prefix = String(context.config?.prefix ?? '');
        return { outputs: { 'text-out': prefix + input.toUpperCase() } };
      },
    },
  ],
};

export default plugin;
`,
    'utf8',
  );
}

async function startFixtureServer(): Promise<{ root: string; server: StartedDevServer }> {
  const root = createTempRoot();
  createDevFixture(root);

  const server = await startDevServer({
    cwd: root,
    port: 0,
    handleSignals: false,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  });

  runningServers.push(server);
  return { root, server };
}

afterEach(async () => {
  vi.restoreAllMocks();

  while (runningServers.length > 0) {
    const server = runningServers.pop();
    if (server) {
      await server.stop();
    }
  }

  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('startDevServer', () => {
  it('loads the manifest from the working directory', async () => {
    const { server } = await startFixtureServer();

    expect(server.manifest.id).toBe('com.agentloom.dev-fixture');
    expect(server.manifest.version).toBe('1.0.0');
  });

  it('responds to GET /manifest with the manifest json', async () => {
    const { server } = await startFixtureServer();

    const response = await fetch(`http://127.0.0.1:${server.port}/manifest`);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.id).toBe('com.agentloom.dev-fixture');
    expect(payload.name).toBe('Dev Fixture');
  });

  it('responds to GET /nodes with the serialized node definitions', async () => {
    const { server } = await startFixtureServer();

    const response = await fetch(`http://127.0.0.1:${server.port}/nodes`);
    const payload = (await response.json()) as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(1);
    expect(payload[0]?.type).toBe('text-to-uppercase');
    expect(payload[0]).not.toHaveProperty('execute');
  });

  it('returns 404 for an unknown node type', async () => {
    const { server } = await startFixtureServer();

    const response = await fetch(`http://127.0.0.1:${server.port}/nodes/missing/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toContain('未找到节点类型');
  });

  it('executes the requested node with the request body as context', async () => {
    const { server } = await startFixtureServer();

    const response = await fetch(
      `http://127.0.0.1:${server.port}/nodes/text-to-uppercase/execute`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          inputs: { 'text-in': 'hello' },
          config: { prefix: '>' },
        }),
      },
    );
    const payload = (await response.json()) as { outputs: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(payload.outputs['text-out']).toBe('>HELLO');
  });
});
