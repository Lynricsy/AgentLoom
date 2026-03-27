import { randomBytes } from 'node:crypto';

// node-pty is provided in the sandbox runtime image and mocked in unit tests.
import { spawn as nodePtySpawn } from 'node-pty';

import { RingBuffer } from './ring-buffer.js';
import type {
  PTYEvent,
  PTYManagerConfig,
  PTYReadOptions,
  PTYReadResult,
  PTYSession,
  PTYSessionInfo,
  PTYSpawnOptions,
} from './types.js';

const DEFAULT_CONFIG: PTYManagerConfig = {
  maxSessions: 5,
  maxBufferSize: 1_048_576,
  maxBufferLines: 50_000,
  defaultCols: 120,
  defaultRows: 40,
  killTimeout: 5_000,
};

const DEFAULT_READ_LIMIT = 500;

interface IPtyExitEvent {
  exitCode?: number;
  signal?: number | string;
}

interface IPty {
  pid: number;
  process: string;
  write(data: string): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: IPtyExitEvent) => void): void;
}

interface IPtyForkOptions {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

interface NodePtyModule {
  spawn(file: string, args?: string[], options?: IPtyForkOptions): IPty;
}

const spawnPty = nodePtySpawn as unknown as NodePtyModule['spawn'];

export class PTYManager {
  private readonly config: PTYManagerConfig;

  private readonly sessions = new Map<string, PTYSession>();

  private readonly killTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly cleanupOnExit = new Set<string>();

  constructor(
    config: Partial<PTYManagerConfig> = {},
    private readonly onPtyEvent?: (event: PTYEvent) => void,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  spawn(options: PTYSpawnOptions): PTYSessionInfo {
    if (this.getActiveSessionCount() >= this.config.maxSessions) {
      throw new Error(`Maximum PTY sessions exceeded (${this.config.maxSessions})`);
    }

    const id = this.generateId();
    const args = options.args ?? [];
    const cwd = options.cwd ?? process.cwd();
    const buffer = new RingBuffer(this.config.maxBufferSize, this.config.maxBufferLines);
    const title =
      options.title ??
      (`${options.command} ${args.join(' ')}`.trim() || `Terminal ${id.slice(-4)}`);

    let processRef: IPty;

    try {
      processRef = spawnPty(options.command, args, {
        name: 'xterm-256color',
        cols: this.config.defaultCols,
        rows: this.config.defaultRows,
        cwd,
        env: {
          ...process.env,
          ...options.env,
        },
      });
    } catch (error) {
      this.emit({
        type: 'pty_error',
        sessionId: id,
        message: error instanceof Error ? error.message : 'Failed to spawn PTY session',
      });
      throw error;
    }

    const now = new Date();
    const session: PTYSession = {
      id,
      pid: processRef.pid,
      command: options.command,
      args,
      cwd,
      env: options.env,
      status: 'running',
      createdAt: now,
      lastActivityAt: now,
      title,
      notifyOnExit: options.notifyOnExit ?? false,
      cols: this.config.defaultCols,
      rows: this.config.defaultRows,
      buffer,
      process: processRef,
    };

    processRef.onData((data: string) => {
      this.handleData(session, data);
    });

    processRef.onExit((event: IPtyExitEvent) => {
      this.handleExit(session, event);
    });

    this.sessions.set(session.id, session);

    const info = this.toInfo(session);
    this.emit({ type: 'pty_spawned', sessionId: session.id, info });
    return info;
  }

  write(id: string, data: string): void {
    const session = this.requireSession(id);

    this.getProcess(session).write(data);
    session.lastActivityAt = new Date();
  }

  read(options: PTYReadOptions): PTYReadResult {
    const session = this.requireSession(options.id);
    const buffer = this.getRingBuffer(session);
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_READ_LIMIT;

    if (!options.pattern) {
      return buffer.readLines(offset, limit);
    }

    const allMatches = buffer.searchLines(
      options.pattern,
      options.ignoreCase ?? false,
      0,
      buffer.totalLines,
    );
    const start = this.normalizeOffset(offset, allMatches.length);
    const safeLimit = Math.max(0, limit);
    const page = allMatches.slice(start, start + safeLimit);

    return {
      lines: page.map((match) => `  ${match.lineNumber}: ${match.text}`),
      totalLines: allMatches.length,
      hasMore: start + safeLimit < allMatches.length,
    };
  }

  list(): PTYSessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => this.toInfo(session));
  }

