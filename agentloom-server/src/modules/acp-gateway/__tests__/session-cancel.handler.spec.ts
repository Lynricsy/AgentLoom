import { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { SessionCancelHandler } from '../handlers/session-cancel.handler';
import type { AcpConnectionState } from '../acp-types';

describe('SessionCancelHandler', () => {
  function createHandler() {
    const runtime = {
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const terminalProxyService = {
      cleanupSessionTerminals: vi.fn().mockResolvedValue(undefined),
    };
    const mcpSessionService = {
      cleanupSessionTools: vi.fn().mockResolvedValue(undefined),
    };

    return {
      runtime,
      terminalProxyService,
      mcpSessionService,
      handler: new SessionCancelHandler(
        {
          get: vi.fn().mockReturnValue(runtime),
        } as unknown as ModuleRef,
        terminalProxyService as never,
        mcpSessionService as never,
      ),
    };
  }

  it('应在 session 已注册时调用 runtime.cancel', async () => {
    const { handler, runtime, terminalProxyService, mcpSessionService } =
      createHandler();
    const cancelClientRequest = vi.fn().mockReturnValue(true);
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
            pendingFsRequestIds: ['acp-server-fs-1', 'acp-server-fs-2'],
            terminalIds: ['terminal-1', 'terminal-2'],
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
    expect(terminalProxyService.cleanupSessionTerminals).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-001',
        terminalIds: ['terminal-1', 'terminal-2'],
      }),
    );
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-001',
        runtimeSessionId: 'runtime-session-001',
      }),
    );
    expect(cancelClientRequest).toHaveBeenCalledWith('acp-server-1', {
      outcome: {
        outcome: 'cancelled',
      },
    });
    expect(cancelClientRequest).toHaveBeenCalledWith('acp-server-fs-1', {
      cancelled: true,
    });
    expect(cancelClientRequest).toHaveBeenCalledWith('acp-server-fs-2', {
      cancelled: true,
    });
    expect(state.sessions?.has('session-001')).toBe(false);
  });

  it('应只取消目标 session 的待处理请求并保持其他 session 不变', async () => {
    const { handler, runtime, terminalProxyService, mcpSessionService } =
      createHandler();
    const cancelClientRequest = vi.fn().mockReturnValue(true);
    const state = {
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
            pendingFsRequestIds: ['acp-server-fs-1'],
            terminalIds: ['terminal-1'],
          },
        ],
        [
          'session-002',
          {
            sessionId: 'session-002',
            runtimeSessionId: 'runtime-session-002',
            agentId: 'agent-002',
            tenantId: 'tenant-1',
            pendingPermissionRequestId: 'acp-server-2',
            pendingPermissionToolCallId: 'tool-2',
            pendingFsRequestIds: ['acp-server-fs-2'],
            terminalIds: ['terminal-2'],
          },
        ],
      ]),
      cancelClientRequest,
    } satisfies AcpConnectionState;

    await handler.handle(
      {
        sessionId: 'session-001',
      },
      state,
    );

    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(runtime.cancel).toHaveBeenCalledWith('runtime-session-001');
    expect(terminalProxyService.cleanupSessionTerminals).toHaveBeenCalledTimes(1);
    expect(terminalProxyService.cleanupSessionTerminals).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-001',
        terminalIds: ['terminal-1'],
      }),
    );
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledTimes(1);
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-001',
        runtimeSessionId: 'runtime-session-001',
      }),
    );
    expect(cancelClientRequest).toHaveBeenCalledTimes(2);
    expect(state.sessions?.has('session-001')).toBe(false);
    expect(state.sessions?.get('session-002')).toEqual({
      sessionId: 'session-002',
      runtimeSessionId: 'runtime-session-002',
      agentId: 'agent-002',
      tenantId: 'tenant-1',
      pendingPermissionRequestId: 'acp-server-2',
      pendingPermissionToolCallId: 'tool-2',
      pendingFsRequestIds: ['acp-server-fs-2'],
      terminalIds: ['terminal-2'],
    });
  });

  it('应在 cancel 后移除 session 句柄，阻止后续请求复用已 teardown 会话', async () => {
    const { handler } = createHandler();
    const state = {
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
          'session-003',
          {
            sessionId: 'session-003',
            runtimeSessionId: 'runtime-session-003',
            agentId: 'agent-003',
            tenantId: 'tenant-1',
            activePromptRequestId: 'request-003',
          },
        ],
      ]),
    } satisfies AcpConnectionState;

    await handler.handle(
      {
        sessionId: 'session-003',
      },
      state,
    );

    expect(state.sessions?.get('session-003')).toBeUndefined();
  });

  it('应在某个 cleanup 步骤失败时继续执行后续 teardown 并返回结构化错误', async () => {
    const { handler, runtime, terminalProxyService, mcpSessionService } =
      createHandler();
    mcpSessionService.cleanupSessionTools.mockRejectedValueOnce(
      new Error('mcp cleanup failed'),
    );
    terminalProxyService.cleanupSessionTerminals.mockRejectedValueOnce(
      new Error('terminal cleanup failed'),
    );
    runtime.cancel.mockRejectedValueOnce(new Error('runtime cancel failed'));

    const state = {
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
          'session-004',
          {
            sessionId: 'session-004',
            runtimeSessionId: 'runtime-session-004',
            agentId: 'agent-004',
            tenantId: 'tenant-1',
            terminalIds: ['terminal-4'],
          },
        ],
      ]),
    } satisfies AcpConnectionState;

    const rejection = handler.handle(
      {
        sessionId: 'session-004',
      },
      state,
    );

    await expect(rejection).rejects.toBeInstanceOf(AcpJsonRpcError);
    await expect(rejection).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to fully cancel ACP session',
      data: {
        sessionId: 'session-004',
        cleanupFailures: [
          {
            step: 'cleanup_mcp_session_tools',
            reason: 'mcp cleanup failed',
          },
          {
            step: 'cleanup_session_terminals',
            reason: 'terminal cleanup failed',
          },
          {
            step: 'cancel_runtime_session',
            reason: 'runtime cancel failed',
          },
        ],
      },
    });
    expect(mcpSessionService.cleanupSessionTools).toHaveBeenCalledTimes(1);
    expect(terminalProxyService.cleanupSessionTerminals).toHaveBeenCalledTimes(1);
    expect(runtime.cancel).toHaveBeenCalledWith('runtime-session-004');
    expect(state.sessions?.has('session-004')).toBe(false);
  });

  it('应在 session 不存在时静默返回', async () => {
    const { handler, runtime, terminalProxyService, mcpSessionService } =
      createHandler();

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
    expect(terminalProxyService.cleanupSessionTerminals).not.toHaveBeenCalled();
    expect(mcpSessionService.cleanupSessionTools).not.toHaveBeenCalled();
  });

  it('应在当前连接 tenant 与已跟踪 session 不一致时静默忽略 cancel', async () => {
    const { handler, runtime, terminalProxyService, mcpSessionService } =
      createHandler();

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
              terminalIds: ['terminal-a'],
            },
          ],
        ]),
      },
    );

    expect(runtime.cancel).not.toHaveBeenCalled();
    expect(terminalProxyService.cleanupSessionTerminals).not.toHaveBeenCalled();
    expect(mcpSessionService.cleanupSessionTools).not.toHaveBeenCalled();
  });
});
