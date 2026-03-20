import { describe, expect, it, vi } from 'vitest';
import type { AcpConnectionState, AcpTrackedSession } from '../acp-types';
import { AcpTerminalHandler } from '../handlers/acp-terminal.handler';

describe('AcpTerminalHandler', () => {
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

  function createState(
    trackedSession: AcpTrackedSession,
    overrides?: Partial<AcpConnectionState>,
  ): AcpConnectionState {
    return {
      initialized: true,
      authContext: {
        userId: 'user-1',
        email: 'dev@example.com',
        tenantId: 'tenant-1',
        authMethod: 'jwt',
      },
      sessions: new Map([[trackedSession.sessionId, trackedSession]]),
      ...overrides,
    };
  }

  function createHandler() {
    const terminalProxyService = {
      createTerminal: vi.fn(),
      readTerminalOutput: vi.fn(),
      waitForTerminalExit: vi.fn(),
      killTerminal: vi.fn(),
      releaseTerminal: vi.fn(),
    };

    return {
      handler: new AcpTerminalHandler(terminalProxyService as never),
      terminalProxyService,
    };
  }

  it('应在校验 terminal/create 参数后委托给 proxy service', async () => {
    const { handler, terminalProxyService } = createHandler();
    const trackedSession = createTrackedSession();
    terminalProxyService.createTerminal.mockResolvedValue({
      terminalId: 'terminal-1',
    });

    await expect(
      handler.handleCreate(
        {
          sessionId: 'session-001',
          command: 'ls',
          args: ['-la'],
          cwd: 'notes',
          outputByteLimit: 1024,
        },
        createState(trackedSession),
      ),
    ).resolves.toEqual({
      terminalId: 'terminal-1',
    });

    expect(terminalProxyService.createTerminal).toHaveBeenCalledWith(
      {
        command: 'ls',
        args: ['-la'],
        cwd: 'notes',
        mode: 'server_sandbox',
        outputByteLimit: 1024,
      },
      trackedSession,
    );
  });

  it('应在校验 terminal/output 参数后委托给 proxy service', async () => {
    const { handler, terminalProxyService } = createHandler();
    const trackedSession = createTrackedSession();
    terminalProxyService.readTerminalOutput.mockResolvedValue({
      terminalId: 'terminal-1',
      output: 'hello',
      nextOffset: 5,
      truncated: false,
    });

    await expect(
      handler.handleOutput(
        {
          sessionId: 'session-001',
          terminalId: 'terminal-1',
          offset: 0,
          outputByteLimit: 3,
        },
        createState(trackedSession),
      ),
    ).resolves.toEqual({
      terminalId: 'terminal-1',
      output: 'hello',
      nextOffset: 5,
      truncated: false,
    });

    expect(terminalProxyService.readTerminalOutput).toHaveBeenCalledWith(
      {
        terminalId: 'terminal-1',
        offset: 0,
        outputByteLimit: 3,
      },
      trackedSession,
    );
  });

  it('应在校验 terminal/wait_for_exit 参数后委托给 proxy service', async () => {
    const { handler, terminalProxyService } = createHandler();
    const trackedSession = createTrackedSession();
    terminalProxyService.waitForTerminalExit.mockResolvedValue({
      terminalId: 'terminal-1',
      status: 'exited',
      exitCode: 0,
      signal: null,
    });

    await expect(
      handler.handleWaitForExit(
        {
          sessionId: 'session-001',
          terminalId: 'terminal-1',
          timeoutMs: 250,
        },
        createState(trackedSession),
      ),
    ).resolves.toEqual({
      terminalId: 'terminal-1',
      status: 'exited',
      exitCode: 0,
      signal: null,
    });

    expect(terminalProxyService.waitForTerminalExit).toHaveBeenCalledWith(
      {
        terminalId: 'terminal-1',
        timeoutMs: 250,
      },
      trackedSession,
    );
  });

  it('应在校验 terminal/kill 参数后委托给 proxy service', async () => {
    const { handler, terminalProxyService } = createHandler();
    const trackedSession = createTrackedSession();
    terminalProxyService.killTerminal.mockResolvedValue({
      success: true,
    });

    await expect(
      handler.handleKill(
        {
          sessionId: 'session-001',
          terminalId: 'terminal-1',
        },
        createState(trackedSession),
      ),
    ).resolves.toEqual({
      success: true,
    });

    expect(terminalProxyService.killTerminal).toHaveBeenCalledWith(
      {
        terminalId: 'terminal-1',
      },
      trackedSession,
    );
  });

  it('应在校验 terminal/release 参数后委托给 proxy service', async () => {
    const { handler, terminalProxyService } = createHandler();
    const trackedSession = createTrackedSession();
    terminalProxyService.releaseTerminal.mockResolvedValue({
      success: true,
    });

    await expect(
      handler.handleRelease(
        {
          sessionId: 'session-001',
          terminalId: 'terminal-1',
        },
        createState(trackedSession),
      ),
    ).resolves.toEqual({
      success: true,
    });

    expect(terminalProxyService.releaseTerminal).toHaveBeenCalledWith(
      {
        terminalId: 'terminal-1',
      },
      trackedSession,
    );
  });

  it('应在 terminal/create 参数非法时返回 Invalid params', async () => {
    const { handler } = createHandler();

    await expect(
      handler.handleCreate(
        {
          sessionId: 'session-001',
          command: 'ls',
          args: ['-la', 123],
        },
        createState(createTrackedSession()),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });

  it('应在 session 不存在或租户不匹配时返回稳定错误', async () => {
    const { handler } = createHandler();
    const trackedSession = createTrackedSession({
      tenantId: 'tenant-2',
    });

    await expect(
      handler.handleOutput(
        {
          sessionId: 'session-001',
          terminalId: 'terminal-1',
        },
        createState(trackedSession),
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: {
        sessionId: 'session-001',
        reason: 'Session not found',
      },
    });
  });
});
