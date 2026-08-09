import {
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { SandboxRuntimeDriver } from '../../sandbox/sandbox-runtime-driver.port';
import type { AcpTrackedSession } from '../acp-types';
import { AcpFilesystemSandboxService } from '../services/acp-filesystem-sandbox.service';

const { runInTenantTransactionMock } = vi.hoisted(() => ({
  runInTenantTransactionMock: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: runInTenantTransactionMock,
}));

interface RuntimeFileDriverMock {
  readTextFile: MockedFunction<SandboxRuntimeDriver['readTextFile']>;
  validateTextFileWrite: MockedFunction<
    SandboxRuntimeDriver['validateTextFileWrite']
  >;
  writeTextFile: MockedFunction<SandboxRuntimeDriver['writeTextFile']>;
}

describe('AcpFilesystemSandboxService', () => {
  afterEach(() => {
    runInTenantTransactionMock.mockReset();
  });

  function createTrackedSession(
    overrides?: Partial<AcpTrackedSession>,
  ): AcpTrackedSession {
    return {
      sessionId: 'session-001',
      runtimeSessionId: 'runtime-session-001',
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      cwd: '/workspace/demo',
      serverSandbox: {
        executionId: '019391d4-e000-7000-0000-000000000005',
      },
      ...overrides,
    };
  }

  function createService(): {
    service: AcpFilesystemSandboxService;
    runtime: RuntimeFileDriverMock;
  } {
    const runtime: RuntimeFileDriverMock = {
      readTextFile: vi.fn(),
      validateTextFileWrite: vi.fn().mockResolvedValue(undefined),
      writeTextFile: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AcpFilesystemSandboxService(
      {} as DrizzleDB,
      runtime as unknown as SandboxRuntimeDriver,
    );
    return { service, runtime };
  }

  it('通过 opaque runtime handle 读取工作区文本', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();
    runtime.readTextFile.mockResolvedValue(
      Buffer.from('来自 Firecracker guest 文件系统'),
    );

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/todo.txt',
      }),
    ).resolves.toEqual({ text: '来自 Firecracker guest 文件系统' });
    expect(runtime.readTextFile).toHaveBeenCalledWith(
      'runtime-1',
      '/workspace/demo/notes/todo.txt',
      10 * 1024 * 1024,
    );
  });

  it('支持按 agentConversationId 绑定解析 runtime', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-conversation',
    });
    const { service, runtime } = createService();
    runtime.readTextFile.mockResolvedValue(Buffer.from('conversation ok'));

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession({
          serverSandbox: {
            agentConversationId: '019391d4-f000-7000-0000-000000000006',
          },
        }),
        path: 'notes/conversation.txt',
      }),
    ).resolves.toEqual({ text: 'conversation ok' });
    expect(runtime.readTextFile).toHaveBeenCalledWith(
      'runtime-conversation',
      '/workspace/demo/notes/conversation.txt',
      10 * 1024 * 1024,
    );
  });

  it('在请求 runtime 前拒绝逃逸 /workspace 的路径', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: '../../../etc/passwd',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
    expect(runtime.readTextFile).not.toHaveBeenCalled();
  });

  it('将 guest 缺失或 symlink 拒绝映射为稳定读取错误', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();
    runtime.readTextFile.mockRejectedValue(new Error('status 404'));

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/escape-link.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_path_missing' },
    });
  });

  it('将 guest 413 映射为文本文件大小错误', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();
    runtime.readTextFile.mockRejectedValue(new Error('status 413'));

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/huge.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_file_too_large' },
    });
  });

  it('拒绝 guest 返回的二进制内容', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();
    runtime.readTextFile.mockResolvedValue(Buffer.from([0, 1, 2]));

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/binary.bin',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_binary_file' },
    });
  });

  it('先远程校验再写入 guest 文本文件', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/output.txt',
        content: 'sandbox write ok',
      }),
    ).resolves.toEqual({ success: true });
    expect(runtime.validateTextFileWrite).toHaveBeenCalledWith(
      'runtime-1',
      '/workspace/demo/notes/output.txt',
      10 * 1024 * 1024,
    );
    expect(runtime.writeTextFile).toHaveBeenCalledWith(
      'runtime-1',
      '/workspace/demo/notes/output.txt',
      'sandbox write ok',
      10 * 1024 * 1024,
    );
  });

  it('将 guest 写目标拒绝映射为 workspace 边界错误', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();
    runtime.validateTextFileWrite.mockRejectedValue(new Error('status 400'));

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes-link/output.txt',
        content: 'should fail',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
    expect(runtime.writeTextFile).not.toHaveBeenCalled();
  });

  it('在请求 guest 前拒绝超过 10MB 的文本', async () => {
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'runtime-1',
    });
    const { service, runtime } = createService();

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/huge.txt',
        content: 'a'.repeat(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_content_too_large' },
    });
    expect(runtime.validateTextFileWrite).not.toHaveBeenCalled();
  });

  it('找不到活跃 runtime 时返回稳定错误', async () => {
    runInTenantTransactionMock.mockResolvedValue(undefined);
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/todo.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      data: { reason: 'sandbox_session_unavailable' },
    });
  });
});
