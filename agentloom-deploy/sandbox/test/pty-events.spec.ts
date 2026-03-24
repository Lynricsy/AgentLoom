import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SandboxAgentEvent } from '../src/types.js';

vi.mock('node-pty', () => ({}));
vi.mock('@mariozechner/pi-coding-agent', () => ({}));

vi.mock('../src/acp-adapter.js', async () => {
  const actual = await vi.importActual<typeof import('../src/acp-adapter.js')>('../src/acp-adapter.js');
  return {
    ...actual,
    loadSandboxConfig: vi.fn().mockResolvedValue({
      model: 'test-model',
      systemPrompt: 'test prompt',
    }),
  };
});

import { translateEvent } from '../src/event-stream.js';
import { createSandboxServer } from '../src/server.js';
import type { PTYManager } from '../src/pty/pty-manager.js';

function createMockPtyManager(overrides: Partial<PTYManager> = {}): PTYManager {
  return {
    spawn: vi.fn(),
    write: vi.fn(),
    read: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    kill: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
    cleanup: vi.fn(),
    getBufferDump: vi.fn().mockReturnValue(''),
    ...overrides,
  } as unknown as PTYManager;
}

describe('translateEvent — PTY events', () => {
  it('should translate pty_spawned to SseEventParams', () => {
    const info = {
      id: 'pty_abc123',
      pid: 42,
      command: '/bin/bash',
      args: [],
      cwd: '/workspace',
      status: 'running' as const,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      title: 'Test PTY',
      notifyOnExit: false,
      cols: 120,
      rows: 40,
      lineCount: 0,
    };
    const event: SandboxAgentEvent = {
      type: 'pty_spawned',
      sessionId: 'pty_abc123',
      info,
    };
    const result = translateEvent(event);
    expect(result).toEqual({
      type: 'pty_spawned',
      sessionId: 'pty_abc123',
      info,
    });
  });

  it('should translate pty_output to SseEventParams', () => {
    const event: SandboxAgentEvent = {
      type: 'pty_output',
      sessionId: 'pty_abc123',
      data: 'hello world\r\n',
    };
    const result = translateEvent(event);
    expect(result).toEqual({
      type: 'pty_output',
      sessionId: 'pty_abc123',
      data: 'hello world\r\n',
    });
  });

  it('should translate pty_exit to SseEventParams', () => {
    const event: SandboxAgentEvent = {
      type: 'pty_exit',
      sessionId: 'pty_abc123',
      exitCode: 0,
      exitSignal: undefined,
    };
    const result = translateEvent(event);
    expect(result).toEqual({
      type: 'pty_exit',
      sessionId: 'pty_abc123',
      exitCode: 0,
      exitSignal: undefined,
    });
  });

  it('should translate pty_killed to SseEventParams', () => {
    const event: SandboxAgentEvent = {
      type: 'pty_killed',
      sessionId: 'pty_abc123',
    };
    const result = translateEvent(event);
    expect(result).toEqual({
      type: 'pty_killed',
      sessionId: 'pty_abc123',
    });
  });
});

describe('PTY REST endpoints', () => {
  let app: FastifyInstance;
  let mockPtyManager: PTYManager;

  beforeEach(async () => {
    mockPtyManager = createMockPtyManager();
    app = await createSandboxServer({
      host: '127.0.0.1',
      port: 0,
      sessionFactory: vi.fn().mockResolvedValue({
        prompt: vi.fn(),
        abort: vi.fn(),
        subscribe: vi.fn(() => () => {}),
        dispose: vi.fn(),
      }),
      ptyManager: mockPtyManager,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /v1/pty/buffer-dump', () => {
    it('should return buffer lines for existing session', async () => {
      const mockSession = { id: 'pty_test1', status: 'running' };
      vi.mocked(mockPtyManager.getSession).mockReturnValue(mockSession as any);
      vi.mocked(mockPtyManager.getBufferDump).mockReturnValue('line1\nline2\nline3');

      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/buffer-dump',
        payload: { sessionId: 'pty_test1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.lines).toEqual(['line1', 'line2', 'line3']);
      expect(body.totalLines).toBe(3);
      expect(mockPtyManager.getBufferDump).toHaveBeenCalledWith('pty_test1');
    });

    it('should return 404 for non-existent session', async () => {
      vi.mocked(mockPtyManager.getSession).mockReturnValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/buffer-dump',
        payload: { sessionId: 'pty_nonexistent' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toContain('not found');
    });

    it('should return 400 when sessionId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/buffer-dump',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('sessionId is required');
    });
  });

  describe('GET /v1/pty/sessions', () => {
    it('should return session list from ptyManager', async () => {
      const sessions = [
        { id: 'pty_a', pid: 10, command: 'bash', status: 'running' },
        { id: 'pty_b', pid: 20, command: 'node', status: 'exited' },
      ];
      vi.mocked(mockPtyManager.list).mockReturnValue(sessions as any);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/pty/sessions',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(sessions);
    });
  });

  describe('POST /v1/pty/write', () => {
    it('should write data to PTY session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/write',
        payload: { sessionId: 'pty_test1', data: 'ls -la\n' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(mockPtyManager.write).toHaveBeenCalledWith('pty_test1', 'ls -la\n');
    });

    it('should return 404 when PTY session not found', async () => {
      vi.mocked(mockPtyManager.write).mockImplementation(() => {
        throw new Error('PTY session not found: pty_missing');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/write',
        payload: { sessionId: 'pty_missing', data: 'test' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toContain('PTY session not found');
    });

    it('should return 400 when sessionId or data is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/pty/write',
        payload: { sessionId: 'pty_test1' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('sessionId and data are required');
    });
  });
});
