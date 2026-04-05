import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';

import { WorkspaceIntegrationService } from '../workspace-integration.service';

const {
  mockDockerService,
  mockSandboxService,
  mockWorkspaceService,
  mockEventEmitter,
  mockSessionPersistence,
  mockDb,
} = vi.hoisted(() => ({
  mockDockerService: {
    createExec: vi.fn(),
    attachExecOutput: vi.fn(),
    waitForExecExit: vi.fn(),
  },
  mockSandboxService: {
    findByConversationId: vi.fn(),
    findByExecutionId: vi.fn(),
    endConversationSandbox: vi.fn(),
  },
  mockWorkspaceService: {
    createFromSandbox: vi.fn(),
    syncFromSandboxContainer: vi.fn(),
    findOne: vi.fn(),
    getFileTree: vi.fn(),
    getFilePreview: vi.fn(),
    resolveOrganizationId: vi.fn(),
  },
  mockEventEmitter: {
    emit: vi.fn(),
  },
  mockSessionPersistence: {
    loadFromCheckpoint: vi.fn(),
  },
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

const CONVERSATION_ID = 'conv-001';
const TENANT_ID = 'tenant-001';
const CONTAINER_ID = 'container-abc';
const EXECUTION_ID = 'exec-001';
const STEP_ID = 'step-001';
const SANDBOX_NODE_ID = 'sandbox-node-001';
const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const SESSION_ID = 'session-001';
const WORKSPACE_SNAPSHOT_ID = 'workspace-001';

function mockSandboxSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    containerId: CONTAINER_ID,
    config: {},
    status: 'running',
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function mockWorkflowSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-session-001',
    agentId: 'agent-001',
    mode: 'workflow',
    status: 'active',
    tenantId: TENANT_ID,
    context: {
      history: [],
      workflowState: {
        executionId: EXECUTION_ID,
        serverSandbox: {
          executionId: EXECUTION_ID,
          sandboxNodeId: SANDBOX_NODE_ID,
        },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createSelectChain<T>(value: T) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([value]),
      }),
    }),
  };
}

function createUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

/**
 * 辅助函数: 让 attachExecOutput 同步回调 stdout 消息
 */
function setupExecWithOutput(output: string) {
  let execCounter = 0;

  mockDockerService.createExec.mockImplementation(async () => ({
    execId: `exec-${++execCounter}`,
  }));

  mockDockerService.attachExecOutput.mockImplementation(
    async (
      _execId: string,
      callback: (level: string, message: string) => void,
    ) => {
      callback('stdout', output);
    },
  );

  mockDockerService.waitForExecExit.mockResolvedValue({
    running: false,
    exitCode: 0,
    pid: 123,
  });
}

/**
 * 辅助函数: 让 attachExecOutput 按序返回不同的输出
 */
function setupExecWithSequentialOutputs(outputs: string[]) {
  let execCounter = 0;
  let outputIndex = 0;

  mockDockerService.createExec.mockImplementation(async () => ({
    execId: `exec-${++execCounter}`,
  }));

  mockDockerService.attachExecOutput.mockImplementation(
    async (
      _execId: string,
      callback: (level: string, message: string) => void,
    ) => {
      const content = outputs[outputIndex] ?? '';
      outputIndex++;
      callback('stdout', content);
    },
  );

  mockDockerService.waitForExecExit.mockResolvedValue({
    running: false,
    exitCode: 0,
    pid: 123,
  });
}

