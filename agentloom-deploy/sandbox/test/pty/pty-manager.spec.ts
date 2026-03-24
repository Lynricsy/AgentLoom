import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PTYEvent } from '../../src/pty/types.js';
import { PTYManager } from '../../src/pty/pty-manager.js';

type ExitPayload = {
  exitCode?: number;
  signal?: number | string;
};

interface MockPtyProcess {
  pid: number;
  process: string;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (event: ExitPayload) => void) => void;
  emitData: (data: string) => void;
  emitExit: (event: ExitPayload) => void;
}

const mockState = vi.hoisted(() => {
  const dataListeners = new Map<number, Array<(data: string) => void>>();
  const exitListeners = new Map<number, Array<(event: ExitPayload) => void>>();
  const processes: MockPtyProcess[] = [];
  let nextPid = 1000;

  const createProcess = (): MockPtyProcess => {
    const pid = nextPid++;
    dataListeners.set(pid, []);
    exitListeners.set(pid, []);

    const process: MockPtyProcess = {
      pid,
      process: 'bash',
      write: vi.fn(),
      kill: vi.fn(),
      onData: (listener) => {
        dataListeners.get(pid)?.push(listener);
      },
      onExit: (listener) => {
        exitListeners.get(pid)?.push(listener);
      },
      emitData: (data) => {
        for (const listener of dataListeners.get(pid) ?? []) {
          listener(data);
        }
      },
      emitExit: (event) => {
        for (const listener of exitListeners.get(pid) ?? []) {
          listener(event);
        }
      },
    };

    processes.push(process);
    return process;
  };

  return {
    processes,
    spawnMock: vi.fn(() => createProcess()),
    reset: () => {
      processes.length = 0;
      dataListeners.clear();
      exitListeners.clear();
      nextPid = 1000;
    },
  };
});

vi.mock('node-pty', () => ({
  spawn: mockState.spawnMock,
}));

