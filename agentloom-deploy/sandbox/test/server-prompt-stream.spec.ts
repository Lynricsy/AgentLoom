import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEventListener, IAgentSession, SandboxAgentEvent } from '../src/types.js';

vi.mock('../src/pty-extension.js', () => ({
  createPtyExtension: vi.fn(() => ({
    manager: null,
    register: vi.fn(),
  })),
}));

vi.mock('../src/mcp-extension.js', () => ({
  createMcpExtension: vi.fn(() => ({
    register: vi.fn(),
  })),
}));

import { createSandboxServer } from '../src/server.js';

function createAsyncStreamingSession(): IAgentSession & {
  emit: (event: SandboxAgentEvent) => void;
} {
  const listeners: AgentEventListener[] = [];

  return {
    prompt: vi.fn().mockImplementation(async () => {
      setTimeout(() => {
        for (const listener of listeners) {
          listener({
            type: 'message_update',
            assistantMessageEvent: {
              type: 'text_delta',
              delta: 'Hello from async prompt',
            },
          });
          listener({ type: 'agent_end' });
        }
      }, 10);
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((listener: AgentEventListener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
    dispose: vi.fn(),
    emit: (event: SandboxAgentEvent) => {
      for (const listener of listeners) listener(event);
    },
  };
}

describe('POST /v1/prompt', () => {
  let app: Awaited<ReturnType<typeof createSandboxServer>> | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it('should keep the SSE stream open for async prompt events', async () => {
    const session = createAsyncStreamingSession();

    app = await createSandboxServer({
      host: '127.0.0.1',
      port: 0,
      sessionFactory: vi.fn().mockResolvedValue(session),
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/session',
      payload: { sessionId: 'stream-test-session' },
    });

    expect(createResponse.statusCode).toBe(200);

    const promptResponse = await app.inject({
      method: 'POST',
      url: '/v1/prompt',
      payload: {
        sessionId: 'stream-test-session',
        text: 'hello',
      },
    });

    expect(promptResponse.statusCode).toBe(200);
    expect(promptResponse.body).toContain('text_delta');
    expect(promptResponse.body).toContain('Hello from async prompt');
    expect(promptResponse.body).toContain('done');
  });
});
