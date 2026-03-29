import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-pty (not available locally)
vi.mock('node-pty', () => ({}));

const mockPtyManagerModule = vi.hoisted(() => {
  const mockManager = {
    spawn: vi.fn(),
    write: vi.fn(),
    read: vi.fn(),
    list: vi.fn(),
    kill: vi.fn(),
    getSession: vi.fn(),
    cleanup: vi.fn(),
    getBufferDump: vi.fn(),
  };

  return {
    mockManager,
    PTYManager: vi.fn(() => mockManager),
  };
});

vi.mock('../src/pty/pty-manager.js', () => ({
  PTYManager: mockPtyManagerModule.PTYManager,
}));

import type {
  PiExtensionAPI,
  PiToolDefinition,
  PiAgentToolResult,
} from '../src/agentloom-extension.js';
import { createPtyExtension } from '../src/pty-extension.js';
import type { PTYEvent, PTYSessionInfo, PTYReadResult } from '../src/pty/types.js';

/** Extended PiExtensionAPI for PTY extension — includes session_shutdown + sendUserMessage */
interface PtyPiExtensionAPI extends PiExtensionAPI {
  on(event: 'session_shutdown', handler: () => void | Promise<void>): void;
  on(event: string, handler: Function): void;
  sendUserMessage(content: string): void;
}

function createMockPi() {
  const registeredTools: PiToolDefinition[] = [];
  const handlers: Record<string, Function[]> = {};

  const pi: PtyPiExtensionAPI = {
    registerTool(tool: PiToolDefinition) {
      registeredTools.push(tool);
    },
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    sendUserMessage: vi.fn(),
  };

  return {
    pi,
    registeredTools,
    handlers,
    getShutdownHandlers: () =>
      (handlers['session_shutdown'] ?? []) as (() => void)[],
  };
}

