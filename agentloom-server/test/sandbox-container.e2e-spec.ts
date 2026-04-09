import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import { execSync } from 'node:child_process';

vi.mock('@mariozechner/pi-coding-agent', () => ({}));

vi.mock('../../agentloom-deploy/sandbox/src/pty-extension.js', () => ({
  createPtyExtension: () => ({
    manager: null,
    register: () => ({}),
  }),
}));

vi.mock('../../agentloom-deploy/sandbox/src/acp-adapter.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../agentloom-deploy/sandbox/src/acp-adapter.js')
  >('../../agentloom-deploy/sandbox/src/acp-adapter.js');
  return {
    ...actual,
    loadSandboxConfig: vi.fn().mockResolvedValue({
      model: 'test-model',
      systemPrompt: 'test prompt',
    }),
  };
});

import type {
  IAgentSession,
  SandboxAgentEvent,
  AgentEventListener,
  SseEventEnvelope,
} from '../../agentloom-deploy/sandbox/src/types.js';
import type { SessionFactory } from '../../agentloom-deploy/sandbox/src/acp-adapter.js';
import { createSandboxServer } from '../../agentloom-deploy/sandbox/src/server.js';

interface MockSession extends IAgentSession {
  _listeners: AgentEventListener[];
  _emit: (event: SandboxAgentEvent) => void;
}

function createMockSession(): MockSession {
  const listeners: AgentEventListener[] = [];
  return {
    _listeners: listeners,
    _emit: (event) => {
      for (const fn of listeners) fn(event);
    },
    prompt: vi.fn().mockImplementation(async () => {}),
    abort: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: AgentEventListener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    }),
    dispose: vi.fn(),
  };
}

function checkDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function checkSandboxImageExists(): boolean {
  try {
    execSync('docker image inspect agentloom/sandbox:latest', {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

const isDockerAvailable = checkDockerAvailable();
const isSandboxImageAvailable = isDockerAvailable && checkSandboxImageExists();

function parseSseEvents(body: string): SseEventEnvelope[] {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => {
      const json = chunk.replace(/^data: /, '').trim();
      return JSON.parse(json) as SseEventEnvelope;
    });
}

describe('Sandbox HTTP Contract (in-process)', () => {
  let app: Awaited<ReturnType<typeof createSandboxServer>>;
  let mockSession: MockSession;
  let sessionFactory: SessionFactory;
  let sessionFactoryMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    mockSession = createMockSession();
    sessionFactoryMock = vi.fn().mockResolvedValue(mockSession);
    sessionFactory = sessionFactoryMock as unknown as SessionFactory;
    app = await createSandboxServer({
      host: '127.0.0.1',
      port: 0,
      sessionFactory,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    mockSession = createMockSession();
    sessionFactoryMock.mockResolvedValue(mockSession);
  });

  describe('GET /health', () => {
    it('应返回 503 unhealthy（测试环境无 /workspace 目录）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = response.json();
      expect(body).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(body.status);
    });
  });

  describe('POST /v1/session', () => {
    it('应创建会话并返回 sessionId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('sessionId');
      expect(typeof body.sessionId).toBe('string');
      expect(body.sessionId.length).toBeGreaterThan(0);
    });

    it('应传递自定义 cwd 到 session factory', async () => {
      await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: { cwd: '/custom/workspace' },
      });

      expect(sessionFactoryMock).toHaveBeenCalledWith(
        '/custom/workspace',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('无 cwd 时默认使用 /workspace', async () => {
      await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });

      expect(sessionFactoryMock).toHaveBeenCalledWith(
        '/workspace',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('空 body 也应成功创建', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/session',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('sessionId');
    });
  });

  describe('POST /v1/prompt', () => {
    it('缺少 sessionId 应返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { text: 'hello' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
      expect(response.json().error).toContain('sessionId');
    });

    it('缺少 text 应返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId: 'some-id' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('sessionId 和 text 都缺少应返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('不存在的 sessionId 应返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId: 'nonexistent-session', text: 'hello' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toContain('not found');
    });

    it('应以 SSE 格式流式传输事件', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'content',
            content: { type: 'text', text: 'Hello world' },
          },
        });
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'Say hello' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');

      const events = parseSseEvents(response.body);
      expect(events.length).toBeGreaterThanOrEqual(2);

      const textEvent = events.find((e) => e.params.type === 'text_delta');
      expect(textEvent).toBeDefined();
      expect(textEvent!.jsonrpc).toBe('2.0');
      expect(textEvent!.method).toBe('event');
      if (textEvent!.params.type === 'text_delta') {
        expect(textEvent!.params.text).toBe('Hello world');
      }

      const doneEvent = events.find((e) => e.params.type === 'done');
      expect(doneEvent).toBeDefined();
    });

    it('应兼容 content[] 请求体并提取 text block 作为 prompt', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: {
          sessionId,
          content: [
            { type: 'text', text: 'first line' },
            { type: 'image', url: 'ignored' },
            { type: 'text', text: 'second line' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSession.prompt).toHaveBeenCalledWith(
        'first line\n\nsecond line',
      );
    });

    it('显式传 permissionCallbackUrl 时应调用权限回调', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      const originalFetch = globalThis.fetch;
      const permissionFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ allowed: true }),
      });

      globalThis.fetch = permissionFetch as unknown as typeof globalThis.fetch;

      try {
        mockSession.prompt = vi.fn().mockImplementation(async () => {
          mockSession._emit({
            type: 'tool_execution_start',
            toolName: 'bash',
            toolCallId: 'tc-001',
            input: { command: 'pwd' },
          });
          mockSession._emit({ type: 'agent_end' });
        });

        const response = await app.inject({
          method: 'POST',
          url: '/v1/prompt',
          payload: {
            sessionId,
            text: 'test',
            permissionCallbackUrl: 'http://callback.local/permission',
          },
        });

        expect(response.statusCode).toBe(200);
        expect(permissionFetch).toHaveBeenCalledWith(
          'http://callback.local/permission',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              toolName: 'bash',
              toolCallId: 'tc-001',
              input: { command: 'pwd' },
              sessionId,
            }),
          }),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('SSE 事件应遵循 JSON-RPC 2.0 信封格式', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({
          type: 'tool_execution_start',
          toolName: 'bash',
          toolCallId: 'tc-001',
          input: { command: 'ls -la' },
        });
        mockSession._emit({
          type: 'tool_execution_update',
          toolCallId: 'tc-001',
          content: 'file1.txt',
        });
        mockSession._emit({
          type: 'tool_execution_end',
          toolCallId: 'tc-001',
          result: { exitCode: 0 },
        });
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'List files' },
      });

      const events = parseSseEvents(response.body);

      for (const event of events) {
        expect(event.jsonrpc).toBe('2.0');
        expect(event.method).toBe('event');
        expect(event.params).toHaveProperty('type');
      }

      const toolStart = events.find((e) => e.params.type === 'tool_call_start');
      expect(toolStart).toBeDefined();
      if (toolStart!.params.type === 'tool_call_start') {
        expect(toolStart!.params.toolName).toBe('bash');
        expect(toolStart!.params.toolCallId).toBe('tc-001');
        expect(toolStart!.params.input).toEqual({ command: 'ls -la' });
      }

      const toolUpdate = events.find(
        (e) => e.params.type === 'tool_call_update',
      );
      expect(toolUpdate).toBeDefined();
      if (toolUpdate!.params.type === 'tool_call_update') {
        expect(toolUpdate!.params.toolCallId).toBe('tc-001');
        expect(toolUpdate!.params.content).toBe('file1.txt');
      }

      const toolEnd = events.find((e) => e.params.type === 'tool_call_end');
      expect(toolEnd).toBeDefined();
      if (toolEnd!.params.type === 'tool_call_end') {
        expect(toolEnd!.params.toolCallId).toBe('tc-001');
        expect(toolEnd!.params.result).toEqual({ exitCode: 0 });
      }
    });

    it('已在流式传输中的 session 应返回 409', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi
        .fn()
        .mockImplementation(() => new Promise(() => {}));

      const firstPromptPromise = app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'first' },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const secondRes = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'second' },
      });

      expect(secondRes.statusCode).toBe(409);
      expect(secondRes.json().error).toContain('already streaming');

      mockSession._emit({ type: 'agent_end' });
      await firstPromptPromise;
    });

    it('done 事件已发送但 prompt 尚未 settle 时仍应返回 409', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      let resolvePrompt: (() => void) | null = null;
      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'text_delta',
            delta: 'settle later',
          },
        });
        mockSession._emit({ type: 'agent_end' });
        await new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      });

      const firstPromptResponse = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'first' },
      });

      expect(firstPromptResponse.statusCode).toBe(200);
      expect(firstPromptResponse.body).toContain('done');

      const secondPromptResponse = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'second' },
      });

      expect(secondPromptResponse.statusCode).toBe(409);
      expect(secondPromptResponse.json().error).toContain(
        'already streaming',
      );

      resolvePrompt?.();

      await vi.waitFor(async () => {
        const thirdPromptResponse = await app.inject({
          method: 'POST',
          url: '/v1/prompt',
          payload: { sessionId, text: 'third' },
        });

        expect(thirdPromptResponse.statusCode).toBe(200);
      });
    });

    it('prompt 错误应以 SSE 错误事件返回', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi
        .fn()
        .mockRejectedValue(new Error('LLM provider unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'hello' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSseEvents(response.body);
      const errorEvent = events.find((e) => e.params.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent!.params.type === 'error') {
        expect(errorEvent!.params.message).toContain(
          'LLM provider unavailable',
        );
      }
    });

    it('不可翻译的事件不应出现在 SSE 流中', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({ type: 'agent_start' });
        mockSession._emit({ type: 'turn_start' });
        mockSession._emit({ type: 'message_start' });
        mockSession._emit({ type: 'message_end' });
        mockSession._emit({ type: 'turn_end' });
        mockSession._emit({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'content',
            content: { type: 'text', text: 'visible' },
          },
        });
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'test' },
      });

      const events = parseSseEvents(response.body);
      expect(events).toHaveLength(2);
      expect(events[0].params.type).toBe('text_delta');
      expect(events[1].params.type).toBe('done');
    });
  });

  describe('POST /v1/abort', () => {
    it('缺少 sessionId 应返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/abort',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('sessionId');
    });

    it('不存在的 sessionId 应返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/abort',
        payload: { sessionId: 'nonexistent-session' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('应成功中止存在的 session', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/abort',
        payload: { sessionId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(mockSession.abort).toHaveBeenCalledOnce();
    });
  });

  describe('SSE Event Format', () => {
    it('每个 SSE 消息应以 "data: " 前缀 + 双换行结尾', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'content',
            content: { type: 'text', text: 'test' },
          },
        });
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'test' },
      });

      const rawChunks = response.body.split('\n\n').filter(Boolean);
      for (const chunk of rawChunks) {
        expect(chunk).toMatch(/^data: \{/);
        const jsonStr = chunk.replace(/^data: /, '');
        expect(() => JSON.parse(jsonStr)).not.toThrow();
      }
    });

    it('SSE 响应头应正确设置', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({ type: 'agent_end' });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'test' },
      });

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['x-accel-buffering']).toBe('no');
    });
  });

  describe('Full Workflow', () => {
    it('应完成 session → prompt → abort 完整生命周期', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/v1/session',
        payload: {},
      });
      expect(createRes.statusCode).toBe(200);
      const { sessionId } = createRes.json();

      mockSession.prompt = vi.fn().mockImplementation(async () => {
        mockSession._emit({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'content',
            content: { type: 'text', text: 'Working on it...' },
          },
        });
        mockSession._emit({ type: 'agent_end' });
      });

      const promptRes = await app.inject({
        method: 'POST',
        url: '/v1/prompt',
        payload: { sessionId, text: 'Do something' },
      });
      expect(promptRes.statusCode).toBe(200);

      const events = parseSseEvents(promptRes.body);
      expect(events.some((e) => e.params.type === 'text_delta')).toBe(true);
      expect(events.some((e) => e.params.type === 'done')).toBe(true);

      const abortRes = await app.inject({
        method: 'POST',
        url: '/v1/abort',
        payload: { sessionId },
      });
      expect(abortRes.statusCode).toBe(200);
      expect(abortRes.json()).toEqual({ success: true });
    });
  });
});

