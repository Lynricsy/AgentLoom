import path from 'node:path';
import { Type } from '@sinclair/typebox';

import { PTYManager } from './pty/pty-manager.js';
import type { PTYEvent } from './pty/types.js';
import type {
  PiExtensionAPI,
  PiToolDefinition,
  PiAgentToolResult,
} from './agentloom-extension.js';

interface PtyPiExtensionAPI extends PiExtensionAPI {
  on(event: 'session_shutdown', handler: () => void | Promise<void>): void;
  on(event: string, handler: Function): void;
  sendUserMessage(content: string): void;
}

export interface PtyExtensionOptions {
  onPtyEvent: (event: PTYEvent) => void;
  workdir: string;
}

export interface PtyExtensionResult {
  register: (pi: PtyPiExtensionAPI) => void;
  manager: PTYManager;
}

const WORKSPACE_PREFIX = '/workspace/';

const PtySpawnSchema = Type.Object({
  command: Type.String({ description: 'Command to execute' }),
  args: Type.Optional(Type.Array(Type.String(), { description: 'Command arguments' })),
  cwd: Type.Optional(Type.String({ description: 'Working directory (must be under /workspace/)' })),
  env: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Environment variables' })),
  title: Type.Optional(Type.String({ description: 'Human-readable session title' })),
  notifyOnExit: Type.Optional(Type.Boolean({ description: 'Send notification when process exits' })),
  cols: Type.Optional(Type.Number({ description: 'Terminal columns (default: 120)' })),
  rows: Type.Optional(Type.Number({ description: 'Terminal rows (default: 40)' })),
});

const PtyWriteSchema = Type.Object({
  id: Type.String({ description: 'PTY session ID (pty_XXXXXXXX)' }),
  data: Type.String({ description: 'Text to write (supports escape sequences like \\n, \\x03)' }),
});

const PtyReadSchema = Type.Object({
  id: Type.String({ description: 'PTY session ID (pty_XXXXXXXX)' }),
  offset: Type.Optional(Type.Number({ description: '0-based line offset (default: 0)' })),
  limit: Type.Optional(Type.Number({ description: 'Max lines to return (default: 500)' })),
  pattern: Type.Optional(Type.String({ description: 'Regex pattern to filter lines' })),
  ignoreCase: Type.Optional(Type.Boolean({ description: 'Case-insensitive pattern matching' })),
});

const PtyListSchema = Type.Object({});

const PtyKillSchema = Type.Object({
  id: Type.String({ description: 'PTY session ID (pty_XXXXXXXX)' }),
  signal: Type.Optional(Type.String({ description: 'Signal to send (default: SIGTERM)' })),
  cleanup: Type.Optional(Type.Boolean({ description: 'Remove session from list after kill' })),
});

function validateCwd(workdir: string, cwd?: string): string {
  if (!cwd) return workdir;
  const resolved = path.resolve(workdir, cwd);
  if (!resolved.startsWith(WORKSPACE_PREFIX)) {
    throw new Error(`cwd must be under ${WORKSPACE_PREFIX} — got: ${resolved}`);
  }
  return resolved;
}

function wrapExecute(
  fn: (params: Record<string, unknown>) => unknown,
): PiToolDefinition['execute'] {
  return async (
    _toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<PiAgentToolResult> => {
    try {
      const result = fn(params);
      const resolved = result instanceof Promise ? await result : result;
      const text =
        typeof resolved === 'string'
          ? resolved
          : JSON.stringify(resolved, null, 2);
      return { resultForAssistant: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { resultForAssistant: `Error: ${message}` };
    }
  };
}

export function createPtyExtension(options: PtyExtensionOptions): PtyExtensionResult {
  let piRef: PtyPiExtensionAPI | null = null;

  const handlePtyEvent = (event: PTYEvent): void => {
    options.onPtyEvent(event);

    if (event.type === 'pty_exit' && piRef) {
      const session = manager.getSession(event.sessionId);
      if (session?.notifyOnExit) {
        const exitInfo = event.exitCode !== undefined ? `exit code ${event.exitCode}` : 'unknown exit';
        piRef.sendUserMessage(
          `PTY session ${event.sessionId} ("${session.title}") exited — ${exitInfo}`,
        );
      }
    }
  };

  const manager = new PTYManager({}, handlePtyEvent);

  const register = (pi: PtyPiExtensionAPI): void => {
    piRef = pi;

    pi.registerTool({
      name: 'pty_spawn',
      label: 'Spawn PTY',
      description: 'Spawn a new persistent PTY (pseudo-terminal) session for running interactive or long-running processes.',
      parameters: PtySpawnSchema,
      promptSnippet: 'pty_spawn: create a persistent terminal session',
      execute: wrapExecute((params) => {
        const cwd = validateCwd(options.workdir, params.cwd as string | undefined);
        return manager.spawn({
          command: params.command as string,
          args: params.args as string[] | undefined,
          cwd,
          env: params.env as Record<string, string> | undefined,
          title: params.title as string | undefined,
          notifyOnExit: params.notifyOnExit as boolean | undefined,
          cols: params.cols as number | undefined,
          rows: params.rows as number | undefined,
        });
      }),
    } as PiToolDefinition & { promptSnippet: string });

    pi.registerTool({
      name: 'pty_write',
      label: 'Write to PTY',
      description: 'Send input data to an active PTY session. Supports text and escape sequences.',
      parameters: PtyWriteSchema,
      promptSnippet: 'pty_write: send input to a terminal session',
      execute: wrapExecute((params) => {
        manager.write(params.id as string, params.data as string);
        return { status: 'success' };
      }),
    } as PiToolDefinition & { promptSnippet: string });

    pi.registerTool({
      name: 'pty_read',
      label: 'Read PTY Output',
      description: 'Read output from a PTY session buffer with optional regex filtering and pagination.',
      parameters: PtyReadSchema,
      promptSnippet: 'pty_read: read output from a terminal session',
      execute: wrapExecute((params) =>
        manager.read({
          id: params.id as string,
          offset: params.offset as number | undefined,
          limit: params.limit as number | undefined,
          pattern: params.pattern as string | undefined,
          ignoreCase: params.ignoreCase as boolean | undefined,
        }),
      ),
    } as PiToolDefinition & { promptSnippet: string });

    pi.registerTool({
      name: 'pty_list',
      label: 'List PTY Sessions',
      description: 'List all PTY sessions (active and exited) with their status and metadata.',
      parameters: PtyListSchema,
      promptSnippet: 'pty_list: see all terminal sessions',
      execute: wrapExecute(() => manager.list()),
    } as PiToolDefinition & { promptSnippet: string });

    pi.registerTool({
      name: 'pty_kill',
      label: 'Kill PTY Session',
      description: 'Terminate a PTY session. Optionally remove it from the session list.',
      parameters: PtyKillSchema,
      promptSnippet: 'pty_kill: terminate a terminal session',
      execute: wrapExecute((params) => {
        manager.kill(
          params.id as string,
          (params.signal as string) ?? 'SIGTERM',
          (params.cleanup as boolean) ?? false,
        );
        return { status: 'success' };
      }),
    } as PiToolDefinition & { promptSnippet: string });

    pi.on('session_shutdown', () => {
      manager.cleanup();
    });
  };

  return { register, manager };
}