function findTool(tools: PiToolDefinition[], name: string): PiToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found in registered tools`);
  return tool;
}

async function executeTool(
  tool: PiToolDefinition,
  params: Record<string, unknown>,
): Promise<PiAgentToolResult> {
  return tool.execute('tc-1', params, undefined, undefined, {});
}

function readResultText(result: PiAgentToolResult): string {
  return result.content
    .flatMap((item) =>
      item.type === 'text' && typeof item.text === 'string' ? [item.text] : [],
    )
    .join('\n');
}

describe('createPtyExtension', () => {
  const { mockManager } = mockPtyManagerModule;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('factory shape', () => {
    it('returns { register, manager } with correct types', () => {
      const result = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      expect(result).toHaveProperty('register');
      expect(result).toHaveProperty('manager');
      expect(typeof result.register).toBe('function');
    });
  });

  describe('tool registration', () => {
    it('registers all 5 PTY tools via pi.registerTool()', () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      expect(mock.registeredTools).toHaveLength(5);
      const toolNames = mock.registeredTools.map((t) => t.name);
      expect(toolNames).toContain('pty_spawn');
      expect(toolNames).toContain('pty_write');
      expect(toolNames).toContain('pty_read');
      expect(toolNames).toContain('pty_list');
      expect(toolNames).toContain('pty_kill');
    });

    it('each tool has label, description, parameters, and promptSnippet', () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      for (const tool of mock.registeredTools) {
        expect(tool.label).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  describe('session_shutdown hook', () => {
    it('registers session_shutdown handler that calls manager.cleanup()', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const shutdownHandlers = mock.getShutdownHandlers();
      expect(shutdownHandlers).toHaveLength(1);

      await shutdownHandlers[0]();
      expect(mockManager.cleanup).toHaveBeenCalledOnce();
    });
  });

  describe('pty_spawn execute', () => {
    it('delegates to manager.spawn() and returns session info', async () => {
      const spawnResult: PTYSessionInfo = {
        id: 'pty_aabb1122',
        pid: 42,
        command: 'bash',
        args: [],
        cwd: '/workspace/project',
        status: 'running',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        title: 'bash',
        notifyOnExit: false,
        cols: 120,
        rows: 40,
        lineCount: 0,
      };
      mockManager.spawn.mockReturnValue(spawnResult);

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      const result = await executeTool(tool, {
        command: 'bash',
        args: ['-l'],
        title: 'My Shell',
      });

      expect(mockManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'bash',
          args: ['-l'],
          title: 'My Shell',
        }),
      );
      expect(readResultText(result)).toContain('pty_aabb1122');
    });

    it('uses workdir as default cwd when not specified', async () => {
      const spawnResult: PTYSessionInfo = {
        id: 'pty_00001111',
        pid: 1,
        command: 'ls',
        args: [],
        cwd: '/workspace/project',
        status: 'running',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        title: 'ls',
        notifyOnExit: false,
        cols: 120,
        rows: 40,
        lineCount: 0,
      };
      mockManager.spawn.mockReturnValue(spawnResult);

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      await executeTool(tool, { command: 'ls' });

      expect(mockManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/workspace/project' }),
      );
    });

    it('accepts /workspace as a valid cwd root', async () => {
      const spawnResult: PTYSessionInfo = {
        id: 'pty_root0001',
        pid: 7,
        command: 'bash',
        args: [],
        cwd: '/workspace',
        status: 'running',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        title: 'bash',
        notifyOnExit: false,
        cols: 120,
        rows: 40,
        lineCount: 0,
      };
      mockManager.spawn.mockReturnValue(spawnResult);

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      const result = await executeTool(tool, {
        command: 'bash',
        cwd: '/workspace',
      });

      expect(mockManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/workspace' }),
      );
      expect(readResultText(result)).toContain('pty_root0001');
    });
  });

  describe('cwd security restriction', () => {
    it('rejects cwd outside /workspace/', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      const result = await executeTool(tool, {
        command: 'bash',
        cwd: '/etc/passwd',
      });

      expect(readResultText(result)).toContain('Error');
      expect(readResultText(result)).toContain('/workspace/');
      expect(mockManager.spawn).not.toHaveBeenCalled();
    });

    it('rejects cwd with path traversal (../../)', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      const result = await executeTool(tool, {
        command: 'bash',
        cwd: '/workspace/project/../../etc',
      });

      expect(readResultText(result)).toContain('Error');
      expect(mockManager.spawn).not.toHaveBeenCalled();
    });

    it('allows cwd inside /workspace/', async () => {
      mockManager.spawn.mockReturnValue({
        id: 'pty_ok',
        pid: 1,
        command: 'bash',
        args: [],
        cwd: '/workspace/project/src',
        status: 'running',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        title: 'bash',
        notifyOnExit: false,
        cols: 120,
        rows: 40,
        lineCount: 0,
      });

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      await executeTool(tool, {
        command: 'bash',
        cwd: '/workspace/project/src',
      });

      expect(mockManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/workspace/project/src' }),
      );
    });
  });

  describe('pty_write execute', () => {
    it('delegates to manager.write()', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_write');
      const result = await executeTool(tool, {
        id: 'pty_abc123',
        data: 'ls -la\n',
      });

      expect(mockManager.write).toHaveBeenCalledWith('pty_abc123', 'ls -la\n');
      expect(readResultText(result)).toContain('success');
    });
  });

  describe('pty_read execute', () => {
    it('delegates to manager.read() and returns result', async () => {
      const readResult: PTYReadResult = {
        lines: ['  0: $ ls', '  1: file.txt'],
        totalLines: 2,
        hasMore: false,
      };
      mockManager.read.mockReturnValue(readResult);

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_read');
      const result = await executeTool(tool, {
        id: 'pty_abc123',
        offset: 0,
        limit: 100,
      });

      expect(mockManager.read).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pty_abc123',
          offset: 0,
          limit: 100,
        }),
      );
      expect(readResultText(result)).toContain('file.txt');
    });
  });

  describe('pty_list execute', () => {
    it('delegates to manager.list() and returns session list', async () => {
      mockManager.list.mockReturnValue([
        {
          id: 'pty_001',
          pid: 10,
          command: 'bash',
          args: [],
          cwd: '/workspace',
          status: 'running',
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          title: 'bash',
          notifyOnExit: false,
          cols: 120,
          rows: 40,
          lineCount: 50,
        },
      ]);

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_list');
      const result = await executeTool(tool, {});

      expect(mockManager.list).toHaveBeenCalled();
      expect(readResultText(result)).toContain('pty_001');
    });
  });

  describe('pty_kill execute', () => {
    it('delegates to manager.kill() with default signal', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_kill');
      const result = await executeTool(tool, {
        id: 'pty_abc123',
      });

      expect(mockManager.kill).toHaveBeenCalledWith('pty_abc123', 'SIGTERM', false);
      expect(readResultText(result)).toContain('success');
    });

    it('passes signal and cleanup options', async () => {
      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_kill');
      await executeTool(tool, {
        id: 'pty_abc123',
        signal: 'SIGKILL',
        cleanup: true,
      });

      expect(mockManager.kill).toHaveBeenCalledWith('pty_abc123', 'SIGKILL', true);
    });
  });

  describe('exit notification', () => {
    it('calls pi.sendUserMessage() on pty_exit when notifyOnExit=true', () => {
      let capturedOnPtyEvent: ((event: PTYEvent) => void) | undefined;

      // Capture the onPtyEvent callback passed to PTYManager constructor
      mockPtyManagerModule.PTYManager.mockImplementation(
        (_config: unknown, onPtyEvent?: (event: PTYEvent) => void) => {
          capturedOnPtyEvent = onPtyEvent;
          return mockManager;
        },
      );

      // Make getSession return a session with notifyOnExit=true
      mockManager.getSession.mockReturnValue({
        id: 'pty_notify1',
        notifyOnExit: true,
        title: 'Build Server',
        command: 'npm',
        args: ['run', 'build'],
      });

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      // Simulate a pty_exit event
      expect(capturedOnPtyEvent).toBeDefined();
      capturedOnPtyEvent!({
        type: 'pty_exit',
        sessionId: 'pty_notify1',
        exitCode: 0,
      });

      expect(mock.pi.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining('pty_notify1'),
      );
    });

    it('does NOT call pi.sendUserMessage() when notifyOnExit=false', () => {
      let capturedOnPtyEvent: ((event: PTYEvent) => void) | undefined;

      mockPtyManagerModule.PTYManager.mockImplementation(
        (_config: unknown, onPtyEvent?: (event: PTYEvent) => void) => {
          capturedOnPtyEvent = onPtyEvent;
          return mockManager;
        },
      );

      mockManager.getSession.mockReturnValue({
        id: 'pty_silent',
        notifyOnExit: false,
        title: 'Silent',
        command: 'bash',
        args: [],
      });

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      capturedOnPtyEvent!({
        type: 'pty_exit',
        sessionId: 'pty_silent',
        exitCode: 0,
      });

      expect(mock.pi.sendUserMessage).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns error message when manager.spawn() throws', async () => {
      mockManager.spawn.mockImplementation(() => {
        throw new Error('Maximum PTY sessions exceeded (5)');
      });

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_spawn');
      const result = await executeTool(tool, { command: 'bash' });

      expect(readResultText(result)).toContain('Error');
      expect(readResultText(result)).toContain('Maximum PTY sessions exceeded');
    });

    it('returns error message when manager.write() throws', async () => {
      mockManager.write.mockImplementation(() => {
        throw new Error('PTY session not found: pty_invalid');
      });

      const { register } = createPtyExtension({
        onPtyEvent: vi.fn(),
        workdir: '/workspace/project',
      });

      const mock = createMockPi();
      register(mock.pi);

      const tool = findTool(mock.registeredTools, 'pty_write');
      const result = await executeTool(tool, {
        id: 'pty_invalid',
        data: 'test',
      });

      expect(readResultText(result)).toContain('Error');
      expect(readResultText(result)).toContain('PTY session not found');
    });
  });
});
