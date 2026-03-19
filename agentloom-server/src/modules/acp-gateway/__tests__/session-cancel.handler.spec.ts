import { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionCancelHandler } from '../handlers/session-cancel.handler';
import type { AcpConnectionState } from '../acp-types';

describe('SessionCancelHandler', () => {
  it('应在 session 已注册时调用 runtime.cancel', async () => {
    const runtime = {
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const cancelClientRequest = vi.fn().mockReturnValue(true);
    const handler = new SessionCancelHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);
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
      sessions: new Map([
        [
          'session-001',
            {
              sessionId: 'session-001',
              runtimeSessionId: 'runtime-session-001',
              agentId: 'agent-001',
              tenantId: 'tenant-1',
              pendingPermissionRequestId: 'acp-server-1',
              pendingPermissionToolCallId: 'tool-1',
            },
          ],
        ]),
      cancelClientRequest,
    };

    await handler.handle(
      {
        sessionId: 'session-001',
      },
      state,
    );

    expect(runtime.cancel).toHaveBeenCalledWith('runtime-session-001');
    expect(cancelClientRequest).toHaveBeenCalledWith('acp-server-1', {
      outcome: {
        outcome: 'cancelled',
      },
    });
    expect(
      state.sessions?.get('session-001')?.pendingPermissionRequestId,
    ).toBeUndefined();
  });

  it('应在 session 不存在时静默返回', async () => {
    const runtime = {
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new SessionCancelHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);

    await handler.handle(
      {
        sessionId: 'session-missing',
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
        sessions: new Map(),
      },
    );

    expect(runtime.cancel).not.toHaveBeenCalled();
  });

  it('应在当前连接 tenant 与已跟踪 session 不一致时静默忽略 cancel', async () => {
    const runtime = {
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new SessionCancelHandler({
      get: vi.fn().mockReturnValue(runtime),
    } as unknown as ModuleRef);

    await handler.handle(
      {
        sessionId: 'session-tenant-a',
      },
      {
        initialized: true,
        authContext: {
          userId: 'user-2',
          email: 'user@example.com',
          tenantId: 'tenant-b',
          tenantRole: 'owner',
          orgId: 'org-2',
          authMethod: 'jwt',
        },
        sessions: new Map([
          [
            'session-tenant-a',
            {
              sessionId: 'session-tenant-a',
              runtimeSessionId: 'runtime-session-a',
              agentId: 'agent-001',
              tenantId: 'tenant-a',
            },
          ],
        ]),
      },
    );

    expect(runtime.cancel).not.toHaveBeenCalled();
  });
});
