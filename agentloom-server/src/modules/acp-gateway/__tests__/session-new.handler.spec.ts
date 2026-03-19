import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionNewHandler } from '../handlers/session-new.handler';
import type { AcpConnectionState } from '../acp-types';

describe('SessionNewHandler', () => {
  it('应创建 conversation session 并写入连接级 registry', async () => {
    const createSession = vi.fn().mockResolvedValue({
      id: randomUUID(),
      agentId: 'agent-001',
    });
    const moduleRef = {
      get: vi.fn().mockReturnValue({
        createSession,
      }),
    } as unknown as ModuleRef;
    const handler = new SessionNewHandler(moduleRef);
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
        mcpServers: {
          docs: {
            command: 'node',
            args: ['mcp-server.js'],
          },
        },
      },
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
    });
    expect(result).toEqual({
      sessionId: expect.any(String),
    });
    expect(state.sessions?.get(result.sessionId)).toEqual({
      sessionId: result.sessionId,
      runtimeSessionId: result.sessionId,
      agentId: 'agent-001',
      tenantId: 'tenant-1',
    });
  });

  it('应拒绝非绝对路径 cwd', async () => {
    const handler = new SessionNewHandler({
      get: vi.fn(),
    } as unknown as ModuleRef);

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
