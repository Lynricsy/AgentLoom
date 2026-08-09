import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-pty', () => ({ spawn: vi.fn() }));
import { createSandboxServer } from '../src/server.js';

let app: FastifyInstance | undefined;
let root: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe('sandbox Unix socket listener', () => {
  it('在指定 Unix socket 监听并设置 0600 权限', async () => {
    root = mkdtempSync(join(tmpdir(), 'agentloom-sandbox-socket-'));
    const socketPath = join(root, 'run', 'agent.sock');
    app = await createSandboxServer({
      socketPath,
      sessionFactory: vi.fn(),
    });

    expect(existsSync(socketPath)).toBe(true);
    expect(statSync(socketPath).mode & 0o777).toBe(0o600);

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(response.statusCode);
  });
});