describe('PTYManager', () => {
  let events: PTYEvent[];
  let manager: PTYManager;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockState.reset();
    events = [];
    manager = new PTYManager({}, (event) => {
      events.push(event);
    });
  });

  it('should spawn a session with running status and emit pty_spawned', () => {
    const info = manager.spawn({
      command: 'bash',
      args: ['-lc', 'pwd'],
      cwd: '/workspace',
      env: { TERM: 'xterm-256color' },
      notifyOnExit: true,
      title: 'Workspace shell',
    });

    expect(info.id).toMatch(/^pty_[0-9a-f]{8}$/);
    expect(info.status).toBe('running');
    expect(info.command).toBe('bash');
    expect(info.args).toEqual(['-lc', 'pwd']);
    expect(info.cwd).toBe('/workspace');
    expect(info.notifyOnExit).toBe(true);
    expect(info.cols).toBe(120);
    expect(info.rows).toBe(40);
    expect(info.lineCount).toBe(0);
    expect(mockState.spawnMock).toHaveBeenCalledWith('bash', ['-lc', 'pwd'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: '/workspace',
      env: expect.objectContaining({ TERM: 'xterm-256color' }),
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'pty_spawned',
      sessionId: info.id,
    });
  });

  it('should forward writes to the PTY process including Ctrl+C', () => {
    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    manager.write(info.id, '\x03');

    expect(mockProcess.write).toHaveBeenCalledWith('\x03');
  });

  it('should read ring buffer content populated from PTY output events', () => {
    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    mockProcess.emitData('alpha\nbeta\n');

    expect(manager.read({ id: info.id })).toEqual({
      lines: ['  1: alpha', '  2: beta'],
      totalLines: 2,
      hasMore: false,
    });
    expect(events).toContainEqual({
      type: 'pty_output',
      sessionId: info.id,
      data: 'alpha\nbeta\n',
    });
  });

  it('should filter reads by pattern and preserve original line numbers', () => {
    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    mockProcess.emitData('alpha\nBeta\nalphabet\n');

    expect(
      manager.read({ id: info.id, pattern: 'alpha', ignoreCase: true, offset: 1, limit: 1 }),
    ).toEqual({
      lines: ['  3: alphabet'],
      totalLines: 2,
      hasMore: false,
    });
  });

  it('should list running and exited sessions', () => {
    const first = manager.spawn({ command: 'bash', title: 'first' });
    const second = manager.spawn({ command: 'bash', title: 'second' });

    mockState.processes[1]?.emitExit({ exitCode: 0 });

    expect(manager.list()).toEqual([
      expect.objectContaining({ id: first.id, status: 'running', title: 'first' }),
      expect.objectContaining({ id: second.id, status: 'exited', title: 'second', exitCode: 0 }),
    ]);
  });

  it('should transition running -> killing -> killed and emit kill events', () => {
    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    manager.kill(info.id);

    expect(manager.getSession(info.id)?.status).toBe('killing');
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

    mockProcess.emitExit({ exitCode: 130, signal: 'SIGTERM' });

    expect(manager.getSession(info.id)?.status).toBe('killed');
    expect(events).toContainEqual({
      type: 'pty_exit',
      sessionId: info.id,
      exitCode: 130,
      exitSignal: 'SIGTERM',
    });
    expect(events).toContainEqual({ type: 'pty_killed', sessionId: info.id });
  });

  it('should mark natural exits as exited and store exit details', () => {
    const info = manager.spawn({ command: 'bash' });

    mockState.processes[0]?.emitExit({ exitCode: 0 });

    expect(manager.getSession(info.id)).toMatchObject({
      status: 'exited',
      exitCode: 0,
    });
    expect(events).toContainEqual({
      type: 'pty_exit',
      sessionId: info.id,
      exitCode: 0,
      exitSignal: undefined,
    });
  });

  it('should force SIGKILL after kill timeout when process does not exit', () => {
    vi.useFakeTimers();
    manager = new PTYManager({ killTimeout: 5_000 }, (event) => {
      events.push(event);
    });

    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    manager.kill(info.id, 'SIGTERM');
    vi.advanceTimersByTime(4_999);

    expect(mockProcess.kill).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);

    expect(mockProcess.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('should clear pending force-kill timer when process exits before timeout', () => {
    vi.useFakeTimers();
    manager = new PTYManager({ killTimeout: 5_000 }, (event) => {
      events.push(event);
    });

    const info = manager.spawn({ command: 'bash' });
    const mockProcess = mockState.processes[0];

    manager.kill(info.id, 'SIGTERM');
    mockProcess.emitExit({ exitCode: 0, signal: 'SIGTERM' });
    vi.advanceTimersByTime(5_000);

    expect(mockProcess.kill).toHaveBeenCalledTimes(1);
  });

  it('should cleanup all active sessions and remove cleaned sessions after exit', () => {
    const first = manager.spawn({ command: 'bash' });
    const second = manager.spawn({ command: 'bash' });

    mockState.processes[1]?.emitExit({ exitCode: 0 });

    manager.cleanup();

    expect(mockState.processes[0]?.kill).toHaveBeenCalledWith('SIGKILL');
    expect(manager.list()).toHaveLength(1);

    mockState.processes[0]?.emitExit({ exitCode: 137, signal: 'SIGKILL' });

    expect(manager.list()).toEqual([]);
    expect(manager.getSession(first.id)).toBeNull();
    expect(manager.getSession(second.id)).toBeNull();
  });

  it('should enforce maxSessions using only active sessions', () => {
    manager = new PTYManager({ maxSessions: 1 });
    const first = manager.spawn({ command: 'bash' });

    expect(() => manager.spawn({ command: 'bash' })).toThrow(/maximum/i);

    mockState.processes[0]?.emitExit({ exitCode: 0 });

    expect(() => manager.spawn({ command: 'bash' })).not.toThrow();
    expect(manager.getSession(first.id)?.status).toBe('exited');
  });

  it('should throw for missing sessions on kill and read', () => {
    expect(() => manager.kill('pty_missing')).toThrow(/not found/i);
    expect(() => manager.read({ id: 'pty_missing' })).toThrow(/not found/i);
  });

  it('should return complete buffer dump including pending partial line', () => {
    const info = manager.spawn({ command: 'bash' });

    mockState.processes[0]?.emitData('alpha\nbeta');

    expect(manager.getBufferDump(info.id)).toBe('alpha\nbeta');
  });
});
