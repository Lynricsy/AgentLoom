import type { ToolSet } from 'ai';
import { zodToTypeBox } from './tool-schema-converter';

// Inline replica of pi-agent-core AgentTool<TSchema> to avoid static ESM import
// See: pi-mono/packages/agent/src/types.ts AgentTool interface
export interface PiAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: unknown) => void,
  ) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: unknown;
  }>;
}

/**
 * Convert a single AgentLoom MCP tool (Vercel AI SDK `CoreTool` format) to a
 * pi-agent-core compatible `AgentTool`.
 *
 * The tool's Zod parameter schema is converted to TypeBox via `zodToTypeBox()`.
 * The `execute` wrapper adapts the Vercel AI SDK callback signature to pi's signature.
 */
export function convertMcpToolToPiTool(
  name: string,
  tool: ToolSet[string],
): PiAgentTool {
  return {
    name,
    label: name,
    description: tool.description ?? '',
    parameters: zodToTypeBox(tool.inputSchema as Parameters<typeof zodToTypeBox>[0]),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
    ) => {
      if (!tool.execute) {
        return {
          content: [{ type: 'text' as const, text: 'Tool has no execute function' }],
          details: null,
        };
      }

      const result = await tool.execute(params as never, {
        toolCallId,
        messages: [],
        abortSignal: signal,
      });

      const text =
        result === null || result === undefined
          ? ''
          : typeof result === 'string'
            ? result
            : JSON.stringify(result);

      return {
        content: [{ type: 'text' as const, text }],
        details: result,
      };
    },
  };
}

/**
 * Convert an entire AgentLoom ToolSet to an array of pi-agent-core AgentTool objects.
 * Returns an empty array for an empty toolset.
 */
export function convertMcpToolsToPiTools(toolSet: ToolSet): PiAgentTool[] {
  return Object.entries(toolSet).map(([name, tool]) =>
    convertMcpToolToPiTool(name, tool),
  );
}
