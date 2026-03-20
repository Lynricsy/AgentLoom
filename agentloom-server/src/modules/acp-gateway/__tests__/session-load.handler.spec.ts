import { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionLoadHandler } from '../handlers/session-load.handler';
import type { AcpConnectionState } from '../acp-types';
import { ConversationSessionDataIntegrityError } from '../../execution/services/session-persistence.service';

describe('SessionLoadHandler', () => {
  function createMcpSessionService() {
    return {
      restoreSessionTools: vi.fn().mockResolvedValue(undefined),
    };
  }

  function createState(): AcpConnectionState {
    return {
      initialized: true,
      authContext: {
        userId: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        tenantRole: 'owner',
        orgId: 'org-1',
        authMethod: 'jwt',
      },
      sessions: new Map(),
      emitNotification: vi.fn().mockResolvedValue(undefined),
    };
  }

  function createTerminalProxyService() {
    return {
      restoreTerminalContinuity: vi.fn().mockResolvedValue([]),
    };
  }

  it('应在 replay 完成后才返回 session/load success，并重建连接级 registry', async () => {
    let resolveReplay!: () => void;
    const state = createState();
    state.emitNotification = vi.fn().mockImplementation(
      async () =>
        await new Promise<void>((resolve) => {
          resolveReplay = resolve;
        }),
    );
    const runtime = {
      loadSession: vi.fn().mockResolvedValue({
        id: 'session-001',
        agentId: 'agent-001',
        mode: 'conversation',
        context: {
            history: [{ type: 'text', text: '你好' }],
            cwd: '/workspace/demo',
            mcpServers: {
              docs: {
                command: 'node',
                args: ['mcp-server.js'],
              },
            },
            serverSandbox: {
              executionId: '019391d4-e000-7000-0000-000000000005',
            },
        },
        status: 'active',
        tenantId: 'tenant-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    };
    const sessionPersistence = {
      loadConversationReplay: vi.fn().mockResolvedValue([
        {
          kind: 'user_message',
          content: [{ type: 'text', text: '你好' }],
        },
      ]),
    };
    const terminalProxyService = createTerminalProxyService();
    const mcpSessionService = createMcpSessionService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue(runtime),
      } as unknown as ModuleRef,
      sessionPersistence as never,
      terminalProxyService as never,
      mcpSessionService as never,
    );

    const pendingResult = handler.handle(
      {
        sessionId: 'session-001',
      },
      state,
    );

    await Promise.resolve();
    const sentinel = Symbol('pending');
    await expect(
      Promise.race([pendingResult, Promise.resolve(sentinel)]),
    ).resolves.toBe(sentinel);

    resolveReplay();
    await expect(pendingResult).resolves.toEqual({
      sessionId: 'session-001',
    });
    expect(state.emitNotification).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session-001',
        update: {
          type: 'user_message',
          content: [{ type: 'text', text: '你好' }],
          replayed: true,
        },
      },
    });
    expect(state.sessions?.get('session-001')).toEqual({
      sessionId: 'session-001',
      runtimeSessionId: 'session-001',
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    expect(mcpSessionService.restoreSessionTools).toHaveBeenCalledWith(
      {
        sessionId: 'session-001',
        runtimeSessionId: 'session-001',
        agentId: 'agent-001',
        tenantId: 'tenant-1',
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
      },
      {
        docs: {
          command: 'node',
          args: ['mcp-server.js'],
        },
      },
    );
    expect(terminalProxyService.restoreTerminalContinuity).not.toHaveBeenCalled();
  });

  it('应在 session 不存在时返回 Invalid params / Session not found', async () => {
    const terminalProxyService = createTerminalProxyService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockRejectedValue(new Error('Session not found')),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn(),
      } as never,
      terminalProxyService as never,
      createMcpSessionService() as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'missing-session',
        },
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: {
        sessionId: 'missing-session',
        reason: 'Session not found',
      },
    });
  });

  it('应在租户不匹配时拒绝恢复并不注册 session', async () => {
    const state = createState();
    const terminalProxyService = createTerminalProxyService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockResolvedValue({
            id: 'session-tenant-a',
            agentId: 'agent-001',
            mode: 'conversation',
            context: { history: [] },
            status: 'active',
            tenantId: 'tenant-a',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn().mockResolvedValue([]),
      } as never,
      terminalProxyService as never,
      createMcpSessionService() as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-tenant-a',
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: {
        sessionId: 'session-tenant-a',
        reason: 'Session not found',
      },
    });
    expect(state.sessions?.size).toBe(0);
  });

  it('应将 replay 失败映射为 Internal error', async () => {
    const state = createState();
    state.emitNotification = vi.fn().mockRejectedValue(new Error('emit failed'));
    const terminalProxyService = createTerminalProxyService();
    const mcpSessionService = createMcpSessionService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockResolvedValue({
            id: 'session-001',
            agentId: 'agent-001',
            mode: 'conversation',
            context: { history: [] },
            status: 'active',
            tenantId: 'tenant-1',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn().mockResolvedValue([
          {
            kind: 'user_message',
            content: [{ type: 'text', text: '你好' }],
          },
        ]),
      } as never,
      terminalProxyService as never,
      mcpSessionService as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to replay session history',
    });
    expect(state.sessions?.size).toBe(0);
    expect(mcpSessionService.restoreSessionTools).not.toHaveBeenCalled();
  });

  it('应将损坏的 session snapshot 映射为稳定的 replay failure', async () => {
    const terminalProxyService = createTerminalProxyService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi
            .fn()
            .mockRejectedValue(
              new ConversationSessionDataIntegrityError(
                'session-broken',
                'session snapshot at mode',
              ),
            ),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn(),
      } as never,
      terminalProxyService as never,
      createMcpSessionService() as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-broken',
        },
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to replay session history',
      data: {
        sessionId: 'session-broken',
        reason: expect.stringContaining('session snapshot'),
      },
    });
  });

  it('应将损坏的 replay ledger 映射为稳定的 replay failure', async () => {
    const state = createState();
    const terminalProxyService = createTerminalProxyService();
    const mcpSessionService = createMcpSessionService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockResolvedValue({
            id: 'session-001',
            agentId: 'agent-001',
            mode: 'conversation',
            context: { history: [] },
            status: 'active',
            tenantId: 'tenant-1',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi
          .fn()
          .mockRejectedValue(
            new ConversationSessionDataIntegrityError(
              'session-001',
              'replay entries at 0.kind',
            ),
            ),
      } as never,
      terminalProxyService as never,
      mcpSessionService as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to replay session history',
      data: {
        sessionId: 'session-001',
        reason: expect.stringContaining('replay entries'),
      },
    });
    expect(state.sessions?.size).toBe(0);
    expect(mcpSessionService.restoreSessionTools).not.toHaveBeenCalled();
  });

  it('应基于持久化 mcpServers 重建 ACP MCP 可用性，并在恢复失败时 fail-closed', async () => {
    const state = createState();
    const terminalProxyService = createTerminalProxyService();
    const mcpSessionService = {
      restoreSessionTools: vi.fn().mockRejectedValue(new Error('restore failed')),
    };
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockResolvedValue({
            id: 'session-001',
            agentId: 'agent-001',
            mode: 'conversation',
            context: {
              history: [],
              mcpServers: {
                docs: {
                  command: 'node',
                  args: ['mcp-server.js'],
                },
              },
            },
            status: 'active',
            tenantId: 'tenant-1',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn().mockResolvedValue([]),
      } as never,
      terminalProxyService as never,
      mcpSessionService as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to restore ACP MCP forwarding',
      data: {
        sessionId: 'session-001',
        reason: 'restore failed',
      },
    });
    expect(state.sessions?.size).toBe(0);
  });

  it('应在 session/load 时完成 same-process terminal continuity 重绑', async () => {
    const state = createState();
    const runtime = {
      loadSession: vi.fn().mockResolvedValue({
        id: 'session-001',
        agentId: 'agent-001',
        mode: 'conversation',
        context: {
          history: [],
          cwd: '/workspace/demo',
          serverSandbox: {
            executionId: '019391d4-e000-7000-0000-000000000005',
          },
          terminalContinuity: {
            terminals: [
              {
                terminalId: 'terminal-1',
                execId: 'exec-1',
                cwd: '/workspace/demo',
                outputByteLimit: 1024,
                status: 'running',
              },
            ],
          },
        },
        status: 'active',
        tenantId: 'tenant-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    };
    const terminalProxyService = {
      restoreTerminalContinuity: vi.fn().mockResolvedValue(['terminal-1']),
    };
    const mcpSessionService = createMcpSessionService();
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue(runtime),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn().mockResolvedValue([]),
      } as never,
      terminalProxyService as never,
      mcpSessionService as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
        },
        state,
      ),
    ).resolves.toEqual({
      sessionId: 'session-001',
    });

    expect(terminalProxyService.restoreTerminalContinuity).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-001',
        tenantId: 'tenant-1',
      }),
      {
        terminals: [
          {
            terminalId: 'terminal-1',
            execId: 'exec-1',
            cwd: '/workspace/demo',
            outputByteLimit: 1024,
            status: 'running',
          },
        ],
      },
    );
    expect(state.sessions?.get('session-001')).toEqual({
      sessionId: 'session-001',
      runtimeSessionId: 'session-001',
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
      terminalIds: ['terminal-1'],
    });
    expect(mcpSessionService.restoreSessionTools).not.toHaveBeenCalled();
  });

  it('应在 cold recovery 无法重绑 terminal continuity 时 fail-closed 且不注册 session', async () => {
    const state = createState();
    const terminalProxyService = {
      restoreTerminalContinuity: vi.fn().mockRejectedValue({
        code: -32603,
        message: 'Failed to restore ACP terminal continuity',
        data: {
          sessionId: 'session-001',
          reason: 'terminal_continuity_unavailable',
        },
      }),
    };
    const handler = new SessionLoadHandler(
      {
        get: vi.fn().mockReturnValue({
          loadSession: vi.fn().mockResolvedValue({
            id: 'session-001',
            agentId: 'agent-001',
            mode: 'conversation',
            context: {
              history: [],
              terminalContinuity: {
                terminals: [
                  {
                    terminalId: 'terminal-1',
                    execId: 'exec-1',
                    cwd: '/workspace/demo',
                    outputByteLimit: 1024,
                    status: 'running',
                  },
                ],
              },
            },
            status: 'active',
            tenantId: 'tenant-1',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        }),
      } as unknown as ModuleRef,
      {
        loadConversationReplay: vi.fn().mockResolvedValue([]),
      } as never,
      terminalProxyService as never,
      createMcpSessionService() as never,
    );

    await expect(
      handler.handle(
        {
          sessionId: 'session-001',
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to restore ACP terminal continuity',
      data: {
        sessionId: 'session-001',
        reason: 'terminal_continuity_unavailable',
      },
    });
    expect(state.sessions?.size).toBe(0);
  });
});
