import type { ToolSet } from 'ai';
import { flexibleSchemaToJsonSchema } from './tool-schema-converter';

// Inline replica of pi-agent-core AgentTool<TSchema> to avoid static ESM import
// See: pi/packages/agent/src/types.ts AgentTool interface
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
 * AI SDK v7 允许 `description` 是「按 context 动态求值」的函数。
 * pi-agent-core 的 AgentTool 只接受静态字符串，且 pi 侧没有 tool context 概念，
 * 因此函数形态在转换时以空 context 求值一次，取其静态快照。
 */
export function resolveToolDescription(tool: ToolSet[string]): string {
  const { description } = tool;

  if (typeof description === 'function') {
    return description({ context: undefined });
  }

  return description ?? '';
}

/**
 * Convert a single AgentLoom MCP tool (Vercel AI SDK `CoreTool` format) to a
 * pi-agent-core compatible `AgentTool`.
 *
 * The tool's flexible `inputSchema` is normalized to a plain JSON Schema shape
 * via `flexibleSchemaToJsonSchema()`. The `execute` wrapper adapts the Vercel
 * AI SDK callback signature to pi's signature.
 */
export function convertMcpToolToPiTool(
  name: string,
  tool: ToolSet[string],
): PiAgentTool {
  return {
    name,
    label: name,
    description: resolveToolDescription(tool),
    parameters: flexibleSchemaToJsonSchema(
      tool.inputSchema as Parameters<typeof flexibleSchemaToJsonSchema>[0],
    ),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
    ) => {
      if (!tool.execute) {
        return {
          content: [
            { type: 'text' as const, text: 'Tool has no execute function' },
          ],
          details: null,
        };
      }

      const result = await tool.execute(params as never, {
        toolCallId,
        messages: [],
        abortSignal: signal,
        // v7 起 context 是必填字段；pi 侧无 tool context，显式传 undefined。
        context: undefined,
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