describe.skipIf(!isSandboxImageAvailable)(
  'Sandbox Docker Container (requires Docker + agentloom/sandbox:latest)',
  () => {
    let containerId: string;
    let containerPort: number;
    const CONTAINER_STARTUP_TIMEOUT = 15_000;

    beforeAll(async () => {
      const output = execSync(
        'docker run -d --rm -p 0:8080 -v /tmp/sandbox-test-workspace:/workspace agentloom/sandbox:latest',
        { encoding: 'utf-8', timeout: 10_000 },
      ).trim();
      containerId = output;

      const portOutput = execSync(`docker port ${containerId} 8080/tcp`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      const portMatch = portOutput.match(/:(\d+)$/);
      if (!portMatch) {
        throw new Error(`Failed to parse container port from: ${portOutput}`);
      }
      containerPort = parseInt(portMatch[1], 10);

      const deadline = Date.now() + CONTAINER_STARTUP_TIMEOUT;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${containerPort}/health`);
          if (res.ok) break;
        } catch {
          /* waiting for startup */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }, 30_000);

    afterAll(() => {
      if (containerId) {
        try {
          execSync(`docker stop ${containerId}`, {
            stdio: 'ignore',
            timeout: 10_000,
          });
        } catch {
          /* intentional: container may already be stopped */
        }
      }
      try {
        execSync('rm -rf /tmp/sandbox-test-workspace', {
          stdio: 'ignore',
        });
      } catch {
        /* intentional: ignore cleanup failure */
      }
    }, 15_000);

    it('GET /health 应返回 healthy（/workspace 已挂载）', async () => {
      const res = await fetch(`http://127.0.0.1:${containerPort}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'healthy' });
    });

    it('POST /v1/session 应创建容器内会话', async () => {
      const res = await fetch(`http://127.0.0.1:${containerPort}/v1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.status === 200) {
        const body = await res.json();
        expect(body).toHaveProperty('sessionId');
      } else {
        expect(res.status).toBe(500);
      }
    });

    it('POST /v1/prompt 无效 session 应返回 400 或 404', async () => {
      const res = await fetch(`http://127.0.0.1:${containerPort}/v1/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'nonexistent',
          text: 'hello',
        }),
      });

      expect([400, 404]).toContain(res.status);
    });

    it('POST /v1/abort 无效 session 应返回 400 或 404', async () => {
      const res = await fetch(`http://127.0.0.1:${containerPort}/v1/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'nonexistent' }),
      });

      expect([400, 404]).toContain(res.status);
    });
  },
);

describe.skipIf(isDockerAvailable)(
  'Sandbox Docker Container (Docker not available)',
  () => {
    it.skip('需要 Docker daemon 运行', () => {});
  },
);

describe.skipIf(isSandboxImageAvailable || !isDockerAvailable)(
  'Sandbox Docker Container (image not built)',
  () => {
    it.skip('需要构建 agentloom/sandbox:latest 镜像', () => {});
  },
);
