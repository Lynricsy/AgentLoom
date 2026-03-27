import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrizzleDB } from '../../../database/database.module';
import type { DockerService } from '../../sandbox/docker.service';
import type { AcpTrackedSession } from '../acp-types';
import { AcpFilesystemSandboxService } from '../services/acp-filesystem-sandbox.service';

const { runInTenantTransactionMock } = vi.hoisted(() => ({
  runInTenantTransactionMock: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: runInTenantTransactionMock,
}));

describe('AcpFilesystemSandboxService', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    runInTenantTransactionMock.mockReset();

    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (!tempDir) {
        continue;
      }

      await rm(tempDir, { recursive: true, force: true });
    }
  });

  async function createWorkspaceRoot() {
    const root = await mkdtemp(join(tmpdir(), 'acp-sandbox-'));
    tempDirs.push(root);
    return root;
  }

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

  function createService() {
    const dockerService = {
      getWorkspaceHostPath: vi.fn(),
    } satisfies Pick<DockerService, 'getWorkspaceHostPath'>;
    const dockerServiceForInjection: unknown = dockerService;

    const service = new AcpFilesystemSandboxService(
      {} as DrizzleDB,
      dockerServiceForInjection as DockerService,
    );

    return {
      service,
      dockerService,
    };
  }

  it('应在受信任 workspacePath 下读取工作区内文本文件', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(
      join(workspaceRoot, 'demo', 'notes', 'todo.txt'),
      '来自真实沙箱文件系统',
      'utf8',
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service, dockerService } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/todo.txt',
      }),
    ).resolves.toEqual({
      text: '来自真实沙箱文件系统',
    });
    expect(dockerService.getWorkspaceHostPath).not.toHaveBeenCalled();
  });

  it('应在持久化 workspacePath 仍为 /workspace 时回退到 Docker 挂载解析', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(
      join(workspaceRoot, 'demo', 'notes', 'todo.txt'),
      '来自 Docker 挂载解析',
      'utf8',
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: '/workspace/',
    });
    const { service, dockerService } = createService();
    dockerService.getWorkspaceHostPath.mockResolvedValue(workspaceRoot);

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/todo.txt',
      }),
    ).resolves.toEqual({
      text: '来自 Docker 挂载解析',
    });
    expect(dockerService.getWorkspaceHostPath).toHaveBeenCalledWith(
      'container-1',
    );
  });

  it('应支持按 agentConversationId 绑定解析工作区', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(
      join(workspaceRoot, 'demo', 'notes', 'conversation.txt'),
      'conversation sandbox ok',
      'utf8',
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-conv',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession({
          serverSandbox: {
            agentConversationId: '019391d4-f000-7000-0000-000000000006',
          },
        }),
        path: 'notes/conversation.txt',
      }),
    ).resolves.toEqual({
      text: 'conversation sandbox ok',
    });
  });

  it('应拒绝逃逸 /workspace 边界的读取路径', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: '../../../etc/passwd',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
  });

  it('应拒绝指向工作区外部的符号链接读取', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const outsideRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(join(outsideRoot, 'secret.txt'), 'top-secret', 'utf8');
    await symlink(
      join(outsideRoot, 'secret.txt'),
      join(workspaceRoot, 'demo', 'notes', 'secret-link.txt'),
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/secret-link.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
  });

  it('应拒绝超过 10MB 的读取目标', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(
      join(workspaceRoot, 'demo', 'notes', 'huge.txt'),
      Buffer.alloc(10 * 1024 * 1024 + 1, 'a'),
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/huge.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox file exceeds size limit',
      data: { reason: 'sandbox_file_too_large' },
    });
  });

  it('应拒绝二进制文件读取', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    await writeFile(
      join(workspaceRoot, 'demo', 'notes', 'binary.bin'),
      Buffer.from([0x00, 0x61, 0x62, 0x63]),
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/binary.bin',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox file is binary and cannot be read as text',
      data: { reason: 'sandbox_binary_file' },
    });
  });

  it('应在工作区内成功写入文本文件', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/output.txt',
        content: 'sandbox write ok',
      }),
    ).resolves.toEqual({ success: true });

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/output.txt',
      }),
    ).resolves.toEqual({ text: 'sandbox write ok' });
  });

  it('应拒绝通过工作区外部符号链接目录写入文件', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const outsideRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo'), { recursive: true });
    await mkdir(join(outsideRoot, 'external'), { recursive: true });
    await symlink(
      join(outsideRoot, 'external'),
      join(workspaceRoot, 'demo', 'notes-link'),
    );
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes-link/output.txt',
        content: 'should fail',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
  });

  it('应拒绝超过 10MB 的文本写入', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      containerId: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.writeTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/huge.txt',
        content: 'a'.repeat(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox content exceeds size limit',
      data: { reason: 'sandbox_content_too_large' },
    });
  });

  it('应在找不到活跃沙箱会话时返回稳定错误', async () => {
    runInTenantTransactionMock.mockResolvedValue(undefined);
    const { service } = createService();

    await expect(
      service.readTextFile({
        trackedSession: createTrackedSession(),
        path: 'notes/todo.txt',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox session is unavailable',
      data: { reason: 'sandbox_session_unavailable' },
    });
  });
});
