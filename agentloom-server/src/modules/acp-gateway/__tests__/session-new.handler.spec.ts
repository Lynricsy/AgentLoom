import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionNewHandler } from '../handlers/session-new.handler';
import type { AcpConnectionState } from '../acp-types';

describe('SessionNewHandler', () => {
  function createMcpSessionService() {
    return {
      bootstrapSessionTools: vi.fn().mockResolvedValue(undefined),
      cleanupSessionTools: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('应创建 conversation session 并写入连接级 registry', async () => {
    const sessionId = randomUUID();
    const createSession = vi.fn().mockResolvedValue({
      id: sessionId,
      agentId: 'agent-001',
    });
    const runtime = {
      createSession,
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const mcpSessionService = createMcpSessionService();
    const moduleRef = {
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef;
    const handler = new SessionNewHandler(moduleRef, mcpSessionService as never);
    const state: AcpConnectionState = {
      initialized: true,
      authContext: {
        userId: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        tenantRole: 'owner',
        orgId: 'org-1',
        authMethod: 'jwt',
      },
    };

    const result = await handler.handle(
      {
        agentId: 'agent-001',
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
        mcpServers: {
          docs: {
            command: 'node',
            args: ['mcp-server.js'],
          },
        },
      } as never,
      state,
    );

    expect(createSession).toHaveBeenCalledWith({
      agentId: 'agent-001',
      mode: 'conversation',
      tenantId: 'tenant-1',
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
    });
    expect(mcpSessionService.bootstrapSessionTools).toHaveBeenCalledWith(
      {
        sessionId,
        runtimeSessionId: sessionId,
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
    expect(result).toEqual({
      sessionId: expect.any(String),
    });
    expect(state.sessions?.get(result.sessionId)).toEqual({
      sessionId: result.sessionId,
      runtimeSessionId: result.sessionId,
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
  });

  it('未声明 mcpServers 时不应触发 ACP MCP bootstrap', async () => {
    const mcpSessionService = createMcpSessionService();
    const handler = new SessionNewHandler(
      {
        get: vi.fn().mockReturnValue({
          createSession: vi.fn().mockResolvedValue({
            id: 'session-001',
            agentId: 'agent-001',
          }),
          cancel: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ModuleRef,
      mcpSessionService as never,
    );

    await expect(
      handler.handle(
        {
          agentId: 'agent-001',
        } as never,
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
      ),
    ).resolves.toEqual({
      sessionId: 'session-001',
    });

    expect(mcpSessionService.bootstrapSessionTools).not.toHaveBeenCalled();
  });

  it('ACP MCP bootstrap 失败时应回滚 runtime session 并且不注册连接级 session', async () => {
    const runtime = {
      createSession: vi.fn().mockResolvedValue({
        id: 'session-001',
        agentId: 'agent-001',
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const mcpSessionService = {
      bootstrapSessionTools: vi.fn().mockRejectedValue(new Error('bootstrap failed')),
      cleanupSessionTools: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new SessionNewHandler(
      {
        get: vi.fn().mockReturnValue(runtime),
      } as unknown as ModuleRef,
      mcpSessionService as never,
    );
    const state: AcpConnectionState = {
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
    };

    await expect(
      handler.handle(
        {
          agentId: 'agent-001',
          mcpServers: {
            docs: {
              command: 'node',
              args: ['mcp-server.js'],
            },
          },
        } as never,
        state,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to initialize ACP MCP forwarding',
      data: {
        sessionId: 'session-001',
        reason: 'bootstrap failed',
      },
    });
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledWith({
      sessionId: 'session-001',
      runtimeSessionId: 'session-001',
      agentId: 'agent-001',
      tenantId: 'tenant-1',
    });
    expect(runtime.cancel).toHaveBeenCalledWith('session-001');
    expect(state.sessions?.size).toBe(0);
  });

  it('应拒绝缺少 executionId 的 serverSandbox 绑定', async () => {
    const handler = new SessionNewHandler({
      get: vi.fn(),
    } as unknown as ModuleRef, createMcpSessionService() as never);

    await expect(
      handler.handle(
        {
          agentId: 'agent-001',
          cwd: '/workspace/demo',
          serverSandbox: {},
        } as never,
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
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });

  it('应拒绝非绝对路径 cwd', async () => {
    const handler = new SessionNewHandler({
      get: vi.fn(),
    } as unknown as ModuleRef, createMcpSessionService() as never);

    await expect(
      handler.handle(
        {
          agentId: 'agent-001',
          cwd: './relative',
        },
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
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });
});
