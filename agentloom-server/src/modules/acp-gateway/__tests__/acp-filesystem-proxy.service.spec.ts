import { describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../../evidence/audit-log.service';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type { AcpConnectionState, AcpTrackedSession } from '../acp-types';
import { AcpFilesystemProxyService } from '../services/acp-filesystem-proxy.service';

describe('AcpFilesystemProxyService', () => {
  function createTrackedSession(
    overrides?: Partial<AcpTrackedSession>,
  ): AcpTrackedSession {
    return {
      sessionId: 'session-001',
      runtimeSessionId: 'runtime-session-001',
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      ...overrides,
    };
  }

  function createState(
    overrides?: Partial<AcpConnectionState>,
  ): AcpConnectionState {
    return {
      initialized: true,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      requestClient: vi.fn(),
      ...overrides,
    };
  }

  function createService() {
    const auditLogService = {
      record: vi.fn().mockResolvedValue(undefined),
    } satisfies Pick<AuditLogService, 'record'>;
    const sandboxFilesystemService = {
      readTextFile: vi.fn(),
      validateWriteTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    };

    return {
      service: new AcpFilesystemProxyService(
        auditLogService as unknown as AuditLogService,
        sandboxFilesystemService as never,
      ),
      auditLogService,
      sandboxFilesystemService,
    };
  }

  it('应在 client proxy read 模式下基于 cwd 规范化路径并映射为 canonical ContentBlock[]', async () => {
    const requestClient = vi.fn().mockReturnValue({
      requestId: 'acp-server-fs-1',
      response: Promise.resolve({
        text: '来自客户端的文件内容',
      }),
    });
    const service = new AcpFilesystemProxyService();
    const trackedSession = createTrackedSession();

    const result = await service.readTextFile(
      {
        path: 'notes/todo.txt',
        mode: 'client_proxy',
      },
      trackedSession,
      createState({ requestClient }),
    );

    expect(requestClient).toHaveBeenCalledWith('fs/read_text_file', {
      sessionId: 'session-001',
      path: '/workspace/demo/notes/todo.txt',
    });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: '来自客户端的文件内容',
        },
      ],
    });
    expect(trackedSession.pendingFsRequestIds).toBeUndefined();
  });

  it('应在 client proxy write 模式下返回稳定成功确认', async () => {
    const requestClient = vi
      .fn()
      .mockReturnValueOnce({
        requestId: 'acp-server-permission-1',
        response: Promise.resolve({
          outcome: {
            outcome: 'selected',
            optionId: 'allow-once',
          },
        }),
      })
      .mockReturnValueOnce({
        requestId: 'acp-server-fs-2',
        response: Promise.resolve({
          success: true,
        }),
      });
    const { service } = createService();

    const result = await service.writeTextFile(
      {
        path: './notes/todo.txt',
        content: 'updated text',
        mode: 'client_proxy',
      },
      createTrackedSession(),
      createState({ requestClient }),
    );

    expect(requestClient).toHaveBeenNthCalledWith(1, 'session/request_permission', {
      sessionId: 'session-001',
      toolCall: {
        toolCallId: expect.any(String),
        title: 'filesystem.write',
        kind: 'tool_call',
        status: 'awaiting_permission',
        content: [
          {
            type: 'text',
            text: '写入文件需要主人确认：/workspace/demo/notes/todo.txt',
          },
        ],
        permissionRequest: {
          description: '写入文件需要主人确认：/workspace/demo/notes/todo.txt',
          resourcePaths: ['/workspace/demo/notes/todo.txt'],
        },
      },
      options: expect.arrayContaining([
        expect.objectContaining({ optionId: 'allow-once', kind: 'allow_once' }),
        expect.objectContaining({ optionId: 'allow-always', kind: 'allow_always' }),
        expect.objectContaining({ optionId: 'reject-once', kind: 'reject_once' }),
        expect.objectContaining({ optionId: 'reject-always', kind: 'reject_always' }),
      ]),
    });
    expect(requestClient).toHaveBeenNthCalledWith(2, 'fs/write_text_file', {
      sessionId: 'session-001',
      path: '/workspace/demo/notes/todo.txt',
      content: 'updated text',
    });
    expect(result).toEqual({
      success: true,
    });
  });

  it('应在文件写入权限被拒绝时返回稳定错误并写入正式审计', async () => {
    const requestClient = vi.fn().mockReturnValue({
      requestId: 'acp-server-permission-2',
      response: Promise.resolve({
        outcome: {
          outcome: 'selected',
          optionId: 'reject-once',
        },
      }),
    });
    const { service, auditLogService } = createService();

    await expect(
      service.writeTextFile(
        {
          path: './notes/blocked.txt',
          content: 'blocked',
          mode: 'client_proxy',
        },
        createTrackedSession(),
        createState({ requestClient }),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP file operation was rejected by permission policy',
    });
    expect(requestClient).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: null,
        actorType: 'service',
        eventType: 'acp.fs.permission.denied',
        resourceType: 'acp_session',
        resourceId: 'session-001',
      }),
    );
  });

  it('应在文件写入权限被取消时返回稳定错误并写入正式审计', async () => {
    const requestClient = vi.fn().mockReturnValue({
      requestId: 'acp-server-permission-3',
      response: Promise.resolve({
        outcome: {
          outcome: 'cancelled',
        },
      }),
    });
    const { service, auditLogService } = createService();

    await expect(
      service.writeTextFile(
        {
          path: './notes/cancelled.txt',
          content: 'cancelled',
          mode: 'client_proxy',
        },
        createTrackedSession(),
        createState({ requestClient }),
      ),
    ).rejects.toMatchObject({
      code: -32005,
      message: 'ACP file permission request was cancelled',
    });
    expect(requestClient).toHaveBeenCalledTimes(1);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.fs.permission.cancelled',
        resourceId: 'session-001',
      }),
    );
  });

  it('应在 client 缺少读能力时返回稳定错误', async () => {
    const service = new AcpFilesystemProxyService();

    await expect(
      service.readTextFile(
        {
          path: '/workspace/demo/notes.txt',
          mode: 'client_proxy',
        },
        createTrackedSession(),
        createState({
          clientCapabilities: {
            fs: {
              readTextFile: false,
              writeTextFile: true,
            },
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP client does not support requested fs capability',
    });
  });

  it('应在 server sandbox read 模式下要求会话已绑定服务端沙箱', async () => {
    const { service, auditLogService } = createService();

    await expect(
      service.readTextFile(
        {
          path: 'notes.txt',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox is not bound to current session',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.fs.server_sandbox.rejected',
        resourceId: 'session-001',
        metadata: expect.objectContaining({
          reason: 'sandbox_binding_missing',
        }),
      }),
    );
  });

  it('应在 server sandbox read 模式下委托给沙箱文件服务并映射为 canonical ContentBlock[]', async () => {
    const { service, sandboxFilesystemService } = createService();
    const trackedSession = createTrackedSession({
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    sandboxFilesystemService.readTextFile.mockResolvedValue({
      text: '来自沙箱的文件内容',
    });

    const result = await service.readTextFile(
      {
        path: 'notes/todo.txt',
        mode: 'server_sandbox',
      },
      trackedSession,
      createState(),
    );

    expect(sandboxFilesystemService.readTextFile).toHaveBeenCalledWith({
      trackedSession,
      path: 'notes/todo.txt',
    });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: '来自沙箱的文件内容',
        },
      ],
    });
  });

  it('应在 server sandbox write 模式下先完成权限确认再委托给沙箱文件服务', async () => {
    const requestClient = vi.fn().mockReturnValue({
      requestId: 'acp-server-permission-4',
      response: Promise.resolve({
        outcome: {
          outcome: 'selected',
          optionId: 'allow-once',
        },
      }),
    });
    const { service, sandboxFilesystemService } = createService();
    const trackedSession = createTrackedSession({
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    sandboxFilesystemService.validateWriteTextFile.mockResolvedValue(undefined);
    sandboxFilesystemService.writeTextFile.mockResolvedValue({
      success: true,
    });

    const result = await service.writeTextFile(
      {
        path: 'notes/todo.txt',
        content: 'sandbox text',
        mode: 'server_sandbox',
      },
      trackedSession,
      createState({ requestClient }),
    );

    expect(requestClient).toHaveBeenCalledTimes(1);
    expect(sandboxFilesystemService.validateWriteTextFile).toHaveBeenCalledWith({
      trackedSession,
      path: 'notes/todo.txt',
      content: 'sandbox text',
    });
    expect(requestClient).toHaveBeenCalledWith('session/request_permission', {
      sessionId: 'session-001',
      toolCall: {
        toolCallId: expect.any(String),
        title: 'filesystem.write',
        kind: 'tool_call',
        status: 'awaiting_permission',
        content: [
          {
            type: 'text',
            text: '写入文件需要主人确认：/workspace/demo/notes/todo.txt',
          },
        ],
        permissionRequest: {
          description: '写入文件需要主人确认：/workspace/demo/notes/todo.txt',
          resourcePaths: ['/workspace/demo/notes/todo.txt'],
        },
      },
      options: expect.arrayContaining([
        expect.objectContaining({ optionId: 'allow-once', kind: 'allow_once' }),
      ]),
    });
    expect(sandboxFilesystemService.writeTextFile).toHaveBeenCalledWith({
      trackedSession,
      path: 'notes/todo.txt',
      content: 'sandbox text',
    });
    expect(result).toEqual({ success: true });
  });

  it('应在 server sandbox write 目标越界时先 fail-closed，且不进入权限确认', async () => {
    const requestClient = vi.fn();
    const { service, sandboxFilesystemService, auditLogService } = createService();
    const trackedSession = createTrackedSession({
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
    });
    sandboxFilesystemService.validateWriteTextFile.mockRejectedValue(
      new AcpJsonRpcError(
        -32004,
        'ACP server sandbox path escapes workspace',
        { reason: 'sandbox_path_escaped_workspace' },
      ),
    );

    await expect(
      service.writeTextFile(
        {
          path: '../../../etc/passwd',
          content: 'blocked',
          mode: 'server_sandbox',
        },
        trackedSession,
        createState({ requestClient }),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
    });

    expect(requestClient).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.fs.server_sandbox.rejected',
        resourceId: 'session-001',
        metadata: expect.objectContaining({
          operation: 'write_text_file',
          reason: 'sandbox_path_escaped_workspace',
        }),
      }),
    );
  });

  it('应在沙箱文件服务拒绝越界读取时透传稳定错误并写入正式审计', async () => {
    const { service, sandboxFilesystemService, auditLogService } = createService();
    sandboxFilesystemService.readTextFile.mockRejectedValue(
      new AcpJsonRpcError(
        -32004,
        'ACP server sandbox path escapes workspace',
        { reason: 'sandbox_path_escaped_workspace' },
      ),
    );

    await expect(
      service.readTextFile(
        {
          path: 'notes/../../secret.txt',
          mode: 'server_sandbox',
        },
        createTrackedSession({
          serverSandbox: {
            executionId: '019391d4-e000-7000-0000-000000000005',
          },
        }),
        createState(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.fs.server_sandbox.rejected',
        resourceId: 'session-001',
        metadata: expect.objectContaining({
          reason: 'sandbox_path_escaped_workspace',
          operation: 'read_text_file',
        }),
      }),
    );
  });

  it('应将被结清的 in-flight client fs 请求映射为稳定取消错误', async () => {
    const service = new AcpFilesystemProxyService();
    const trackedSession = createTrackedSession();

    await expect(
      service.readTextFile(
        {
          path: '/workspace/demo/notes.txt',
          mode: 'client_proxy',
        },
        trackedSession,
        createState({
          requestClient: vi.fn().mockReturnValue({
            requestId: 'acp-server-fs-3',
            response: Promise.resolve({
              cancelled: true,
            }),
          }),
        }),
      ),
    ).rejects.toMatchObject({
      code: -32005,
      message: 'ACP client fs request was cancelled',
    });
    expect(trackedSession.pendingFsRequestIds).toBeUndefined();
  });
});
