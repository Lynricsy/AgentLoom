import { requestPermission } from './event-stream.js';
import type { PermissionCallbackRequest } from './types.js';

export interface AgentLoomExtensionOptions {
  permissionCallbackUrl?: string;
  sessionId: string;
  onEvent?: (event: AgentLoomExtensionEvent) => void;
}

export type AgentLoomExtensionEvent =
  | {
      type: 'tool_execution_start';
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | {
      type: 'tool_permission_denied';
      toolCallId: string;
      toolName: string;
      input: unknown;
    };

/**
 * Structural compatibility with pi-coding-agent ExtensionAPI.
 * Uses structural typing instead of hard import to avoid tight coupling.
 */
export interface PiExtensionAPI {
  registerTool(tool: PiToolDefinition): void;
  on(
    event: 'tool_call',
    handler: (
      event: PiToolCallEvent,
      ctx: unknown,
    ) => PiToolCallEventResult | Promise<PiToolCallEventResult | void> | void,
  ): void;
  on(
    event: 'tool_execution_start',
    handler: (event: PiToolExecutionStartEvent, ctx: unknown) => void,
  ): void;
  on(
    event: 'tool_execution_end',
    handler: (event: PiToolExecutionEndEvent, ctx: unknown) => void,
  ): void;
}

export interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<PiAgentToolResult>;
}

export interface PiAgentToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: unknown;
}

export function createTextToolResult(
  text: string,
  details: unknown = undefined,
): PiAgentToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

export function formatToolTextResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return 'null';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface PiToolCallEvent {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface PiToolCallEventResult {
  block?: boolean;
  reason?: string;
}

export interface PiToolExecutionStartEvent {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface PiToolExecutionEndEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

export type ExtensionFactory = (pi: PiExtensionAPI) => void | Promise<void>;

export function createAgentLoomExtension(
  options: AgentLoomExtensionOptions,
): ExtensionFactory {
  const { permissionCallbackUrl, sessionId, onEvent } = options;

  return (pi: PiExtensionAPI): void => {
    if (permissionCallbackUrl) {
      pi.on(
        'tool_call',
        async (
          event: PiToolCallEvent,
        ): Promise<PiToolCallEventResult | void> => {
          const payload: PermissionCallbackRequest = {
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            input: event.input,
            sessionId,
          };

          const allowed = await requestPermission(
            permissionCallbackUrl,
            payload,
          );

          if (!allowed) {
            onEvent?.({
              type: 'tool_permission_denied',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
            });
            return { block: true, reason: 'Permission denied by AgentLoom' };
          }

          return { block: false };
        },
      );
    }

    if (onEvent) {
      pi.on(
        'tool_execution_start',
        (event: PiToolExecutionStartEvent): void => {
          onEvent({
            type: 'tool_execution_start',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          });
        },
      );

      pi.on('tool_execution_end', (event: PiToolExecutionEndEvent): void => {
        onEvent({
          type: 'tool_execution_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
          isError: event.isError,
        });
      });
    }
  };
}
