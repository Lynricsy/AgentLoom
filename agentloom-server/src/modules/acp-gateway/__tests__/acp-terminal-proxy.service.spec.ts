import { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../../agent/types/agent-session.types';
import type { AuditLogService } from '../../evidence/audit-log.service';
import type { AcpTrackedSession } from '../acp-types';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { AcpTerminalProxyService } from '../services/acp-terminal-proxy.service';

type TerminalTrackedSession = AcpTrackedSession & {
  terminalIds?: string[];
};

describe('AcpTerminalProxyService', () => {
  function createTrackedSession(
    overrides?: Partial<TerminalTrackedSession>,
  ): TerminalTrackedSession {
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

  function createService(overrides?: { runtimeSession?: AgentSession }) {
    const auditLogService = {
      record: vi.fn().mockResolvedValue(undefined),
    } satisfies Pick<AuditLogService, 'record'>;
    const runtimeSession: AgentSession = overrides?.runtimeSession ?? {
      id: 'session-001',
      agentId: 'agent-001',
      mode: 'conversation',
      context: {
        history: [],
        cwd: '/workspace/demo',
        serverSandbox: {
          executionId: '019391d4-e000-7000-0000-000000000005',
        },
      },
      status: 'active',
      tenantId: 'tenant-1',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    const runtime = {
      loadSession: vi.fn().mockResolvedValue(runtimeSession),
    };
    const sessionPersistence = {
      saveConversationSession: vi.fn().mockResolvedValue(undefined),
    };
    const sandboxTerminalService = {
      createTerminal: vi.fn(),
      attachOutput: vi.fn(),
      killTerminal: vi.fn().mockResolvedValue(undefined),
      waitForExit: vi.fn(),
    };

    return {
      service: new AcpTerminalProxyService(
        auditLogService as unknown as AuditLogService,
        sandboxTerminalService as never,
        {
          get: vi.fn().mockReturnValue(runtime),
        } as unknown as ModuleRef,
        sessionPersistence as never,
      ),
      auditLogService,
      runtime,
      runtimeSession,
      sessionPersistence,
      sandboxTerminalService,
    };
  }

  it('应创建 terminal、挂接输出采集，并以纯轮询方式返回增量输出', async () => {
    const {
      service,
      sandboxTerminalService,
      sessionPersistence,
      runtimeSession,
    } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-1',
      cwd: '/workspace/demo/notes',
    });
    sandboxTerminalService.attachOutput.mockImplementation(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'hello ');
        onOutput('stderr', 'world');
      },
    );

    const createResult = await service.createTerminal(
      {
        command: 'ls',
        args: ['-la'],
        cwd: 'notes',
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    expect(sandboxTerminalService.createTerminal).toHaveBeenCalledWith({
      trackedSession,
      command: 'ls',
      args: ['-la'],
      cwd: 'notes',
    });
    expect(sandboxTerminalService.attachOutput).toHaveBeenCalledWith(
      'exec-1',
      expect.any(Function),
    );
    expect(trackedSession.terminalIds).toEqual([createResult.terminalId]);
    expect(runtimeSession.context).toMatchObject({
      terminalContinuity: {
        terminals: [
          expect.objectContaining({
            terminalId: createResult.terminalId,
            execId: 'exec-1',
            cwd: '/workspace/demo/notes',
            status: 'running',
          }),
        ],
      },
    });
    expect(sessionPersistence.saveConversationSession).toHaveBeenCalledWith(
      runtimeSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
          offset: 0,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      terminalId: createResult.terminalId,
      output: 'hello world',
      nextOffset: 11,
      truncated: false,
    });
  });

  it('应在高风险命令被拒绝时返回稳定错误并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: 'bash',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal command is not allowed by sandbox policy',
      data: { reason: 'terminal_command_not_allowed' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        resourceId: 'session-001',
        metadata: expect.objectContaining({
          command: 'bash',
          reason: 'terminal_command_not_allowed',
        }),
      }),
    );
  });

  it('应在路径化 shell 命令绕过 denylist 前被拒绝并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: '/bin/bash',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal command is not allowed by sandbox policy',
      data: { reason: 'terminal_command_not_allowed' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: '/bin/bash',
          reason: 'terminal_command_not_allowed',
        }),
      }),
    );
  });

  it('应在 spawn 前拒绝危险破坏性参数并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: 'rm',
          args: ['-rf', '/'],
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal command is not allowed by sandbox policy',
      data: { reason: 'terminal_command_pattern_not_allowed' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: 'rm',
          reason: 'terminal_command_pattern_not_allowed',
        }),
      }),
    );
  });

  it('应在 spawn 前拒绝越界 cwd 并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          cwd: '../../..',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal cwd escapes workspace',
      data: { reason: 'terminal_cwd_escaped_workspace' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: 'ls',
          reason: 'terminal_cwd_escaped_workspace',
        }),
      }),
    );
  });

  it('应在 spawn 前拒绝 shell 注入风格参数并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          args: ['notes && cat /etc/passwd'],
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal command is not allowed by sandbox policy',
      data: { reason: 'terminal_command_pattern_not_allowed' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: 'ls',
          reason: 'terminal_command_pattern_not_allowed',
        }),
      }),
    );
  });

  it('应在 spawn 前拒绝赋值式越界路径参数并写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          args: ['--directory=../../..'],
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal command is not allowed by sandbox policy',
      data: { reason: 'terminal_command_pattern_not_allowed' },
    });

    expect(sandboxTerminalService.createTerminal).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: 'ls',
          args: ['--directory=../../..'],
          reason: 'terminal_command_pattern_not_allowed',
        }),
      }),
    );
  });

  it('应在输出采集挂接失败时 best-effort kill exec 且不提交 terminal registry', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-2',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockRejectedValue(
      new Error('attach failed'),
    );

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'ACP terminal creation failed',
    });

    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-2',
      'TERM',
    );
    expect(trackedSession.terminalIds).toBeUndefined();
  });

  it('应在 continuity 持久化失败时回滚 terminal registry、session terminalIds 与内存 continuity', async () => {
    const {
      service,
      sandboxTerminalService,
      sessionPersistence,
      runtimeSession,
    } = createService();
    const trackedSession = createTrackedSession();
    let execCounter = 0;

    sandboxTerminalService.createTerminal.mockImplementation(async () => {
      execCounter += 1;
      return {
        execId: `exec-${execCounter}`,
        cwd: '/workspace/demo',
      };
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sessionPersistence.saveConversationSession
      .mockRejectedValueOnce(new Error('persist failed'))
      .mockResolvedValue(undefined);

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'ACP terminal creation failed',
    });

    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-1',
      'TERM',
    );
    expect(trackedSession.terminalIds).toBeUndefined();
    expect(runtimeSession.context).not.toHaveProperty('terminalContinuity');

    const createdTerminalIds: string[] = [];

    for (let index = 0; index < 5; index += 1) {
      const result = await service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      );

      createdTerminalIds.push(result.terminalId);
    }

    expect(createdTerminalIds).toHaveLength(5);
    expect(trackedSession.terminalIds).toEqual(createdTerminalIds);
    expect(runtimeSession.context.terminalContinuity?.terminals).toHaveLength(
      5,
    );
  });

  it('应在超过每 session 最大并发 terminal 数时 fail-closed', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.createTerminal
      .mockResolvedValueOnce({ execId: 'exec-1', cwd: '/workspace/demo' })
      .mockResolvedValueOnce({ execId: 'exec-2', cwd: '/workspace/demo' })
      .mockResolvedValueOnce({ execId: 'exec-3', cwd: '/workspace/demo' })
      .mockResolvedValueOnce({ execId: 'exec-4', cwd: '/workspace/demo' })
      .mockResolvedValueOnce({ execId: 'exec-5', cwd: '/workspace/demo' });

    for (let index = 0; index < 5; index += 1) {
      await service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      );
    }

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal session limit exceeded',
      data: { reason: 'terminal_session_limit_exceeded' },
    });
  });

  it('应在 ring buffer 已截断旧输出时返回当前可恢复窗口，并拒绝过旧 offset', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-3',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockImplementation(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'hello');
        onOutput('stdout', 'world');
      },
    );

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['helloworld'],
        mode: 'server_sandbox',
        outputByteLimit: 5,
      },
      trackedSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      terminalId: createResult.terminalId,
      output: 'world',
      nextOffset: 10,
      truncated: true,
    });

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
          offset: 0,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal output offset has been truncated',
      data: { reason: 'terminal_output_offset_trimmed' },
    });
  });

  it('应在请求 offset 超过最新输出游标时返回稳定错误', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-4',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockImplementation(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'hello');
      },
    );

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['hello'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
          offset: 99,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: { reason: 'terminal_output_offset_invalid' },
    });
  });

  it('应按 outputByteLimit 提供 bounded retrieval 并返回下一段偏移量', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-bounded-output',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockImplementation(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'hello world');
      },
    );

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['hello world'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
          offset: 0,
          outputByteLimit: 5,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      terminalId: createResult.terminalId,
      output: 'hello',
      nextOffset: 5,
      truncated: false,
    });

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
          offset: 5,
          outputByteLimit: 3,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      terminalId: createResult.terminalId,
      output: ' wo',
      nextOffset: 8,
      truncated: false,
    });
  });

  it('应在 terminal 已退出后拒绝继续读取输出', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-output-exited',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockImplementation(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'done');
      },
    );
    sandboxTerminalService.waitForExit.mockResolvedValue({
      running: false,
      exitCode: 0,
      pid: 201,
    });

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['done'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await service.waitForTerminalExit(
      {
        terminalId: createResult.terminalId,
      },
      trackedSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message:
        'ACP terminal output is unavailable because terminal is not running',
      data: {
        reason: 'terminal_output_unavailable',
        status: 'exited',
      },
    });
  });

  it('应在 terminal 已被 kill 后拒绝继续读取输出', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-output-killed',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await service.killTerminal(
      {
        terminalId: createResult.terminalId,
      },
      trackedSession,
    );

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message:
        'ACP terminal output is unavailable because terminal is not running',
      data: {
        reason: 'terminal_output_unavailable',
        status: 'killed',
      },
    });
  });

  it('应在 wait_for_exit 后返回退出状态并持久化 continuity 元数据', async () => {
    const {
      service,
      sandboxTerminalService,
      runtimeSession,
      sessionPersistence,
    } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-wait',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.waitForExit.mockResolvedValue({
      running: false,
      exitCode: 0,
      pid: 123,
    });

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['hello'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.waitForTerminalExit(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      terminalId: createResult.terminalId,
      status: 'exited',
      exitCode: 0,
      signal: null,
    });

    expect(runtimeSession.context).toMatchObject({
      terminalContinuity: {
        terminals: [
          expect.objectContaining({
            terminalId: createResult.terminalId,
            status: 'exited',
            exitCode: 0,
            signal: null,
          }),
        ],
      },
    });
    expect(sessionPersistence.saveConversationSession).toHaveBeenCalled();
  });

  it('应兑现 wait_for_exit.timeoutMs 的请求级超时语义且不 kill 进程', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-wait-timeout',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.waitForExit.mockReturnValue(
      new Promise(() => undefined),
    );

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.waitForTerminalExit(
        {
          terminalId: createResult.terminalId,
          timeoutMs: 10,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal wait timed out',
      data: { reason: 'terminal_wait_timeout' },
    });

    expect(sandboxTerminalService.killTerminal).not.toHaveBeenCalledWith(
      'exec-wait-timeout',
      'TERM',
    );
  });

  it('应在服务端 lifetime timeout 后对 wait_for_exit 返回稳定 timeout error', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-server-timeout',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    const handleTerminalTimeout = Reflect.get(service, 'handleTerminalTimeout');
    if (typeof handleTerminalTimeout !== 'function') {
      throw new Error('handleTerminalTimeout 不可用');
    }

    await handleTerminalTimeout.call(
      service,
      createResult.terminalId,
      trackedSession,
    );

    await expect(
      service.waitForTerminalExit(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'ACP terminal execution timed out',
      data: { reason: 'terminal_timeout' },
    });

    expect(sandboxTerminalService.waitForExit).not.toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.timed_out',
      }),
    );
  });

  it('应在 kill 后稳定返回 success，并让 wait_for_exit 以 killed 状态收束', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-kill',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.waitForExit.mockResolvedValue({
      running: false,
      exitCode: 143,
      pid: 222,
    });

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.killTerminal(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      success: true,
    });
    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-kill',
      'TERM',
    );

    await expect(
      service.waitForTerminalExit(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).resolves.toMatchObject({
      terminalId: createResult.terminalId,
      status: 'killed',
      signal: 'TERM',
    });
  });

  it('应在 manual terminal/kill 时写入正式审计', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-kill-audit',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await service.killTerminal(
      {
        terminalId: createResult.terminalId,
      },
      trackedSession,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.killed',
        resourceId: trackedSession.sessionId,
        metadata: expect.objectContaining({
          terminalId: createResult.terminalId,
          execId: 'exec-kill-audit',
          reason: 'manual_kill',
        }),
      }),
    );
  });

  it('应在 release 后回收 registry 与 durable continuity，并让后续访问稳定失败', async () => {
    const { service, sandboxTerminalService, runtimeSession } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-release',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);

    const createResult = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.releaseTerminal(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).resolves.toEqual({
      success: true,
    });

    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-release',
      'TERM',
    );
    expect(trackedSession.terminalIds).toEqual([]);
    expect(runtimeSession.context.terminalContinuity?.terminals).toEqual([]);

    await expect(
      service.readTerminalOutput(
        {
          terminalId: createResult.terminalId,
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: { reason: 'terminal_not_found' },
    });
  });

  it('应在 session cleanup 时只 kill + release 当前 session 的 terminals', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();
    const trackedSessionA = createTrackedSession();
    const trackedSessionB = createTrackedSession({
      sessionId: 'session-002',
      runtimeSessionId: 'runtime-session-002',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.createTerminal
      .mockResolvedValueOnce({ execId: 'exec-a', cwd: '/workspace/demo' })
      .mockResolvedValueOnce({ execId: 'exec-b', cwd: '/workspace/demo' });

    const terminalA = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSessionA,
    );
    const terminalB = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSessionB,
    );

    await service.cleanupSessionTerminals(trackedSessionA);

    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-a',
      'TERM',
    );
    expect(sandboxTerminalService.killTerminal).not.toHaveBeenCalledWith(
      'exec-b',
      'TERM',
    );
    expect(trackedSessionA.terminalIds).toEqual([]);
    await expect(
      service.readTerminalOutput(
        {
          terminalId: terminalA.terminalId,
        },
        trackedSessionA,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: { reason: 'terminal_not_found' },
    });
    await expect(
      service.readTerminalOutput(
        {
          terminalId: terminalB.terminalId,
        },
        trackedSessionB,
      ),
    ).resolves.toMatchObject({
      terminalId: terminalB.terminalId,
    });

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.killed',
        resourceId: trackedSessionA.sessionId,
        metadata: expect.objectContaining({
          terminalId: terminalA.terminalId,
          execId: 'exec-a',
          reason: 'session_cleanup',
        }),
      }),
    );
  });

  it('应在 continuity metadata 与内存 registry 一致时完成 same-process rebind', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-rebind',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);

    const createResult = await service.createTerminal(
      {
        command: 'printf',
        args: ['ok'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    const reboundSession = createTrackedSession({
      terminalIds: undefined,
    });

    await expect(
      service.restoreTerminalContinuity(reboundSession, {
        terminals: [
          {
            terminalId: createResult.terminalId,
            execId: 'exec-rebind',
            cwd: '/workspace/demo',
            outputByteLimit: 1024 * 1024,
            status: 'running',
          },
        ],
      }),
    ).resolves.toEqual([createResult.terminalId]);
    expect(reboundSession.terminalIds).toEqual([createResult.terminalId]);
  });

  it('应在 durable continuity 存在但内存 registry 缺失时 fail-closed', async () => {
    const { service } = createService();

    await expect(
      service.restoreTerminalContinuity(createTrackedSession(), {
        terminals: [
          {
            terminalId: 'terminal-missing',
            execId: 'exec-missing',
            cwd: '/workspace/demo',
            outputByteLimit: 1024 * 1024,
            status: 'running',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to restore ACP terminal continuity',
      data: { reason: 'terminal_continuity_unavailable' },
    });
  });
  it('应拒绝不支持的 terminal mode，并在 sandbox capability 缺失时返回稳定错误', async () => {
    const { service, auditLogService } = createService();

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'local' as never,
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
    expect(auditLogService.record).not.toHaveBeenCalled();

    const unavailableService = new AcpTerminalProxyService();
    await expect(
      unavailableService.createTerminal(
        {
          command: 'ls',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'ACP server sandbox terminal service is unavailable',
      data: { reason: 'sandbox_service_unavailable' },
    });
  });

  it('应在创建失败回滚时保留调用前已有的 terminal ids，即使 best-effort kill 也失败', async () => {
    const { service, sandboxTerminalService, sessionPersistence } =
      createService();
    const trackedSession = createTrackedSession({
      terminalIds: ['terminal-existing'],
    });
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-rollback-existing',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.killTerminal.mockRejectedValue(
      new Error('kill failed'),
    );
    sessionPersistence.saveConversationSession.mockRejectedValue(
      new Error('persist failed'),
    );

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'ACP terminal creation failed',
    });

    expect(trackedSession.terminalIds).toEqual(['terminal-existing']);
    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-rollback-existing',
      'TERM',
    );
  });

  it('应在 terminal 仍运行时返回无 exitCode 的轮询状态，并让重复 kill 保持幂等', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-still-running',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.waitForExit.mockResolvedValue({
      running: true,
      exitCode: null,
      pid: 301,
    });

    const { terminalId } = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );

    await expect(
      service.waitForTerminalExit({ terminalId }, trackedSession),
    ).resolves.toEqual({
      terminalId,
      status: 'running',
      signal: null,
    });

    await service.killTerminal({ terminalId }, trackedSession);
    await expect(
      service.killTerminal({ terminalId }, trackedSession),
    ).resolves.toEqual({ success: true });
    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledTimes(1);

    await expect(
      service.releaseTerminal({ terminalId }, trackedSession),
    ).resolves.toEqual({ success: true });
    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledTimes(1);
  });

  it('应在 wait 期间被 kill 时保留 killed 状态，并接受缺失的 exitCode', async () => {
    const { service, sandboxTerminalService } = createService();
    const trackedSession = createTrackedSession();
    type ExitResult = {
      running: false;
      exitCode?: number;
      pid: number;
    };
    let resolveExit!: (value: ExitResult) => void;
    const exitPromise = new Promise<ExitResult>((resolve) => {
      resolveExit = resolve;
    });
    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-killed-during-wait',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    sandboxTerminalService.waitForExit.mockReturnValue(exitPromise);

    const { terminalId } = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );
    const waitResult = service.waitForTerminalExit(
      { terminalId },
      trackedSession,
    );
    await service.killTerminal({ terminalId }, trackedSession);
    resolveExit({ running: false, pid: 302 });

    await expect(waitResult).resolves.toEqual({
      terminalId,
      status: 'killed',
      signal: 'TERM',
    });
  });

  it('应在 cleanup 时忽略未知 terminal id，并在没有 terminalIds 时仍持久化空 continuity', async () => {
    const {
      service,
      sandboxTerminalService,
      runtimeSession,
      sessionPersistence,
    } = createService();
    const trackedSession = createTrackedSession({
      terminalIds: ['terminal-unknown'],
    });

    await service.cleanupSessionTerminals(trackedSession);

    expect(sandboxTerminalService.killTerminal).not.toHaveBeenCalled();
    expect(trackedSession.terminalIds).toEqual([]);
    expect(runtimeSession.context.terminalContinuity).toEqual({
      terminals: [],
    });

    trackedSession.terminalIds = undefined;
    await service.cleanupSessionTerminals(trackedSession);
    expect(sessionPersistence.saveConversationSession).toHaveBeenCalledTimes(2);
  });

  it('应让 timeout cleanup 对未知 terminal 幂等，并吞掉 sandbox kill 失败以保留服务可用性', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();
    const trackedSession = createTrackedSession();
    const handleTerminalTimeout = Reflect.get(service, 'handleTerminalTimeout');
    if (typeof handleTerminalTimeout !== 'function') {
      throw new Error('handleTerminalTimeout 不可用');
    }

    await expect(
      handleTerminalTimeout.call(service, 'terminal-unknown', trackedSession),
    ).resolves.toBeUndefined();

    sandboxTerminalService.createTerminal.mockResolvedValue({
      execId: 'exec-timeout-kill-failure',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockResolvedValue(undefined);
    const { terminalId } = await service.createTerminal(
      {
        command: 'sleep',
        args: ['30'],
        mode: 'server_sandbox',
      },
      trackedSession,
    );
    sandboxTerminalService.killTerminal.mockRejectedValue(
      new Error('sandbox unavailable'),
    );

    await expect(
      handleTerminalTimeout.call(service, terminalId, trackedSession),
    ).resolves.toBeUndefined();
    expect(auditLogService.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.timed_out',
      }),
    );

    sandboxTerminalService.waitForExit.mockResolvedValue({
      running: true,
      exitCode: null,
      pid: 303,
    });
    await expect(
      service.waitForTerminalExit({ terminalId }, trackedSession),
    ).resolves.toMatchObject({
      terminalId,
      status: 'running',
    });
  });

  it('应在 continuity capability 缺失或 runtime session 不匹配时 fail-closed', async () => {
    const sandboxTerminalService = {
      createTerminal: vi.fn().mockResolvedValue({
        execId: 'exec-no-persistence',
        cwd: '/workspace/demo',
      }),
      attachOutput: vi.fn().mockResolvedValue(undefined),
      killTerminal: vi.fn().mockResolvedValue(undefined),
      waitForExit: vi.fn(),
    };
    const serviceWithoutPersistence = new AcpTerminalProxyService(
      undefined,
      sandboxTerminalService as never,
      undefined,
      undefined,
    );

    await expect(
      serviceWithoutPersistence.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'ACP terminal continuity persistence is unavailable',
      data: { reason: 'terminal_continuity_persistence_unavailable' },
    });
    expect(sandboxTerminalService.killTerminal).toHaveBeenCalledWith(
      'exec-no-persistence',
      'TERM',
    );

    const { service, sandboxTerminalService: mismatchedSandbox } =
      createService({
        runtimeSession: {
          id: 'session-001',
          agentId: 'agent-001',
          mode: 'workflow',
          context: {
            history: [],
            cwd: '/workspace/demo',
          },
          status: 'active',
          tenantId: 'tenant-other',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      });
    mismatchedSandbox.createTerminal.mockResolvedValue({
      execId: 'exec-runtime-mismatch',
      cwd: '/workspace/demo',
    });
    mismatchedSandbox.attachOutput.mockResolvedValue(undefined);

    await expect(
      service.createTerminal(
        {
          command: 'ls',
          mode: 'server_sandbox',
        },
        createTrackedSession(),
      ),
    ).rejects.toMatchObject({
      code: -32603,
      message: 'Failed to restore ACP terminal continuity',
      data: { reason: 'terminal_continuity_unavailable' },
    });
    expect(mismatchedSandbox.killTerminal).toHaveBeenCalledWith(
      'exec-runtime-mismatch',
      'TERM',
    );
  });
  it('应保留完整 UTF-8 输出字符，并审计 sandbox 返回的无 reason policy error', async () => {
    const { service, sandboxTerminalService, auditLogService } =
      createService();
    const trackedSession = createTrackedSession();
    sandboxTerminalService.createTerminal.mockResolvedValueOnce({
      execId: 'exec-utf8-output',
      cwd: '/workspace/demo',
    });
    sandboxTerminalService.attachOutput.mockImplementationOnce(
      async (
        _execId: string,
        onOutput: (stream: 'stdout' | 'stderr', chunk: string) => void,
      ) => {
        onOutput('stdout', 'A😀B');
      },
    );

    const { terminalId } = await service.createTerminal(
      {
        command: 'printf',
        args: ['A😀B'],
        mode: 'server_sandbox',
        outputByteLimit: 4,
      },
      trackedSession,
    );
    await expect(
      service.readTerminalOutput({ terminalId }, trackedSession),
    ).resolves.toEqual({
      terminalId,
      output: 'B',
      nextOffset: 6,
      truncated: true,
    });

    sandboxTerminalService.createTerminal.mockRejectedValueOnce(
      new AcpJsonRpcError(-32004, 'sandbox policy rejected'),
    );
    await expect(
      service.createTerminal(
        {
          command: 'printf',
          mode: 'server_sandbox',
        },
        trackedSession,
      ),
    ).rejects.toMatchObject({
      code: -32004,
      message: 'sandbox policy rejected',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'acp.terminal.server_sandbox.rejected',
        metadata: expect.objectContaining({
          command: 'printf',
          reason: 'terminal_request_failed',
        }),
      }),
    );
  });
});