  kill(id: string, signal: string = 'SIGTERM', cleanup: boolean = false): void {
    const session = this.requireSession(id);

    if (cleanup) {
      this.cleanupOnExit.add(id);
    }

    if (session.status === 'exited' || session.status === 'killed') {
      if (cleanup) {
        this.deleteSession(id);
      }
      return;
    }

    if (session.status === 'running') {
      session.status = 'killing';
      session.lastActivityAt = new Date();

      try {
        this.getProcess(session).kill(signal);
      } catch (error) {
        session.status = 'running';
        this.cleanupOnExit.delete(id);
        this.emit({
          type: 'pty_error',
          sessionId: id,
          message: error instanceof Error ? error.message : 'Failed to kill PTY session',
        });
        throw error;
      }

      this.scheduleForceKill(session);
    }
  }

  getSession(id: string): PTYSession | null {
    return this.sessions.get(id) ?? null;
  }

  cleanup(): void {
    for (const session of Array.from(this.sessions.values())) {
      if (session.status === 'running' || session.status === 'killing') {
        this.kill(session.id, 'SIGKILL', true);
        continue;
      }

      this.deleteSession(session.id);
    }
  }

  getBufferDump(id: string): string {
    const session = this.requireSession(id);
    return this.getRingBuffer(session).getAllContent();
  }

  private handleData(session: PTYSession, data: string): void {
    this.getRingBuffer(session).write(data);
    session.lastActivityAt = new Date();
    this.emit({ type: 'pty_output', sessionId: session.id, data });
  }

  private handleExit(session: PTYSession, event: IPtyExitEvent): void {
    this.clearKillTimer(session.id);

    const wasKilling = session.status === 'killing';

    session.status = wasKilling ? 'killed' : 'exited';
    session.exitCode = event.exitCode;
    session.exitSignal = event.signal;
    session.lastActivityAt = new Date();

    this.emit({
      type: 'pty_exit',
      sessionId: session.id,
      exitCode: event.exitCode,
      exitSignal: event.signal,
    });

    if (wasKilling) {
      this.emit({ type: 'pty_killed', sessionId: session.id });
    }

    if (this.cleanupOnExit.has(session.id)) {
      this.deleteSession(session.id);
    }
  }

  private scheduleForceKill(session: PTYSession): void {
    this.clearKillTimer(session.id);

    const timer = setTimeout(() => {
      if (session.status !== 'killing') {
        return;
      }

      try {
        this.getProcess(session).kill('SIGKILL');
      } catch (error) {
        this.emit({
          type: 'pty_error',
          sessionId: session.id,
          message: error instanceof Error ? error.message : 'Failed to send SIGKILL to PTY',
        });
      }
    }, this.config.killTimeout);

    this.killTimers.set(session.id, timer);
  }

  private clearKillTimer(id: string): void {
    const timer = this.killTimers.get(id);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.killTimers.delete(id);
  }

  private deleteSession(id: string): void {
    this.clearKillTimer(id);
    this.cleanupOnExit.delete(id);

    const session = this.sessions.get(id);
    session?.buffer.clear();

    this.sessions.delete(id);
  }

  private toInfo(session: PTYSession): PTYSessionInfo {
    return {
      id: session.id,
      pid: session.pid,
      command: session.command,
      args: session.args,
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      title: session.title,
      notifyOnExit: session.notifyOnExit,
      cols: session.cols,
      rows: session.rows,
      lineCount: session.buffer.totalLines,
    };
  }

  private emit(event: PTYEvent): void {
    this.onPtyEvent?.(event);
  }

  private generateId(): string {
    return `pty_${randomBytes(4).toString('hex')}`;
  }

  private getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(
      (session) => session.status === 'running' || session.status === 'killing',
    ).length;
  }

  private normalizeOffset(offset: number, max: number): number {
    if (!Number.isFinite(offset) || offset < 0) {
      return 0;
    }

    return Math.min(offset, max);
  }

  private requireSession(id: string): PTYSession {
    const session = this.sessions.get(id);

    if (!session) {
      throw new Error(`PTY session not found: ${id}`);
    }

    return session;
  }

  private getProcess(session: PTYSession): IPty {
    return session.process as IPty;
  }

  private getRingBuffer(session: PTYSession): RingBuffer {
    return session.buffer as RingBuffer;
  }
}
