/** Minimal RingBuffer interface for type reference (actual impl in T2) */
export interface RingBufferLike {
  addLine(line: string): void;
  getLines(offset?: number, limit?: number): string[];
  searchLines(
    pattern: string,
    ignoreCase?: boolean,
    offset?: number,
    limit?: number,
  ): Array<{ lineNumber: number; text: string }>;
  readonly totalLines: number;
  readonly byteSize: number;
  clear(): void;
}

/** PTY session status FSM states */
export type PTYStatus = 'running' | 'killing' | 'killed' | 'exited';

/** Full PTY session (internal, includes buffer/process refs) */
export interface PTYSession {
  id: string; // Format: pty_XXXXXXXX (8 random hex chars)
  pid: number;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  status: PTYStatus;
  exitCode?: number;
  exitSignal?: number | string;
  createdAt: Date;
  lastActivityAt: Date;
  title: string;
  notifyOnExit: boolean;
  cols: number; // Default: 120
  rows: number; // Default: 40
  // Internal refs - not serialized
  buffer: RingBufferLike;
  process: unknown; // node-pty IPty (typed as unknown to avoid import)
}

/** Serializable PTY session info for pty_list responses */
export interface PTYSessionInfo {
  id: string;
  pid: number;
  command: string;
  args: string[];
  cwd: string;
  status: PTYStatus;
  exitCode?: number;
  exitSignal?: number | string;
  createdAt: string; // ISO 8601
  lastActivityAt: string;
  title: string;
  notifyOnExit: boolean;
  cols: number;
  rows: number;
  lineCount: number; // Current buffer line count
}

/** Options for pty_spawn tool */
export interface PTYSpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  title?: string;
  notifyOnExit?: boolean;
  cols?: number; // Default: 120
  rows?: number; // Default: 40
}

/** Options for pty_read tool */
export interface PTYReadOptions {
  id: string;
  offset?: number; // 0-based line offset
  limit?: number; // Max lines to return (default 500)
  pattern?: string; // Regex pattern to filter lines
  ignoreCase?: boolean;
}

/** Result from pty_read tool */
export interface PTYReadResult {
  lines: string[]; // Lines with original line numbers preserved
  totalLines: number;
  hasMore: boolean;
}

/** Options for pty_write tool */
export interface PTYWriteOptions {
  id: string;
  data: string; // Text to write (supports escape sequences like \n, \x03)
}

/** Options for pty_kill tool */
export interface PTYKillOptions {
  id: string;
  signal?: string; // Default: 'SIGTERM'
  cleanup?: boolean; // If true, remove session from list after kill
}

/** PTY Manager configuration */
export interface PTYManagerConfig {
  maxSessions: number; // Default: 10
  maxBufferSize: number; // Default: 1048576 (1MB in chars)
  maxBufferLines: number; // Default: 50000
  defaultCols: number; // Default: 120
  defaultRows: number; // Default: 40
  killTimeout: number; // Default: 5000ms
}

/** PTY event types emitted through the event pipeline */
export type PTYEvent =
  | { type: 'pty_spawned'; sessionId: string; info: PTYSessionInfo }
  | { type: 'pty_output'; sessionId: string; data: string }
  | {
      type: 'pty_exit';
      sessionId: string;
      exitCode?: number;
      exitSignal?: number | string;
    }
  | { type: 'pty_killed'; sessionId: string }
  | { type: 'pty_error'; sessionId: string; message: string };
