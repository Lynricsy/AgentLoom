import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
import { AcpTerminalSandboxService } from '../services/acp-terminal-sandbox.service';

const { runInTenantTransactionMock } = vi.hoisted(() => ({
  runInTenantTransactionMock: vi.fn(),
}));

vi.mock('../../../common/interceptors/tenant-transaction.context', () => ({
  runInTenantTransaction: runInTenantTransactionMock,
}));

describe('AcpTerminalSandboxService', () => {
  delete process.env.ACP_TEST_FAKE_RUNTIME;
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
    const root = await mkdtemp(join(tmpdir(), 'acp-terminal-sandbox-'));
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
    const runtime: {
      createExec: MockedFunction<SandboxRuntimeDriver['createExec']>;
    } = {
      createExec: vi.fn(),
    };
    const service = new AcpTerminalSandboxService(
      {} as DrizzleDB,
      runtime as unknown as SandboxRuntimeDriver,
    );

    return {
      service,
      runtimeDriver: runtime,
    };
  }

  it('应在受信任 workspacePath 下解析 cwd 并创建非交互式 sandbox exec', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service, runtimeDriver } = createService();
    runtimeDriver.createExec.mockResolvedValue({
      execId: 'exec-1',
    });

    await expect(
      service.createTerminal({
        trackedSession: createTrackedSession(),
        command: 'ls',
        args: ['-la'],
        cwd: 'notes',
      }),
    ).resolves.toEqual({
      execId: 'exec-1',
      cwd: '/workspace/demo/notes',
    });

    expect(runtimeDriver.createExec).toHaveBeenCalledWith('container-1', {
      command: 'ls',
      args: ['-la'],
      cwd: '/workspace/demo/notes',
    });
  });

  it('应在未显式提供 cwd 时默认使用 session cwd', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service, runtimeDriver } = createService();
    runtimeDriver.createExec.mockResolvedValue({
      execId: 'exec-2',
    });

    await expect(
      service.createTerminal({
        trackedSession: createTrackedSession(),
        command: 'pwd',
      }),
    ).resolves.toEqual({
      execId: 'exec-2',
      cwd: '/workspace/demo',
    });

    expect(runtimeDriver.createExec).toHaveBeenCalledWith('container-1', {
      command: 'pwd',
      args: undefined,
      cwd: '/workspace/demo',
    });
  });

  it('应支持按 agentConversationId 绑定创建 terminal', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo', 'notes'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'container-conv',
      workspacePath: workspaceRoot,
    });
    const { service, runtimeDriver } = createService();
    runtimeDriver.createExec.mockResolvedValue({
      execId: 'exec-conv',
    });

    await expect(
      service.createTerminal({
        trackedSession: createTrackedSession({
          serverSandbox: {
            agentConversationId: '019391d4-f000-7000-0000-000000000006',
          },
        }),
        command: 'ls',
        cwd: 'notes',
      }),
    ).resolves.toEqual({
      execId: 'exec-conv',
      cwd: '/workspace/demo/notes',
    });

    expect(runtimeDriver.createExec).toHaveBeenCalledWith('container-conv', {
      command: 'ls',
      args: undefined,
      cwd: '/workspace/demo/notes',
    });
  });

  it('应拒绝逃逸 /workspace 边界的终端 cwd', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await mkdir(join(workspaceRoot, 'demo'), { recursive: true });
    runInTenantTransactionMock.mockResolvedValue({
      runtimeHandle: 'container-1',
      workspacePath: workspaceRoot,
    });
    const { service } = createService();

    await expect(
      service.createTerminal({
        trackedSession: createTrackedSession(),
        command: 'ls',
        cwd: '../../../etc',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox path escapes workspace',
      data: { reason: 'sandbox_path_escaped_workspace' },
    });
  });

  it('应在找不到活跃沙箱会话时返回稳定错误', async () => {
    runInTenantTransactionMock.mockResolvedValue(undefined);
    const { service } = createService();

    await expect(
      service.createTerminal({
        trackedSession: createTrackedSession(),
        command: 'ls',
      }),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP server sandbox session is unavailable',
      data: { reason: 'sandbox_session_unavailable' },
    });
  });
});