describe('WorkspaceIntegrationService', () => {
  let service: WorkspaceIntegrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSandboxService.findByConversationId.mockReset();
    mockSandboxService.findByExecutionId.mockReset();
    mockSandboxService.endConversationSandbox.mockReset();
    mockWorkspaceService.findOne.mockReset();
    mockWorkspaceService.getFileTree.mockReset();
    mockWorkspaceService.getFilePreview.mockReset();
    mockWorkspaceService.syncFromSandboxContainer.mockReset();
    mockWorkspaceService.resolveOrganizationId
      .mockReset()
      .mockResolvedValue(ORG_ID);
    mockSessionPersistence.loadFromCheckpoint
      .mockReset()
      .mockResolvedValue(null);
    mockDb.select.mockReset();
    mockDb.update.mockReset();

    service = new WorkspaceIntegrationService(
      mockDb as never,
      mockDockerService as never,
      mockSandboxService as never,
      mockWorkspaceService as never,
      mockEventEmitter as never,
      mockSessionPersistence as never,
    );
  });

  afterEach(() => {
    service.stopAllWatchers();
    vi.useRealTimers();
  });

  describe('getFileTree', () => {
    it('应返回解析后的文件树结构', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      const findOutput = [
        'd|0|src',
        'f|1024|src/main.ts',
        'f|512|src/index.ts',
        'f|256|README.md',
      ].join('\n');

      setupExecWithOutput(findOutput);

      const result = await service.getFileTree(CONVERSATION_ID, TENANT_ID);

      expect(result).toHaveLength(2);
      const srcDir = result.find((n) => n.name === 'src');
      expect(srcDir).toBeDefined();
      expect(srcDir!.type).toBe('directory');
      expect(srcDir!.children).toHaveLength(2);

      const readme = result.find((n) => n.name === 'README.md');
      expect(readme).toBeDefined();
      expect(readme!.type).toBe('file');
      expect(readme!.size).toBe(256);
    });

    it('沙箱不存在时应返回空目录树', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {},
        }),
      );

      await expect(
        service.getFileTree(CONVERSATION_ID, TENANT_ID),
      ).resolves.toEqual([]);
    });

    it('容器 ID 为空时应返回空目录树', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession({ containerId: null }),
      );
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {},
        }),
      );

      await expect(
        service.getFileTree(CONVERSATION_ID, TENANT_ID),
      ).resolves.toEqual([]);
    });

    it('空输出应返回空数组', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );
      setupExecWithOutput('');

      const result = await service.getFileTree(CONVERSATION_ID, TENANT_ID);
      expect(result).toEqual([]);
    });

    it('运行中容器不存在但 conversation metadata 含目录树快照时应回退到快照', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {
            workspaceTreeSnapshot: {
              nodes: [
                {
                  name: 'workspace',
                  path: 'workspace',
                  type: 'directory',
                  children: [
                    {
                      name: 'summary.txt',
                      path: 'workspace/summary.txt',
                      type: 'file',
                      size: 24,
                    },
                  ],
                },
              ],
              capturedAt: '2026-04-01T09:00:00.000Z',
              previewUnavailableReason:
                '此运行已结束，仅保留工作区目录结构，未保留文件内容预览',
            },
          },
        }),
      );

      const result = await service.getFileTree(CONVERSATION_ID, TENANT_ID);

      expect(result).toEqual([
        {
          name: 'workspace',
          path: 'workspace',
          type: 'directory',
          children: [
            {
              name: 'summary.txt',
              path: 'workspace/summary.txt',
              type: 'file',
              size: 24,
            },
          ],
        },
      ]);
    });
  });

  describe('getExecutionStepFileTree', () => {
    it('应按 step checkpoint 解析对应 workflow sandbox 的文件树', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {},
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );

      setupExecWithOutput(['d|0|src', 'f|128|src/main.ts'].join('\n'));

      const result = await service.getExecutionStepFileTree(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('src');
      expect(mockSessionPersistence.loadFromCheckpoint).toHaveBeenCalledWith(
        TENANT_ID,
        STEP_ID,
      );
      expect(mockSandboxService.findByExecutionId).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
        SANDBOX_NODE_ID,
      );
    });

    it('checkpoint 指向其他 execution 时应抛出异常', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {},
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession({
          context: {
            history: [],
            workflowState: {
              executionId: 'exec-other',
              serverSandbox: {
                executionId: 'exec-other',
                sandboxNodeId: SANDBOX_NODE_ID,
              },
            },
          },
        }),
      );

      await expect(
        service.getExecutionStepFileTree(EXECUTION_ID, STEP_ID, TENANT_ID),
      ).rejects.toThrow('不属于执行');
    });

    it('运行中容器不存在但 checkpoint 含 workspaceSnapshotId 时应回退到快照', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {
            workspaceSnapshotId: WORKSPACE_SNAPSHOT_ID,
          },
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(null);
      mockWorkspaceService.getFileTree.mockResolvedValue([
        {
          name: 'src',
          type: 'directory',
          path: 'src',
          children: [
            {
              name: 'main.ts',
              type: 'file',
              path: 'src/main.ts',
              size: 14,
            },
          ],
        },
      ]);

      const result = await service.getExecutionStepFileTree(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.path).toBe('src');
      expect(result[0]?.children?.[0]?.path).toBe('src/main.ts');
      expect(mockWorkspaceService.getFileTree).toHaveBeenCalledWith(
        TENANT_ID,
        WORKSPACE_SNAPSHOT_ID,
      );
    });

    it('session checkpoint 缺失时应回退到 step checkpoint 中的 sandboxNodeId', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {
            sandboxNodeId: SANDBOX_NODE_ID,
            serverSandbox: {
              executionId: EXECUTION_ID,
              sandboxNodeId: SANDBOX_NODE_ID,
            },
          },
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(null);
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );

      setupExecWithOutput(['d|0|src', 'f|128|src/main.ts'].join('\n'));

      await service.getExecutionStepFileTree(EXECUTION_ID, STEP_ID, TENANT_ID);

      expect(mockSandboxService.findByExecutionId).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
        SANDBOX_NODE_ID,
      );
    });
  });

  describe('getFileContent', () => {
    it('应返回文件内容和元数据', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      setupExecWithSequentialOutputs([
        '1024|regular file',
        'hello world content',
        'hello world content',
      ]);

      const result = await service.getFileContent(
        CONVERSATION_ID,
        TENANT_ID,
        'src/main.ts',
      );

      expect(result.path).toBe('src/main.ts');
      expect(result.content).toBe('hello world content');
      expect(result.size).toBe(1024);
      expect(result.encoding).toBe('utf-8');
    });

    it('非普通文件应抛出异常', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );
      setupExecWithSequentialOutputs(['0|directory']);

      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, 'src'),
      ).rejects.toThrow('不是普通文件');
    });

    it('超过大小限制应抛出异常', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );
      const oversized = (10 * 1024 * 1024 + 1).toString();
      setupExecWithSequentialOutputs([`${oversized}|regular file`]);

      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, 'big.bin'),
      ).rejects.toThrow('超过最大读取限制');
    });

    it('二进制文件应抛出异常', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      let outputIndex = 0;
      const outputs = ['1024|regular file'];

      mockDockerService.createExec.mockImplementation(async () => ({
        execId: `exec-binary-${++outputIndex}`,
      }));

      mockDockerService.attachExecOutput.mockImplementation(
        async (
          _execId: string,
          callback: (level: string, message: string) => void,
        ) => {
          if (outputIndex <= outputs.length) {
            callback('stdout', outputs[outputIndex - 1]);
          } else {
            const binaryContent = 'abc\x00def';
            callback('stdout', binaryContent);
          }
        },
      );

      mockDockerService.waitForExecExit.mockResolvedValue({
        running: false,
        exitCode: 0,
        pid: 123,
      });

      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, 'image.png'),
      ).rejects.toThrow('二进制文件');
    });

    it('路径穿越应被拒绝', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      await expect(
        service.getFileContent(
          CONVERSATION_ID,
          TENANT_ID,
          '../../../etc/passwd',
        ),
      ).rejects.toThrow('路径穿越被拒绝');
    });

    it('空文件路径应被拒绝', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, ''),
      ).rejects.toThrow('文件路径不能为空');
    });

    it('./current/path 应正确归一化', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      setupExecWithSequentialOutputs([
        '100|regular file',
        'content',
        'content',
      ]);

      const result = await service.getFileContent(
        CONVERSATION_ID,
        TENANT_ID,
        './src/../src/main.ts',
      );

      expect(result.path).toBe('src/main.ts');
    });

    it('运行中容器不存在但存在目录树快照时应明确拒绝文件预览', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {
            workspaceTreeSnapshot: {
              nodes: [
                {
                  name: 'summary.txt',
                  path: 'summary.txt',
                  type: 'file',
                  size: 12,
                },
              ],
              capturedAt: '2026-04-01T09:00:00.000Z',
              previewUnavailableReason:
                '此运行已结束，仅保留工作区目录结构，未保留文件内容预览',
            },
          },
        }),
      );

      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, 'summary.txt'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.getFileContent(CONVERSATION_ID, TENANT_ID, 'summary.txt'),
      ).rejects.toThrow('仅保留工作区目录结构');
    });
  });

  describe('getExecutionStepFileContent', () => {
    it('应读取 workflow step 对应沙箱中的文本文件', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {},
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );

      setupExecWithSequentialOutputs([
        '42|regular file',
        'hello workflow',
        'hello workflow',
      ]);

      const result = await service.getExecutionStepFileContent(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        'src/main.ts',
      );

      expect(result.path).toBe('src/main.ts');
      expect(result.content).toBe('hello workflow');
      expect(mockSandboxService.findByExecutionId).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
        SANDBOX_NODE_ID,
      );
    });

    it('运行中容器不存在但存在 workspace 快照时应读取归档文件内容', async () => {
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {
            workspaceSnapshotId: WORKSPACE_SNAPSHOT_ID,
          },
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(null);
      mockWorkspaceService.getFilePreview.mockResolvedValue({
        kind: 'text',
        path: 'src/main.ts',
        fileName: 'main.ts',
        size: 14,
        mimeType: 'text/typescript',
        canDownload: true,
        content: 'hello snapshot',
        encoding: 'utf-8',
      });

      const result = await service.getExecutionStepFileContent(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        'src/main.ts',
      );

      expect(result.content).toBe('hello snapshot');
      expect(result.path).toBe('src/main.ts');
      expect(mockWorkspaceService.getFilePreview).toHaveBeenCalledWith(
        TENANT_ID,
        WORKSPACE_SNAPSHOT_ID,
        'src/main.ts',
      );
    });
  });

  describe('startFileWatcher', () => {
    it('应启动轮询定时器并在检测到变更时发出事件', async () => {
      setupExecWithOutput('');

      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);

      await vi.advanceTimersByTimeAsync(0);

      const changedFiles = 'src/main.ts\nsrc/index.ts';
      setupExecWithOutput(changedFiles);

      await vi.advanceTimersByTimeAsync(3000);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'workspace.file_change',
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          changedFiles: ['src/main.ts', 'src/index.ts'],
        }),
      );
    });

    it('已有监听器时不应创建重复的', () => {
      setupExecWithOutput('');

      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);
      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);

      expect(true).toBe(true);
    });

    it('没有变更文件时不应发出事件', async () => {
      setupExecWithOutput('');

      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);

      await vi.advanceTimersByTimeAsync(0);

      setupExecWithOutput('');
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'workspace.file_change',
        expect.anything(),
      );
    });
  });

  describe('startExecutionStepFileWatcher', () => {
    it('应为 workflow step 启动独立 watcher 并发出 execution 维度事件', async () => {
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );
      setupExecWithOutput('');

      await service.startExecutionStepFileWatcher({
        executionId: EXECUTION_ID,
        stepId: STEP_ID,
        tenantId: TENANT_ID,
        sandboxNodeId: SANDBOX_NODE_ID,
      });

      await vi.advanceTimersByTimeAsync(0);

      setupExecWithOutput('src/main.ts\nsrc/utils.ts');
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'workspace.file_change',
        expect.objectContaining({
          executionId: EXECUTION_ID,
          stepId: STEP_ID,
          sandboxNodeId: SANDBOX_NODE_ID,
          tenantId: TENANT_ID,
          changedFiles: ['src/main.ts', 'src/utils.ts'],
        }),
      );
    });
  });

  describe('stopFileWatcher', () => {
    it('应清理定时器', () => {
      setupExecWithOutput('');

      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);
      service.stopFileWatcher(CONVERSATION_ID);

      expect(true).toBe(true);
    });

    it('不存在的监听器应静默忽略', () => {
      expect(() => service.stopFileWatcher('nonexistent')).not.toThrow();
    });
  });

  describe('onConversationEnd', () => {
    it('应保存目录树快照并写回 conversation metadata', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession({
          config: { persistencePath: '/data/workspaces' },
        }),
      );
      setupExecWithOutput(
        ['d|0|workspace', 'f|24|workspace/summary.txt'].join('\n'),
      );
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: { title: 'existing-metadata' },
        }),
      );
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.onConversationEnd(
        CONVERSATION_ID,
        TENANT_ID,
        ORG_ID,
        USER_ID,
      );

      expect(mockWorkspaceService.createFromSandbox).not.toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        metadata: {
          title: 'existing-metadata',
          workspaceTreeSnapshot: {
            nodes: [
              {
                name: 'workspace',
                path: 'workspace',
                type: 'directory',
                children: [
                  {
                    name: 'summary.txt',
                    path: 'workspace/summary.txt',
                    type: 'file',
                    size: 24,
                  },
                ],
              },
            ],
            capturedAt: expect.any(String),
            previewUnavailableReason:
              '此运行已结束，仅保留工作区目录结构，未保留文件内容预览',
          },
        },
        updatedAt: expect.any(Date),
      });
    });

    it('没有 persistencePath 时也应保存目录树快照', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession({ config: {} }),
      );
      setupExecWithOutput(['f|12|summary.txt'].join('\n'));
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {},
        }),
      );
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.onConversationEnd(
        CONVERSATION_ID,
        TENANT_ID,
        ORG_ID,
        USER_ID,
      );

      expect(updateChain.set).toHaveBeenCalled();
    });

    it('没有沙箱会话时应跳过目录树快照', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);

      await service.onConversationEnd(
        CONVERSATION_ID,
        TENANT_ID,
        ORG_ID,
        USER_ID,
      );

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('目录树快照保存失败时应捕获异常而不是抛出', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession({
          config: { persistencePath: '/data' },
        }),
      );
      mockDockerService.createExec.mockRejectedValue(new Error('exec down'));

      await expect(
        service.onConversationEnd(CONVERSATION_ID, TENANT_ID, ORG_ID, USER_ID),
      ).resolves.toBeUndefined();
    });

    it('应同时停止文件监听器', async () => {
      setupExecWithOutput('');
      service.startFileWatcher(CONVERSATION_ID, TENANT_ID, CONTAINER_ID);

      mockSandboxService.findByConversationId.mockResolvedValue(null);

      await service.onConversationEnd(
        CONVERSATION_ID,
        TENANT_ID,
        ORG_ID,
        USER_ID,
      );

      mockDockerService.createExec.mockClear();
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockDockerService.createExec).not.toHaveBeenCalled();
    });
  });

  describe('archiveExecutionStepWorkspace', () => {
    it('应为 workflow step 归档工作区并返回快照 ID', async () => {
      mockDb.select
        .mockReturnValueOnce(
          createSelectChain({
            id: STEP_ID,
            executionId: EXECUTION_ID,
            checkpointData: {},
          }),
        )
        .mockReturnValueOnce(
          createSelectChain({
            createdBy: USER_ID,
          }),
        );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );
      mockWorkspaceService.createFromSandbox.mockResolvedValue({
        id: WORKSPACE_SNAPSHOT_ID,
      });

      const snapshotId = await service.archiveExecutionStepWorkspace(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );

      expect(snapshotId).toBe(WORKSPACE_SNAPSHOT_ID);
      expect(mockWorkspaceService.resolveOrganizationId).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(mockWorkspaceService.createFromSandbox).toHaveBeenCalledWith(
        TENANT_ID,
        ORG_ID,
        USER_ID,
        SESSION_ID,
        `execution-${EXECUTION_ID}-step-${STEP_ID}-workspace`,
        expect.stringContaining('自动归档'),
      );
    });

    it('绑定了 restoreWorkspaceId 时应覆盖同步原工作区并返回同一 ID', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {},
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession({
          config: { restoreWorkspaceId: WORKSPACE_SNAPSHOT_ID },
        }),
      );
      mockWorkspaceService.syncFromSandboxContainer.mockResolvedValue({
        id: WORKSPACE_SNAPSHOT_ID,
      });

      const snapshotId = await service.archiveExecutionStepWorkspace(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );

      expect(snapshotId).toBe(WORKSPACE_SNAPSHOT_ID);
      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).toHaveBeenCalledWith(WORKSPACE_SNAPSHOT_ID, CONTAINER_ID, TENANT_ID);
      expect(mockWorkspaceService.createFromSandbox).not.toHaveBeenCalled();
      expect(mockWorkspaceService.resolveOrganizationId).not.toHaveBeenCalled();
    });

    it('运行中容器不存在但 restoreWorkspaceId 存在时应回退到原工作区 ID', async () => {
      mockDb.select.mockReturnValueOnce(
        createSelectChain({
          id: STEP_ID,
          executionId: EXECUTION_ID,
          checkpointData: {},
        }),
      );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(
        mockWorkflowSession(),
      );
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession({
          containerId: null,
          config: { restoreWorkspaceId: WORKSPACE_SNAPSHOT_ID },
        }),
      );

      const snapshotId = await service.archiveExecutionStepWorkspace(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
      );

      expect(snapshotId).toBe(WORKSPACE_SNAPSHOT_ID);
      expect(
        mockWorkspaceService.syncFromSandboxContainer,
      ).not.toHaveBeenCalled();
      expect(mockWorkspaceService.createFromSandbox).not.toHaveBeenCalled();
    });

    it('session checkpoint 缺失时应使用显式 sandboxNodeId 归档 workflow step', async () => {
      mockDb.select
        .mockReturnValueOnce(
          createSelectChain({
            id: STEP_ID,
            executionId: EXECUTION_ID,
            checkpointData: {},
          }),
        )
        .mockReturnValueOnce(
          createSelectChain({
            createdBy: USER_ID,
          }),
        );
      mockSessionPersistence.loadFromCheckpoint.mockResolvedValue(null);
      mockSandboxService.findByExecutionId.mockResolvedValue(
        mockSandboxSession(),
      );
      mockWorkspaceService.createFromSandbox.mockResolvedValue({
        id: WORKSPACE_SNAPSHOT_ID,
      });

      const snapshotId = await service.archiveExecutionStepWorkspace(
        EXECUTION_ID,
        STEP_ID,
        TENANT_ID,
        SANDBOX_NODE_ID,
      );

      expect(snapshotId).toBe(WORKSPACE_SNAPSHOT_ID);
      expect(mockSandboxService.findByExecutionId).toHaveBeenCalledWith(
        EXECUTION_ID,
        TENANT_ID,
        SANDBOX_NODE_ID,
      );
    });
  });

  describe('handleConversationEnded', () => {
    it('应先保存目录树快照，再释放 conversation sandbox', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession({
          config: { persistencePath: '/data/workspaces' },
        }),
      );
      setupExecWithOutput(['f|24|workspace/summary.txt'].join('\n'));
      mockDb.select.mockReturnValue(
        createSelectChain({
          id: CONVERSATION_ID,
          metadata: {},
        }),
      );
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.handleConversationEnded({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
      });

      expect(updateChain.set).toHaveBeenCalled();
      expect(mockSandboxService.endConversationSandbox).toHaveBeenCalledWith(
        CONVERSATION_ID,
        TENANT_ID,
      );
      expect(updateChain.set.mock.invocationCallOrder[0]).toBeLessThan(
        mockSandboxService.endConversationSandbox.mock.invocationCallOrder[0],
      );
    });

    it('目录树保存路径没有 live session 时也应尝试释放 conversation sandbox', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);

      await service.handleConversationEnded({
        conversationId: CONVERSATION_ID,
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
      });

      expect(mockSandboxService.findByConversationId).toHaveBeenCalledWith(
        CONVERSATION_ID,
        TENANT_ID,
      );
      expect(mockSandboxService.endConversationSandbox).toHaveBeenCalledWith(
        CONVERSATION_ID,
        TENANT_ID,
      );
    });

    it('释放 sandbox 失败时应吞掉异常，避免结束事件链路中断', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(null);
      mockSandboxService.endConversationSandbox.mockRejectedValue(
        new Error('cleanup failed'),
      );

      await expect(
        service.handleConversationEnded({
          conversationId: CONVERSATION_ID,
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          userId: USER_ID,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('stopAllWatchers', () => {
    it('应清理所有活跃的监听器', () => {
      setupExecWithOutput('');

      service.startFileWatcher('conv-a', TENANT_ID, 'container-a');
      service.startFileWatcher('conv-b', TENANT_ID, 'container-b');

      service.stopAllWatchers();

      expect(true).toBe(true);
    });
  });

  describe('parseFileTree 边界情况', () => {
    beforeEach(() => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );
    });

    it('嵌套目录结构应正确构建', async () => {
      const findOutput = [
        'd|0|src',
        'd|0|src/utils',
        'f|100|src/utils/helper.ts',
        'f|200|src/main.ts',
      ].join('\n');
      setupExecWithOutput(findOutput);

      const result = await service.getFileTree(CONVERSATION_ID, TENANT_ID);

      expect(result).toHaveLength(1);
      const srcDir = result[0];
      expect(srcDir.name).toBe('src');
      expect(srcDir.children).toHaveLength(2);

      const utilsDir = srcDir.children!.find((n) => n.name === 'utils');
      expect(utilsDir).toBeDefined();
      expect(utilsDir!.children).toHaveLength(1);
      expect(utilsDir!.children![0].name).toBe('helper.ts');
    });

    it('格式不正确的行应被跳过', async () => {
      const findOutput = [
        'bad-line',
        'f|100|valid.txt',
        'incomplete|data',
      ].join('\n');
      setupExecWithOutput(findOutput);

      const result = await service.getFileTree(CONVERSATION_ID, TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid.txt');
    });
  });

  describe('normalizePath 安全性', () => {
    it('多层 .. 穿越应被拒绝', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      await expect(
        service.getFileContent(
          CONVERSATION_ID,
          TENANT_ID,
          'a/b/../../../../etc/shadow',
        ),
      ).rejects.toThrow('路径穿越被拒绝');
    });

    it('前导斜杠应被剥离', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );
      setupExecWithSequentialOutputs(['50|regular file', 'data', 'data']);

      const result = await service.getFileContent(
        CONVERSATION_ID,
        TENANT_ID,
        '///src/main.ts',
      );

      expect(result.path).toBe('src/main.ts');
    });
  });

  describe('exec 失败', () => {
    it('命令执行失败应抛出 NotFoundException', async () => {
      mockSandboxService.findByConversationId.mockResolvedValue(
        mockSandboxSession(),
      );

      mockDockerService.createExec.mockResolvedValue({ execId: 'exec-fail' });
      mockDockerService.attachExecOutput.mockImplementation(
        async (
          _execId: string,
          callback: (level: string, message: string) => void,
        ) => {
          callback('stdout', 'No such file');
        },
      );
      mockDockerService.waitForExecExit.mockResolvedValue({
        running: false,
        exitCode: 1,
        pid: 123,
      });

      await expect(
        service.getFileTree(CONVERSATION_ID, TENANT_ID),
      ).rejects.toThrow('命令执行失败');
    });
  });
});
