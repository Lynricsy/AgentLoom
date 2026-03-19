import { describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { AcpMessageRouter } from '../acp-message-router';
import type { AcpConnectionState } from '../acp-types';

function createRouter(overrides?: {
  initializeHandler?: { handle: ReturnType<typeof vi.fn> };
  authenticateHandler?: { handle: ReturnType<typeof vi.fn> };
  sessionNewHandler?: { handle: ReturnType<typeof vi.fn> };
  sessionLoadHandler?: { handle: ReturnType<typeof vi.fn> };
  sessionPromptHandler?: { handle: ReturnType<typeof vi.fn> };
  sessionCancelHandler?: { handle: ReturnType<typeof vi.fn> };
}) {
  return new AcpMessageRouter(
    (overrides?.initializeHandler ?? { handle: vi.fn() }) as never,
    (overrides?.authenticateHandler ?? { handle: vi.fn() }) as never,
    (overrides?.sessionNewHandler ?? { handle: vi.fn() }) as never,
    (overrides?.sessionLoadHandler ?? { handle: vi.fn() }) as never,
    (overrides?.sessionPromptHandler ?? { handle: vi.fn() }) as never,
    (overrides?.sessionCancelHandler ?? { handle: vi.fn() }) as never,
  );
}

describe('AcpMessageRouter', () => {
  it('应返回 initialize 成功响应', async () => {
    const initializeHandler = {
      handle: vi.fn().mockResolvedValue({
        protocolVersion: '2026-02-18',
        serverInfo: {
          name: 'agentloom',
          version: '0.0.1',
          capabilities: {
            streaming: true,
            tools: true,
          },
        },
      }),
    };
    const authenticateHandler = {
      handle: vi.fn(),
    };

    const router = createRouter({
      initializeHandler,
      authenticateHandler,
    });
    const state: AcpConnectionState = {
      initialized: false,
    };

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2026-02-18',
        },
      }),
      state,
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2026-02-18',
        serverInfo: {
          name: 'agentloom',
          version: '0.0.1',
          capabilities: {
            streaming: true,
            tools: true,
          },
        },
      },
    });
  });

  it('应将坏 JSON 映射为 parse error 且后续合法 initialize 仍成功', async () => {
    const initializeHandler = {
      handle: vi.fn().mockImplementation(async (_params, state) => {
        state.initialized = true;
        return {
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
        };
      }),
    };
    const authenticateHandler = {
      handle: vi.fn(),
    };
    const router = createRouter({
      initializeHandler,
      authenticateHandler,
    });
    const state: AcpConnectionState = {
      initialized: false,
    };

    const errorResponse = await router.routeMessage('{"jsonrpc":', state);
    expect(errorResponse).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
      },
    });

    const successResponse = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2026-02-18',
        },
      }),
      state,
    );

    expect(successResponse).toEqual({
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
  });

  it('应将无效请求映射为 invalid request', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify(['not-an-object']),
      { initialized: false },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });
  });

  it('应将非法 id 类型映射为 invalid request', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: {
          invalid: true,
        },
        method: 'initialize',
        params: {
          protocolVersion: '2026-02-18',
          clientCapabilities: {},
        },
      }),
      { initialized: false },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });
  });

  it('应在 initialize 之前拒绝其他方法', async () => {
    const authenticateHandler = {
      handle: vi.fn(),
    };
    const router = createRouter({
      authenticateHandler,
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'authenticate',
        params: {
          token: 'jwt',
        },
      }),
      { initialized: false },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32001,
        message: 'Server not initialized',
      },
    });
    expect(authenticateHandler.handle).not.toHaveBeenCalled();
  });

  it('应显式接住 initialized notification 且不回包', async () => {
    const router = createRouter();
    const state: AcpConnectionState = {
      initialized: true,
    };

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
      }),
      state,
    );

    expect(response).toBeNull();
    expect(state).toMatchObject({
      initialized: true,
      initializedNotificationReceived: true,
    });
  });

  it('应对普通 notification 保持静默而不是回 method not found', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/new',
      }),
      { initialized: true },
    );

    expect(response).toBeNull();
  });

  it('应将未知方法映射为 method not found', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'session/unknown',
      }),
      { initialized: true },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 4,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  it('应在未认证时拒绝 session/new', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'session/new',
        params: {
          agentId: 'agent-001',
        },
      }),
      {
        initialized: true,
      },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 8,
        error: {
          code: -32002,
          message: 'Authentication required',
        },
      });
  });

  it('应在未认证时拒绝 session/load', async () => {
    const router = createRouter();

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'session/load',
        params: {
          sessionId: 'session-001',
        },
      }),
      {
        initialized: true,
      },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 10,
      error: {
        code: -32002,
        message: 'Authentication required',
      },
    });
  });

  it('应在认证后将 session/load 分发给 handler 并返回 sessionId', async () => {
    const sessionLoadHandler = {
      handle: vi.fn().mockResolvedValue({
        sessionId: 'session-001',
      }),
    };
    const router = createRouter({
      sessionLoadHandler,
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'session/load',
        params: {
          sessionId: 'session-001',
        },
      }),
      {
        initialized: true,
        authContext: {
          userId: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          tenantRole: 'owner',
          orgId: 'org-1',
          authMethod: 'jwt',
        },
      },
    );

    expect(sessionLoadHandler.handle).toHaveBeenCalledWith(
      {
        sessionId: 'session-001',
      },
      expect.objectContaining({
        initialized: true,
      }),
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 11,
      result: {
        sessionId: 'session-001',
      },
    });
  });

  it('应将 handler 抛出的参数错误映射为 invalid params', async () => {
    const router = createRouter({
      authenticateHandler: {
        handle: vi.fn().mockRejectedValue(new AcpJsonRpcError(-32602, 'Invalid params')),
      },
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'authenticate',
        params: {},
      }),
      { initialized: true },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: -32602,
        message: 'Invalid params',
      },
    });
  });

  it('应在 initialize 版本不受支持时保留 request id 并透传协商数据', async () => {
    const router = createRouter({
      initializeHandler: {
        handle: vi.fn().mockRejectedValue(
          new AcpJsonRpcError(-32602, 'Invalid params', {
            requestedProtocolVersion: '2025-01-01',
            supportedProtocolVersions: ['2026-02-18'],
          }),
        ),
      },
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'initialize',
        params: {
          protocolVersion: '2025-01-01',
          clientCapabilities: {},
        },
      }),
      { initialized: false },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: {
        code: -32602,
        message: 'Invalid params',
        data: {
          requestedProtocolVersion: '2025-01-01',
          supportedProtocolVersions: ['2026-02-18'],
        },
      },
    });
  });

  it('应将 DomainException 映射为结构化 JSON-RPC 错误并保留 request id', async () => {
    const router = createRouter({
      authenticateHandler: {
        handle: vi.fn().mockRejectedValue(
          new DomainException({
            type: 'https://agentloom.dev/errors/token-revoked',
            title: 'Unauthorized',
            status: 401,
            detail: 'Token has been revoked',
            extensions: {
              authMethod: 'jwt',
            },
          }),
        ),
      },
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'authenticate',
        params: {
          token: 'revoked-token',
        },
      }),
      { initialized: true },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 6,
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: {
          status: 401,
          type: 'https://agentloom.dev/errors/token-revoked',
          detail: 'Token has been revoked',
          extensions: {
            authMethod: 'jwt',
          },
        },
      },
    });
  });

  it('应在认证后将 session/new 分发给 handler 并返回 sessionId', async () => {
    const sessionNewHandler = {
      handle: vi.fn().mockResolvedValue({
        sessionId: 'session-001',
      }),
    };
    const router = createRouter({
      sessionNewHandler,
    });

    const response = await router.routeMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'session/new',
        params: {
          agentId: 'agent-001',
        },
      }),
      {
        initialized: true,
        authContext: {
          userId: 'user-1',
          email: 'user@example.com',
          tenantId: 'tenant-1',
          tenantRole: 'owner',
          orgId: 'org-1',
          authMethod: 'jwt',
        },
      },
    );

    expect(sessionNewHandler.handle).toHaveBeenCalledWith(
      {
        agentId: 'agent-001',
      },
      expect.objectContaining({
        initialized: true,
      }),
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 9,
      result: {
        sessionId: 'session-001',
      },
    });
  });
});
